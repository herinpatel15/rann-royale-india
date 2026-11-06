#!/usr/bin/env node
'use strict';
/* Rann Royale – Wi-Fi multiplayer server (no dependencies).
 *   node server.js            -> serves the game + rooms on http://<this-computer>:8000
 *
 * - Serves index.html / game.js / net.js / render3d.bundle.js to phones and laptops on the same network.
 * - Players create or join a room with a 4-letter code. Each running match is simulated HERE by loading the very
 *   same game.js headless (so bots, loot, zone and combat behave exactly like single player), and every player
 *   just sends inputs and receives snapshots (20/s).
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os'), vm = require('vm');

const PORT = +process.env.PORT || 8000, ROOT = __dirname;
const TS = +process.env.RR_TIMESCALE || 1; // debug: run the simulation faster (testing only)
const MAX_PLAYERS = 12, MAX_ROOMS = 25, TICK_MS = 33, SNAP_EVERY = 0.03;
const FILES = { '/index.html': 'text/html; charset=utf-8', '/game.js': 'text/javascript; charset=utf-8', '/net.js': 'text/javascript; charset=utf-8', '/render3d.bundle.js': 'text/javascript; charset=utf-8' };

/* ------------------------------------------------------------------ static files */
const server = http.createServer((req, res) => {
  let u; try { u = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400).end(); return; }
  if (u === '/') u = '/index.html';
  if (u === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
  const type = FILES[u];
  if (!type) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  fs.readFile(path.join(ROOT, u), (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(data);
  });
});

/* ------------------------------------------------------------------ minimal WebSocket (RFC 6455) */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class Conn {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.alive = true; this.onmessage = null; this.onclose = null;
    sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); try { this.parse(); } catch (e) { this.close(); } });
    sock.on('close', () => this.finish()); sock.on('error', () => this.finish());
    sock.setNoDelay(true);
  }
  finish() { if (!this.alive) return; this.alive = false; if (this.onclose) this.onclose(); }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const op = b[0] & 15, masked = !!(b[1] & 128); let len = b[1] & 127, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) { this.close(); return; }
      const need = off + (masked ? 4 : 0) + len; if (b.length < need) return;
      let payload = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = b.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      this.buf = b.subarray(need);
      if (op === 1) { if (this.onmessage) this.onmessage(payload.toString('utf8')); }
      else if (op === 8) { this.close(); return; }
      else if (op === 9) this.frame(10, payload);
    }
  }
  frame(op, payload) {
    if (!this.alive) return;
    const n = payload.length; let h;
    if (n < 126) h = Buffer.from([128 | op, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
    this.sock.write(Buffer.concat([h, payload]));
  }
  send(str, droppable) { if (!this.alive) return; if (droppable && this.sock.writableLength > 262144) return; this.frame(1, Buffer.from(str)); }
  close() { if (this.alive) { try { this.frame(8, Buffer.alloc(0)); this.sock.end(); } catch (e) { /* ignore */ } } this.finish(); }
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  onConnect(new Conn(sock));
});

/* ------------------------------------------------------------------ headless simulation (the real game.js) */
function makeSim() {
  const noop = () => {};
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const el = () => ({ getContext: () => ctx, classList: { add: noop, remove: noop }, addEventListener: noop, style: {}, width: 1280, height: 720, clientWidth: 1280, clientHeight: 720 });
  const els = {};
  const win = { innerWidth: 1280, innerHeight: 720, addEventListener: noop, __ROLE: 'server' };
  const sandbox = {
    window: win, console, Math, Object, Array, Map, Set, Number, String, Date, JSON, Float32Array, Uint8Array,
    document: { addEventListener: noop, body: { classList: { add: noop, remove: noop } }, getElementById: id => els[id] || (els[id] = el()), createElement: () => el() },
    location: { search: '' }, navigator: { maxTouchPoints: 0 }, performance: { now: () => Date.now() }, requestAnimationFrame: noop, setTimeout: noop,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });
  return win.__rann.mp;
}

/* ------------------------------------------------------------------ rooms */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { for (let i = 0; i < 100; i++) { let c = ''; for (let k = 0; k < 4; k++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; } return null; };
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 14) || 'Player';
const jsend = (c, o, droppable) => (c.conn || c).send(JSON.stringify(o), droppable); // c = player or raw connection

function players(r) { return [...r.clients.values()]; }
function lobbyMsg(r) { return { t: 'lobby', room: r.id, host: r.host.pid, bots: r.bots, state: r.state, players: players(r).map(c => ({ pid: c.pid, name: c.name })) }; }
function broadcastLobby(r) { for (const c of players(r)) jsend(c, { ...lobbyMsg(r), you: c.pid }); }

let pidSeq = 0;
function onConnect(conn) {
  const me = { conn, pid: ++pidSeq, name: 'Player', room: null, ent: -1 };
  conn.onmessage = txt => { let m; try { m = JSON.parse(txt); } catch (e) { return; } if (m && typeof m === 'object') try { handle(me, m); } catch (e) { console.error('handler error:', e.message); } };
  conn.onclose = () => leave(me);
}

function handle(me, m) {
  const r = me.room;
  switch (m.t) {
    case 'create': {
      if (r) return;
      if (rooms.size >= MAX_ROOMS) return jsend(me.conn, { t: 'err', msg: 'Server is full – try again in a moment' });
      const id = newCode(); if (!id) return;
      me.name = cleanName(m.name);
      const room = { id, host: me, clients: new Map([[me.pid, me]]), state: 'lobby', bots: 0, sim: null, acc: 0, t0: 0 };
      rooms.set(id, room); me.room = room; console.log(`room ${id} created by ${me.name}`);
      broadcastLobby(room); break;
    }
    case 'join': {
      if (r) return;
      const room = rooms.get(String(m.room || '').toUpperCase().trim());
      if (!room) return jsend(me.conn, { t: 'err', msg: 'Room not found – check the code' });
      if (room.state !== 'lobby') return jsend(me.conn, { t: 'err', msg: 'That match already started – ask the host to go back to the lobby' });
      if (room.clients.size >= MAX_PLAYERS) return jsend(me.conn, { t: 'err', msg: 'Room is full' });
      me.name = cleanName(m.name); room.clients.set(me.pid, me); me.room = room; console.log(`${me.name} joined ${room.id}`);
      broadcastLobby(room); break;
    }
    case 'cfg': if (r && r.host === me && r.state === 'lobby') { r.bots = Math.max(0, Math.min(28, m.bots | 0)); broadcastLobby(r); } break;
    case 'start': if (r && r.host === me && r.state === 'lobby') startMatch(r); break;
    case 'again': if (r && r.host === me && r.state === 'ended') { r.state = 'lobby'; r.sim = null; for (const c of players(r)) c.ent = -1; broadcastLobby(r); } break;
    case 'in': if (r && r.state === 'play' && me.ent >= 0) r.sim.input(me.ent, m); break;
    case 'act': if (r && r.state === 'play' && me.ent >= 0) r.sim.act(me.ent, String(m.a), m.arg); break;
    case 'leave': leave(me); break;
  }
}

function startMatch(r) {
  const cs = players(r);
  if (cs.length < 2 && r.bots < 1) return jsend(r.host, { t: 'err', msg: 'Need at least 2 players – wait for a friend to join (or add bots)' });
  r.sim = makeSim();
  const total = cs.length + r.bots; // real players only unless the host adds bots
  const info = r.sim.start(cs.map(c => c.name), total);
  cs.forEach((c, i) => { c.ent = i; });
  r.state = 'play'; r.acc = 0; r.t0 = Date.now();
  console.log(`room ${r.id}: match started (${cs.length} players + ${r.bots} bots)`);
  for (const c of cs) jsend(c, { t: 'start', me: c.ent, roster: info.roster, loot: info.loot });
}

function leave(me) {
  const r = me.room; if (!r) return; me.room = null;
  r.clients.delete(me.pid);
  if (r.state === 'play' && me.ent >= 0) r.sim.drop(me.ent);
  if (!r.clients.size) { rooms.delete(r.id); console.log(`room ${r.id} closed`); return; }
  if (r.host === me) r.host = players(r)[0];
  broadcastLobby(r);
}

function sendSnapshots(r) {
  const common = JSON.stringify(r.sim.common());
  for (const c of players(r)) { if (c.ent < 0) continue; c.conn.send(common.slice(0, -1) + ',"me":' + JSON.stringify(r.sim.me(c.ent)) + '}', true); }
  r.sim.flush();
}
function endMatch(r, o) {
  sendSnapshots(r);
  r.state = 'ended';
  for (const c of players(r)) jsend(c, { t: 'over', winner: o.winner, rank: r.sim.rank(c.ent) });
  console.log(`room ${r.id}: match over, winner ${o.winner} (${Math.round((Date.now() - r.t0) / 1000)}s)`);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.1, (now - last) / 1000) * TS; last = now;
  for (const r of rooms.values()) {
    if (r.state !== 'play') continue;
    try {
      const steps = Math.max(1, Math.ceil(dt / (1 / 30)));
      for (let i = 0; i < steps; i++) r.sim.tick(dt / steps);
      r.acc += dt; if (r.acc >= SNAP_EVERY) { r.acc = 0; sendSnapshots(r); }
      const o = r.sim.over(); if (o.over) endMatch(r, o);
    } catch (e) { console.error(`room ${r.id} crashed:`, e); r.state = 'ended'; for (const c of players(r)) jsend(c, { t: 'err', msg: 'Server error – match stopped' }); }
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nRann Royale Wi-Fi server is running.\n');
  console.log('Open one of these on every phone / laptop on the same Wi-Fi:');
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`   http://${a.address}:${PORT}`);
  console.log(`   http://localhost:${PORT}   (this computer)\n\nThen: "Play with Friends" -> Create Room, and share the 4-letter code.  Ctrl+C to stop.\n`);
});
