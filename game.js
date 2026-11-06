'use strict';
/* RANN ROYALE – an original top-down Indian battle royale.
   Single player: you are Preet-18 against 29 bots. No third-party code or assets. */
(() => {
const ROLE = window.__ROLE || 'solo'; // 'solo' (browser, local bots) | 'server' (headless Node simulation for Wi-Fi rooms)
const BOT_DMG = 0.55; // bots hit softer so a match lasts several minutes
const WORLD = 4000, CELL = 250, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = Math.random;
const rr = (a, b) => a + rand() * (b - a);
const pick = a => a[Math.floor(rand() * a.length)];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const mm = document.getElementById('mini'), mctx = mm.getContext('2d');
const menuEl = document.getElementById('menu'), endEl = document.getElementById('end');

/* ---------------------------------------------------------------- data */
const WEAPONS = {
  pistol:  { name: 'Pistol',        dmg: 18, rate: 4,   spd: 1100, range: 600,  spread: .030, mag: 12, reload: 1.2, pel: 1, auto: false, ammo: 'light', rating: 1,   col: '#cfd2d6', len: 14 },
  smg:     { name: 'SMG',           dmg: 11, rate: 13,  spd: 1100, range: 520,  spread: .075, mag: 30, reload: 1.7, pel: 1, auto: true,  ammo: 'light', rating: 3,   col: '#6fb7ff', len: 20 },
  rifle:   { name: 'Assault Rifle', dmg: 22, rate: 8,   spd: 1400, range: 850,  spread: .035, mag: 30, reload: 2.1, pel: 1, auto: true,  ammo: 'heavy', rating: 4,   col: '#ff7a59', len: 26 },
  shotgun: { name: 'Shotgun',       dmg: 11, rate: 1.3, spd: 1000, range: 330,  spread: .160, mag: 6,  reload: 2.4, pel: 8, auto: false, ammo: 'shell', rating: 3,   col: '#c58cff', len: 24 },
  sniper:  { name: 'Sniper',        dmg: 80, rate: 0.9, spd: 2200, range: 1400, spread: .005, mag: 5,  reload: 2.6, pel: 1, auto: false, ammo: 'heavy', rating: 3.5, col: '#7be07b', len: 32 },
};
const WK = Object.keys(WEAPONS), AK = ['light', 'heavy', 'shell'], LT = ['weapon', 'ammo', 'heal', 'armor']; // stable indices for the network protocol
const AMMO_AMT = { light: 24, heavy: 30, shell: 8 };
const AMMO_LABEL = { light: 'Light', heavy: 'Heavy', shell: 'Shells' };
const BOT_NAMES = ['Arjun', 'Veer', 'Rohan', 'Kabir', 'Aarav', 'Ishaan', 'Dev', 'Karan', 'Rudra', 'Yash', 'Ansh', 'Neel', 'Aditya',
  'Vihaan', 'Sahil', 'Raj', 'Simran', 'Anaya', 'Diya', 'Meera', 'Kavya', 'Riya', 'Tara', 'Zoya', 'Kiran', 'Jaspreet', 'Harman', 'Gurleen', 'Lakshmi', 'Bhavya'];
const TURBANS = ['#e63946', '#1d9bf0', '#2a9d8f', '#9b5de5', '#f4d35e', '#f1f1f1', '#222', '#ff6fa5', '#138808'];
const KURTAS = ['#d9a441', '#8ecae6', '#cdb4db', '#a7c957', '#e5989b', '#b5838d', '#90be6d', '#f9c74f'];

const STYLES = {
  fort:    { floor: '#c9b48a', wall: '#8d7b63', edge: '#5e5140' },
  bazaar:  { floor: '#ead6a8', wall: '#c8553d', edge: '#7a2e22' },
  village: { floor: '#d9b97c', wall: '#b5683e', edge: '#6f3e22' },
  haveli:  { floor: '#f2dcc4', wall: '#d8508a', edge: '#8a2a55' },
  temple:  { floor: '#f6efe2', wall: '#f4a53a', edge: '#9a5d12' },
  farm:    { floor: '#cfa968', wall: '#9c7a4a', edge: '#5f4a2c' },
  camp:    { floor: '#b8d0a0', wall: '#3d7a4a', edge: '#245030' },
};

/* ---------------------------------------------------------------- world (static, seeded) */
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mrand = mulberry(18); // Preet-18's map

const grid = new Map();
const buildings = [], trees = [], waters = [], fields = [], roads = [], labels = [];
function addCollider(c) {
  const x0 = Math.floor(c.x0 / CELL), x1 = Math.floor(c.x1 / CELL), y0 = Math.floor(c.y0 / CELL), y1 = Math.floor(c.y1 / CELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = y * 100 + x; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c);
  }
}
const wallList = []; let curB = null;
function wall(x, y, w, h) { wallList.push({ x, y, w, h, b: curB }); addCollider({ t: 0, x, y, w, h, x0: x, y0: y, x1: x + w, y1: y + h }); }
function queryCols(x0, y0, x1, y1) {
  const out = [];
  const cx0 = clamp(Math.floor(x0 / CELL), 0, 15), cx1 = clamp(Math.floor(x1 / CELL), 0, 15);
  const cy0 = clamp(Math.floor(y0 / CELL), 0, 15), cy1 = clamp(Math.floor(y1 / CELL), 0, 15);
  for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const a = grid.get(y * 100 + x); if (a) for (const c of a) out.push(c); }
  return out;
}
const rectsOverlap = (a, b, p = 0) => a.x < b.x + b.w + p && a.x + a.w > b.x - p && a.y < b.y + b.h + p && a.y + a.h > b.y - p;
function blocked(x, y, w, h, pad) {
  const r = { x, y, w, h };
  return buildings.some(b => rectsOverlap(r, b, pad)) || waters.some(b => rectsOverlap(r, b, 10));
}

function mkBuilding(x, y, w, h, style, o = {}) {
  const t = o.t || 10, door = o.door || 62;
  const b = { x, y, w, h, style, t, kind: o.kind || style }; curB = b;
  const d1 = Math.floor(mrand() * 4);
  const sides = o.sides || (w > 170 || h > 170 || o.twoDoors ? [d1, (d1 + 2) % 4] : [d1]);
  for (let s = 0; s < 4; s++) {
    const horiz = s % 2 === 0, len = horiz ? w : h;
    const bx = horiz ? x : (s === 1 ? x + w - t : x), by = horiz ? (s === 0 ? y : y + h - t) : y;
    const seg = (a, e) => { if (e - a < 1) return; if (horiz) wall(bx + a, by, e - a, t); else wall(bx, by + a, t, e - a); };
    if (sides.includes(s)) {
      const g = o.center ? (len - door) / 2 : t + mrand() * (len - 2 * t - door);
      seg(0, g); seg(g + door, len);
    } else seg(0, len);
  }
  buildings.push(b); return b;
}
function cluster(cx, cy, cols, rows, cw, ch, style, w0, w1, h0, h1, skip) {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (mrand() < skip) continue;
    const w = w0 + mrand() * (w1 - w0), h = h0 + mrand() * (h1 - h0);
    const x = cx + (c - (cols - 1) / 2) * cw - w / 2 + (mrand() - .5) * 18, y = cy + (r - (rows - 1) / 2) * ch - h / 2 + (mrand() - .5) * 18;
    if (!blocked(x, y, w, h, 24)) mkBuilding(x, y, w, h, style);
  }
}

function genWorld() {
  waters.push({ x: 1400, y: 1250, w: 150, h: 2350 }, { x: 3300, y: 1750, w: 380, h: 250 }, { x: 600, y: 2050, w: 260, h: 200 });
  // fort (centre) – walled compound with four gates
  const F = { x: 1640, y: 1640, w: 720, h: 720 };
  mkBuilding(F.x, F.y, F.w, F.h, 'fort', { t: 18, door: 150, sides: [0, 1, 2, 3], center: true, kind: 'fortwall' });
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mkBuilding(2000 + dx * 215 - 70, 2000 + dy * 215 - 55, 140, 110, 'fort', { twoDoors: true });
  mkBuilding(1920, 1920, 160, 160, 'fort', { sides: [0, 1, 2, 3], door: 54, center: true, kind: 'palace' });
  // bazaar (north-west), village (north-east), haveli quarter (south-west), temple (south-east), farms (south)
  cluster(900, 850, 4, 3, 190, 170, 'bazaar', 120, 160, 100, 130, .12);
  cluster(3000, 900, 4, 3, 190, 170, 'village', 90, 130, 90, 120, .1);
  cluster(820, 3000, 3, 3, 250, 220, 'haveli', 150, 200, 120, 160, .1);
  mkBuilding(2950, 2900, 260, 210, 'temple', { twoDoors: true, kind: 'temple' });
  cluster(2950, 2950, 3, 3, 260, 220, 'temple', 90, 110, 80, 100, .7);
  cluster(2150, 3350, 3, 2, 230, 200, 'farm', 100, 140, 90, 110, .1);
  for (let i = 0; i < 16; i++) { // tent camps
    const w = rr(80, 120), h = rr(80, 110); let x, y, tries = 0;
    do { x = rr(150, WORLD - 300); y = rr(150, WORLD - 300); tries++; } while (blocked(x, y, w, h, 120) && tries < 40);
    if (tries < 40) mkBuilding(x, y, w, h, 'camp', { kind: 'camp' });
  }
  fields.push({ x: 1750, y: 3050, w: 300, h: 190 }, { x: 2480, y: 3150, w: 320, h: 200 }, { x: 1850, y: 3620, w: 360, h: 200 }, { x: 2500, y: 3560, w: 300, h: 180 },
    { x: 3400, y: 3500, w: 300, h: 230 }, { x: 250, y: 1500, w: 300, h: 220 }, { x: 600, y: 3650, w: 320, h: 190 });
  roads.push([[2000, 2000], [1500, 1500], [900, 850]], [[2000, 2000], [2500, 1500], [3000, 900]], [[2000, 2000], [1500, 2500], [820, 3000]],
    [[2000, 2000], [2500, 2500], [3050, 3000]], [[2000, 2000], [2100, 2700], [2150, 3350]], [[900, 850], [1900, 450], [3000, 900]]);
  labels.push(['Rang Mahal Qila', 2000, 1560], ['Chandni Bazaar', 900, 640], ['Gaon Pipalwadi', 3000, 690], ['Haveli Nagar', 820, 2760],
    ['Mandir Chowk', 3080, 2750], ['Khet-Khalihan', 2150, 3150], ['Ganga Ghat', 1475, 1200]);
  // trees (banyan / neem / palm)
  let n = 0, guard = 0;
  while (n < 380 && guard++ < 4000) {
    const x = rr(60, WORLD - 60), y = rr(60, WORLD - 60), kind = pick(['banyan', 'neem', 'neem', 'palm']);
    const r = kind === 'banyan' ? 30 : kind === 'neem' ? 22 : 15;
    const box = { x: x - r - 12, y: y - r - 12, w: 2 * r + 24, h: 2 * r + 24 };
    if (buildings.some(b => rectsOverlap(box, b, 6)) || waters.some(b => rectsOverlap(box, b, 0)) || fields.some(b => rectsOverlap(box, b, 0))) continue;
    trees.push({ x, y, r, kind });
    addCollider({ t: 1, x, y, r: r * .55, x0: x - r, y0: y - r, x1: x + r, y1: y + r }); n++;
  }
}
genWorld();
const inWater = (x, y) => waters.some(w => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);

/* ---------------------------------------------------------------- game state */
let state = 'menu', ents = [], bullets = [], loot = [], fx = [], floaters = [], feed = [];
let kick = 0, hitMark = 0, player = null, zone = null, time = 0, aliveCount = 0, endTimer = 0, hitFlash = 0, hitAng = 0, shake = 0;
const cam = { x: 2000, y: 2000 };
let scale = 1;
const keys = {}, mouse = { x: 0, y: 0, down: false, clicked: false };
let mode3d = false, locked = false, r3dReady = false, online = false, myId = -1, overInfo = null, lastHS = 0, lastMS = 0;
let lootSeq = 0, bulletSeq = 0, lootAdd = [], lootDel = [], outFeed = [], evs = []; const bmap = new Map(), lootById = new Map();
const view = { yaw: 0, pitch: .22 };            // 3D third-person camera angles
const glCanvas = document.getElementById('gl');
const isTouch = /[?&]touch/.test(location.search) || (navigator.maxTouchPoints > 0 && !!window.matchMedia && matchMedia('(pointer:coarse)').matches);
if (isTouch) document.body.classList.add('touch');
const requireLock = !isTouch && !/[?&]nolock/.test(location.search);
const touch = { ix: 0, iy: 0, btnFire: false, stickFire: false, aiming: false, aimA: 0, moveId: null, mx0: 0, my0: 0, mx: 0, my: 0, lookId: null, lx: 0, ly: 0, ax0: 0, ay0: 0, ax: 0, ay: 0 };
const STICK_R = 55;

function makeEnt(name, isPlayer) {
  return {
    name, isPlayer, human: isPlayer, x: 0, y: 0, r: 14, hp: 100, armor: 0, ang: rand() * TAU, vx: 0, vy: 0,
    w: [{ k: 'pistol', mag: 12 }, null], cur: 0, ammo: { light: 36, heavy: 0, shell: 0 }, heals: isPlayer ? 1 : 0,
    cd: 0, reload: 0, reloadW: null, healT: 0, kills: 0, alive: true, flash: 0, sprint: false,
    turban: isPlayer ? '#ff9933' : pick(TURBANS), kurta: isPlayer ? '#ffffff' : pick(KURTAS),
    ai: { scan: rand() * .3, target: null, react: 0, goal: null, wp: null, wpT: 0, strafe: rand() < .5 ? 1 : -1, strafeT: 0, stuckT: 0, lx: 0, ly: 0, avoidT: 0, avoidA: 0, lootT: 0, seeT: 0 },
  };
}
function spawnPoint() {
  for (let i = 0; i < 200; i++) {
    const x = rr(200, WORLD - 200), y = rr(200, WORLD - 200);
    if (inWater(x, y) || hitsWall(x, y, 22)) continue;
    if (ents.some(e => dist(e.x, e.y, x, y) < (ents.length < 30 ? 480 : 120))) continue;
    return [x, y];
  }
  return [2000, 400];
}
function hitsWall(x, y, r) {
  for (const c of queryCols(x - r, y - r, x + r, y + r)) {
    if (c.t === 0) { const cx = clamp(x, c.x, c.x + c.w), cy = clamp(y, c.y, c.y + c.h); if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true; }
    else if (dist(x, y, c.x, c.y) < r + c.r) return true;
  }
  return false;
}

function addLoot(x, y, type, k, amt, mag) { const it = { id: ++lootSeq, x, y, type, k, amt, mag }; loot.push(it); if (ROLE === 'server') lootAdd.push(it); }
function removeLoot(it) { const i = loot.indexOf(it); if (i >= 0) { loot.splice(i, 1); if (ROLE === 'server') lootDel.push(it.id); } }
const lootRow = it => [it.id, Math.round(it.x), Math.round(it.y), LT.indexOf(it.type), it.type === 'weapon' ? WK.indexOf(it.k) : it.type === 'ammo' ? AK.indexOf(it.k) : 0, it.amt | 0, it.mag | 0];
const rowToLoot = r => { const type = LT[r[3]]; return { id: r[0], x: r[1], y: r[2], type, k: type === 'weapon' ? WK[r[4]] : type === 'ammo' ? AK[r[4]] : undefined, amt: r[5], mag: r[6] }; };
function emit(t, x, y) { if (ROLE === 'server') evs.push([t, Math.round(x), Math.round(y)]); }
function randomLootItem(x, y) {
  const r = rand();
  if (r < .38) { const k = weighted({ pistol: 3, smg: 4, shotgun: 3, rifle: 3, sniper: 1.5 }); addLoot(x, y, 'weapon', k, 0, WEAPONS[k].mag); }
  else if (r < .68) { const k = weighted({ light: 45, heavy: 35, shell: 20 }); addLoot(x, y, 'ammo', k, AMMO_AMT[k]); }
  else if (r < .86) addLoot(x, y, 'heal');
  else addLoot(x, y, 'armor');
}
function weighted(o) { let t = 0; for (const k in o) t += o[k]; let r = rand() * t; for (const k in o) { r -= o[k]; if (r <= 0) return k; } return Object.keys(o)[0]; }

function newGame(opts) {
  ents = []; bullets = []; loot = []; fx = []; floaters = []; feed = []; time = 0; hitFlash = 0; shake = 0; endTimer = 0; lootSeq = 0; bulletSeq = 0; online = false;
  let nBots = 29;
  if (opts && opts.humans) { // Wi-Fi room (server): every human is a remote player, there is no local one
    player = null;
    opts.humans.forEach(n => { const h = makeEnt(n, false); h.human = h.remote = true; h.heals = 1; h.input = { mx: 0, my: 0, ang: 0, fire: false, hold: false, sprint: false, clk: 0 }; h.lastClk = 0; [h.x, h.y] = spawnPoint(); ents.push(h); });
    nBots = clamp(opts.total - opts.humans.length, 0, 29);
  } else { player = makeEnt('Preet-18', true); [player.x, player.y] = spawnPoint(); ents.push(player); }
  const names = BOT_NAMES.slice().sort(() => rand() - .5);
  for (let i = 0; i < nBots; i++) { const b = makeEnt(names[i], false); [b.x, b.y] = spawnPoint(); ents.push(b); }
  aliveCount = ents.length;
  for (const b of buildings) {
    const n = b.kind === 'fortwall' ? 10 : b.kind === 'palace' ? 6 : b.kind === 'camp' ? 2 : 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) randomLootItem(b.x + b.t + 14 + rand() * (b.w - 2 * b.t - 28), b.y + b.t + 14 + rand() * (b.h - 2 * b.t - 28));
  }
  for (let i = 0; i < 130; i++) { const [x, y] = spawnPoint(); randomLootItem(x, y); }
  zone = { cx: 2000, cy: 2000, r: 2900, phase: -1, state: 'wait', t: 0, sx: 2000, sy: 2000, sr: 2900, tx: 2000, ty: 2000, tr: 2900, dmg: 0 };
  nextPhase();
  if (!player) { state = 'play'; say('Match shuru! Toofan se bacho!'); return; }
  cam.x = player.x; cam.y = player.y;
  view.yaw = Math.atan2(2000 - player.y, 2000 - player.x); view.pitch = .22;
  { const m = /[?&]tp=(\d+),(\d+)/.exec(location.search); if (m) { player.x = +m[1]; player.y = +m[2]; } const y = /[?&]yaw=(-?[\d.]+)/.exec(location.search); if (y) view.yaw = +y[1]; } // debug teleport
  state = 'play'; mm.style.display = 'block'; menuEl.classList.add('hidden'); endEl.classList.add('hidden');
  say('Aap zameen par utre – loot karo, zone mein raho!');
  { const sm = /[?&]sim=(\d+)/.exec(location.search); // debug: fast-forward N seconds with an invulnerable player
    if (sm) for (let i = 0; i < sm[1] * 30; i++) { update(1 / 30); player.hp = 100; player.alive = true; } }
}

/* ---------------------------------------------------------------- safe zone (Toofan) */
const PHASES = [
  { wait: 45, shrink: 35, r: 1550, dmg: 1.5 }, { wait: 35, shrink: 30, r: 980, dmg: 3 }, { wait: 30, shrink: 25, r: 560, dmg: 5 },
  { wait: 25, shrink: 20, r: 260, dmg: 8 }, { wait: 20, shrink: 15, r: 90, dmg: 12 }, { wait: 10, shrink: 20, r: 0, dmg: 18 },
];
function nextPhase() {
  zone.phase++;
  const p = PHASES[zone.phase];
  if (!p) { zone.state = 'final'; zone.dmg = 25; return; }
  zone.state = 'wait'; zone.t = p.wait; zone.sx = zone.cx; zone.sy = zone.cy; zone.sr = zone.r; zone.dmg = p.dmg;
  const maxOff = Math.max(0, zone.sr - p.r) * .8, a = rand() * TAU, d = Math.sqrt(rand()) * maxOff;
  zone.tx = clamp(zone.sx + Math.cos(a) * d, 300, WORLD - 300); zone.ty = clamp(zone.sy + Math.sin(a) * d, 300, WORLD - 300); zone.tr = p.r;
  if (zone.phase > 0) say('Naya safe zone map par dikh raha hai!');
}
function updateZone(dt) {
  if (zone.state === 'final') return;
  const p = PHASES[zone.phase];
  zone.t -= dt;
  if (zone.state === 'wait' && zone.t <= 0) { zone.state = 'shrink'; zone.t = p.shrink; say('Toofan sikud raha hai!'); }
  else if (zone.state === 'shrink') {
    const f = clamp(1 - zone.t / p.shrink, 0, 1);
    zone.cx = zone.sx + (zone.tx - zone.sx) * f; zone.cy = zone.sy + (zone.ty - zone.sy) * f; zone.r = zone.sr + (zone.tr - zone.sr) * f;
    if (zone.t <= 0) nextPhase();
  }
}

/* ---------------------------------------------------------------- audio */
let ac = null;
function audio() { if (ac === null) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = false; } } return ac; }
function sfx(kind, x, y) { if (ROLE === 'server') return; try { sfx_(kind, x, y); } catch (e) { /* audio must never break the game loop */ } }
function sfx_(kind, x, y) {
  const a = audio(); if (!a || !player) return;
  const d = dist(x, y, player.x, player.y); if (d > 1100) return;
  const vol = (1 - d / 1100) ** 1.6 * .5; if (vol < .01) return;
  const t = a.currentTime;
  if (kind === 'shot') {
    const len = Math.floor(a.sampleRate * .35), buf = a.createBuffer(1, len, a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (a.sampleRate * .06));
    const src = a.createBufferSource(), lp = a.createBiquadFilter(), ng = a.createGain();
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 2600 - Math.min(2000, d * 2); ng.gain.value = vol * 1.3;
    src.connect(lp); lp.connect(ng); ng.connect(a.destination); src.start(t);
    const th = a.createOscillator(), tg = a.createGain(); th.type = 'sine'; th.frequency.setValueAtTime(140, t); th.frequency.exponentialRampToValueAtTime(40, t + .12);
    tg.gain.setValueAtTime(vol * 1.1, t); tg.gain.exponentialRampToValueAtTime(.001, t + .14); th.connect(tg); tg.connect(a.destination); th.start(t); th.stop(t + .15);
    return;
  }
  const o = a.createOscillator(), g = a.createGain(); let dur = .13;
  if (kind === 'hit') { o.type = 'square'; o.frequency.setValueAtTime(600, t); g.gain.setValueAtTime(vol * .4, t); g.gain.exponentialRampToValueAtTime(.001, t + .06); dur = .07; }
  else { o.type = 'sine'; o.frequency.setValueAtTime(kind === 'pickup' ? 660 : 330, t); o.frequency.exponentialRampToValueAtTime(kind === 'pickup' ? 990 : 200, t + .1); g.gain.setValueAtTime(vol * .5, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); }
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
}

/* ---------------------------------------------------------------- combat */
function say(t) { if (ROLE === 'server') outFeed.push(t); feed.unshift({ t, life: 6 }); if (feed.length > 6) feed.pop(); }
function curWeapon(e) { return e.w[e.cur]; }
function tryFire(e, bonus = 0) {
  const w = curWeapon(e); if (!w || e.healT > 0 || e.reload > 0 || e.cd > 0 || time < 6) return false;
  const d = WEAPONS[w.k];
  if (w.mag <= 0) { startReload(e); return false; }
  w.mag--; e.cd = 1 / d.rate; e.flash = .06; e.sc = (e.sc | 0) + 1;
  for (let i = 0; i < d.pel; i++) {
    const a = e.ang + (rand() - .5) * 2 * (d.spread + bonus);
    bullets.push({ id: ++bulletSeq, x: e.x + Math.cos(e.ang) * 24, y: e.y + Math.sin(e.ang) * 24, vx: Math.cos(a) * d.spd, vy: Math.sin(a) * d.spd, dmg: d.dmg, owner: e, left: d.range });
  }
  sfx('shot', e.x, e.y);
  if (e.isPlayer) { shake = Math.min(6, shake + (d.pel > 1 ? 4 : 1.2)); if (mode3d) { view.pitch = Math.max(-.25, view.pitch - (d.pel > 1 ? .05 : d.dmg > 50 ? .06 : .012)); view.yaw += rr(-1, 1) * (d.pel > 1 ? .01 : .004); kick = Math.min(1, kick + (d.pel > 1 ? .8 : d.dmg > 50 ? .9 : .25)); } }
  return true;
}
function startReload(e) {
  const w = curWeapon(e); if (!w || e.reload > 0) return;
  const d = WEAPONS[w.k]; if (w.mag >= d.mag || e.ammo[d.ammo] <= 0) return;
  e.reload = d.reload; e.reloadW = w; sfx('reload', e.x, e.y);
}
function finishReload(e) {
  const w = e.reloadW; e.reloadW = null; if (!w || curWeapon(e) !== w) return;
  const d = WEAPONS[w.k], take = Math.min(d.mag - w.mag, e.ammo[d.ammo]); w.mag += take; e.ammo[d.ammo] -= take;
}
function startHeal(e) { if (e.heals > 0 && e.hp < 100 && e.healT <= 0 && e.alive) e.healT = 1.8; }
function switchTo(e, i) { if (i === e.cur || !e.w[i]) return; e.cur = i; e.reload = 0; e.reloadW = null; e.cd = .25; }

function damage(e, dmg, src, ang) {
  if (!e.alive) return;
  if (e.armor > 0) { const ab = Math.min(e.armor, dmg * .5); e.armor -= ab; dmg -= ab; }
  e.hp -= dmg;
  if (e.human && src) { e.hitSeq = (e.hitSeq | 0) + 1; e.hitAng = ang; }
  if (src && src.human) src.markSeq = (src.markSeq | 0) + 1;
  if (e.isPlayer && src) { hitFlash = .35; hitAng = ang; shake = Math.min(8, shake + 3); }
  if (src && src.isPlayer) { floaters.push({ x: e.x, y: e.y - 20, text: Math.round(dmg), life: .8 }); hitMark = .2; }
  if (e.hp <= 0) kill(e, src);
}
function kill(e, src, msg) {
  e.alive = false; e.hp = 0; aliveCount--; e.rank = aliveCount + 1; emit('d', e.x, e.y);
  if (src && src !== e) { src.kills++; say(`${src.name}  ➜  ${e.name}`); } else say(msg || `${e.name} Toofan mein kho gaya`);
  for (const w of e.w) if (w) addLoot(e.x + rr(-24, 24), e.y + rr(-24, 24), 'weapon', w.k, 0, w.mag);
  for (const k of ['light', 'heavy', 'shell']) if (e.ammo[k] > 6) addLoot(e.x + rr(-24, 24), e.y + rr(-24, 24), 'ammo', k, Math.floor(e.ammo[k] / 2));
  if (e.heals) addLoot(e.x + rr(-24, 24), e.y + rr(-24, 24), 'heal');
  if (e.armor > 20) addLoot(e.x + rr(-24, 24), e.y + rr(-24, 24), 'armor');
  for (let i = 0; i < 10; i++) fx.push({ x: e.x, y: e.y, vx: rr(-140, 140), vy: rr(-140, 140), life: rr(.3, .7), c: '#c1121f' });
  if (e.isPlayer) { endTimer = 1.4; }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i], sp = Math.hypot(b.vx, b.vy), dist_ = sp * dt, n = Math.max(1, Math.ceil(dist_ / 6));
    const sx = b.vx * dt / n, sy = b.vy * dt / n, sl = dist_ / n; let dead = false;
    for (let s = 0; s < n && !dead; s++) {
      b.x += sx; b.y += sy; b.left -= sl;
      if (b.left <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) { dead = true; break; }
      for (const c of queryCols(b.x, b.y, b.x, b.y)) if (c.t === 0 && b.x > c.x && b.x < c.x + c.w && b.y > c.y && b.y < c.y + c.h) {
        dead = true; emit('w', b.x, b.y); for (let k = 0; k < 3; k++) fx.push({ x: b.x, y: b.y, vx: rr(-80, 80), vy: rr(-80, 80), life: .25, c: '#e8dcc0' }); break;
      }
      if (dead) break;
      for (const e of ents) {
        if (!e.alive || e === b.owner) continue;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + 2) ** 2) {
          damage(e, b.owner.human ? b.dmg : b.dmg * BOT_DMG, b.owner, Math.atan2(b.owner.y - e.y, b.owner.x - e.x)); emit('h', e.x, e.y); sfx('hit', e.x, e.y);
          for (let k = 0; k < 4; k++) fx.push({ x: b.x, y: b.y, vx: rr(-100, 100), vy: rr(-100, 100), life: .3, c: '#d62828' });
          dead = true; break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

/* ---------------------------------------------------------------- movement */
function resolve(e) {
  for (let pass = 0; pass < 2; pass++) for (const c of queryCols(e.x - e.r, e.y - e.r, e.x + e.r, e.y + e.r)) {
    if (c.t === 0) {
      const cx = clamp(e.x, c.x, c.x + c.w), cy = clamp(e.y, c.y, c.y + c.h), dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= e.r * e.r) continue;
      if (d2 > 1e-4) { const d = Math.sqrt(d2), p = e.r - d; e.x += dx / d * p; e.y += dy / d * p; }
      else { const l = e.x - c.x, r_ = c.x + c.w - e.x, t = e.y - c.y, b = c.y + c.h - e.y, m = Math.min(l, r_, t, b);
        if (m === l) e.x = c.x - e.r; else if (m === r_) e.x = c.x + c.w + e.r; else if (m === t) e.y = c.y - e.r; else e.y = c.y + c.h + e.r; }
    } else {
      const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy), m = e.r + c.r;
      if (d < m && d > 1e-4) { e.x += dx / d * (m - d); e.y += dy / d * (m - d); }
    }
  }
  e.x = clamp(e.x, e.r, WORLD - e.r); e.y = clamp(e.y, e.r, WORLD - e.r);
}
function moveEnt(e, dx, dy, dt) {
  const slow = inWater(e.x, e.y) ? .55 : 1, h = e.healT > 0 ? .7 : 1;
  e.x += dx * slow * h * dt; e.y += dy * slow * h * dt; resolve(e);
}

/* ---------------------------------------------------------------- loot */
const weaponScore = (e, k) => WEAPONS[k].rating + (e.ammo[WEAPONS[k].ammo] > 10 ? .6 : 0);
function dropWeapon(e, w) { if (w) addLoot(e.x + rr(-14, 14), e.y + rr(-14, 14), 'weapon', w.k, 0, w.mag); }
function autoBest(e) {
  if (e.isPlayer) return;
  const s0 = e.w[0] ? weaponScore(e, e.w[0].k) : -1, s1 = e.w[1] ? weaponScore(e, e.w[1].k) : -1;
  switchTo(e, s1 > s0 ? 1 : 0);
}
function takeLoot(e, it) {
  const ok = takeLoot_(e, it); if (ok && it.type === 'weapon') autoBest(e); return ok;
}
function takeLoot_(e, it) {
  if (it.type === 'ammo') { e.ammo[it.k] += it.amt; return true; }
  if (it.type === 'heal') { if (e.heals >= 4) return false; e.heals++; return true; }
  if (it.type === 'armor') { if (e.armor >= 100) return false; e.armor = Math.min(100, e.armor + 50); return true; }
  const nw = { k: it.k, mag: it.mag };
  if (!e.w[0] || !e.w[1]) { const i = e.w[0] ? 1 : 0; e.w[i] = nw; if (e.isPlayer || !curWeapon(e)) switchTo(e, i); return true; }
  if (e.isPlayer) { dropWeapon(e, e.w[e.cur]); e.w[e.cur] = nw; e.reload = 0; return true; }
  let wi = weaponScore(e, e.w[0].k) <= weaponScore(e, e.w[1].k) ? 0 : 1;
  if (weaponScore(e, it.k) <= weaponScore(e, e.w[wi].k)) return false;
  dropWeapon(e, e.w[wi]); e.w[wi] = nw; if (wi === e.cur) { e.reload = 0; e.reloadW = null; } return true;
}
function nearestLoot(e, maxD, filter) {
  let best = null, bd = maxD;
  for (const it of loot) { const d = dist(e.x, e.y, it.x, it.y); if (d < bd && (!filter || filter(it))) { bd = d; best = it; } }
  return best;
}

/* ---------------------------------------------------------------- player */
function readInput() { // keyboard / touch -> world-space movement + aim (used by solo play and sent to the server online)
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), iy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (isTouch) { ix += touch.ix; iy += touch.iy; }
  const l = Math.max(1, Math.hypot(ix, iy)); ix /= l; iy /= l;
  const held = mouse.down || touch.btnFire || touch.stickFire, moving = !!(ix || iy);
  const sprint = (!!(keys.ShiftLeft || keys.ShiftRight) || (isTouch && Math.hypot(touch.ix, touch.iy) > .93)) && moving && !held;
  let mx, my, ang;
  if (mode3d) { // W = where the camera looks, A/D strafe
    const fx = Math.cos(view.yaw), fy = Math.sin(view.yaw), rx = -fy, ry = fx;
    mx = rx * ix - fx * iy; my = ry * ix - fy * iy;
    ang = view.yaw + .028; // bullets converge on the crosshair despite the over-the-shoulder camera
  } else {
    mx = ix; my = iy;
    if (isTouch) ang = touch.aiming ? touch.aimA : moving ? Math.atan2(iy, ix) : player.ang;
    else ang = Math.atan2((mouse.y - cv.height / 2) / scale + cam.y - player.y, (mouse.x - cv.width / 2) / scale + cam.x - player.x);
  }
  return { mx, my, ang, held, moving, sprint };
}
function updatePlayer(dt) {
  const e = player, I = readInput();
  e.sprint = I.sprint;
  const sp = 205 * (e.sprint ? 1.35 : 1);
  moveEnt(e, I.mx * sp, I.my * sp, dt); e.ang = I.ang;
  const w = curWeapon(e);
  if (w) {
    const d = WEAPONS[w.k];
    if ((d.auto || isTouch) ? I.held : mouse.clicked) tryFire(e, (I.moving ? .02 : 0) + (e.sprint ? .03 : 0));
    if (w.mag === 0 && e.reload <= 0) startReload(e);
  }
  mouse.clicked = false;
}
/* remote (Wi-Fi) players are driven by the inputs the server receives from their phones / laptops */
function remoteThink(e, dt) {
  const I = e.input, len = Math.hypot(I.mx, I.my), clicked = I.clk !== e.lastClk; e.lastClk = I.clk;
  e.ang = I.ang; e.sprint = I.sprint && len > .1 && !I.fire;
  const sp = 205 * (e.sprint ? 1.35 : 1), m = Math.min(1, len);
  if (len > 1e-3) moveEnt(e, I.mx / len * m * sp, I.my / len * m * sp, dt);
  const w = curWeapon(e);
  if (w) {
    const d = WEAPONS[w.k];
    if ((d.auto || I.hold) ? I.fire : clicked) tryFire(e, (len > .1 ? .02 : 0) + (e.sprint ? .03 : 0));
    if (w.mag === 0 && e.reload <= 0) startReload(e);
  }
}
function pickNearby(e) { const it = nearestLoot(e, 46, i => i.type === 'weapon'); if (it && takeLoot(e, it)) { removeLoot(it); return true; } return false; }
function autoPick(h) {
  for (let i = loot.length - 1; i >= 0; i--) { const it = loot[i]; if (it.type !== 'weapon' && dist(h.x, h.y, it.x, it.y) < 30 && takeLoot(h, it)) { removeLoot(it); if (h.isPlayer) sfx('pickup', h.x, h.y); } }
}
/* player actions: local in solo play, sent to the server when online */
const netAct = (a, arg) => { if (window.__net) window.__net.send({ t: 'act', a, arg }); };
function doReload() { if (online) netAct('reload'); else startReload(player); }
function doHeal() { if (online) netAct('heal'); else startHeal(player); }
function doSwitch(i) { if (online) netAct('sw', i); else switchTo(player, i); }
function doPick() { if (online) netAct('pick'); else if (pickNearby(player)) sfx('pickup', player.x, player.y); }
function playerPrompt() {
  const it = nearestLoot(player, 46, i => i.type === 'weapon'); return it;
}

/* ---------------------------------------------------------------- bots */
function hasLOS(ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by), n = Math.ceil(d / 22);
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    for (const c of queryCols(x, y, x, y)) if (c.t === 0 && x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return false;
  }
  return true;
}
function lootValue(e, it) {
  if (it.type === 'weapon') { const have = Math.max(e.w[0] ? WEAPONS[e.w[0].k].rating : 0, e.w[1] ? WEAPONS[e.w[1].k].rating : 0); return WEAPONS[it.k].rating > have ? 3 : (e.w[0] && e.w[1] ? 0 : .8); }
  if (it.type === 'ammo') { const need = e.w.some(w => w && WEAPONS[w.k].ammo === it.k); return need && e.ammo[it.k] < 70 ? 2 : .2; }
  if (it.type === 'heal') return e.heals < 3 ? 1.6 : 0;
  return e.armor < 50 ? 1.8 : 0;
}
function botThink(b, dt) {
  const a = b.ai;
  a.scan -= dt; a.strafeT -= dt; a.lootT -= dt; a.wpT -= dt;
  if (a.scan <= 0) { // perception
    a.scan = .22 + rand() * .12;
    const w = curWeapon(b), sight = Math.min(560, (w ? WEAPONS[w.k].range : 500) + 100);
    let best = null, bd = sight;
    for (const o of ents) if (o !== b && o.alive) { const d = dist(b.x, b.y, o.x, o.y); if (d < bd && hasLOS(b.x, b.y, o.x, o.y)) { bd = d; best = o; } }
    if (best && best !== a.target) a.react = .45 + rand() * .5;
    a.target = best;
  }
  if (a.react > 0) a.react -= dt;
  const out = dist(b.x, b.y, zone.cx, zone.cy) > zone.r - 40;
  const wantMove = dist(b.x, b.y, zone.tx, zone.ty) > zone.tr * .8 && (zone.state === 'shrink' || zone.t < 18 || out);
  let hx = 0, hy = 0, speed = 175;
  const T = a.target, w = curWeapon(b), wd = w && WEAPONS[w.k];
  // healing / reloading when safe
  if (!T) { if (b.hp < 55) startHeal(b); if (w && w.mag < wd.mag * .5) startReload(b); }
  if (w && w.mag === 0 && b.ammo[wd.ammo] === 0) { const o = b.cur ^ 1; if (b.w[o] && (b.w[o].mag > 0 || b.ammo[WEAPONS[b.w[o].k].ammo] > 0)) switchTo(b, o); }
  if (T) {
    const d = dist(b.x, b.y, T.x, T.y), want = Math.atan2(T.y - b.y, T.x - b.x);
    if (b.hp < 30 && b.heals > 0 && d > 250) startHeal(b);
    // aim
    const turn = 3 * dt, df = angDiff(b.ang, want); b.ang += clamp(df, -turn, turn);
    const ideal = wd ? wd.range * .55 : 200;
    if (a.strafeT <= 0) { a.strafe = rand() < .5 ? 1 : -1; a.strafeT = rr(.8, 2); }
    const toward = d > ideal + 90 ? 1 : d < ideal - 130 ? -.8 : 0;
    hx = Math.cos(want) * toward + Math.cos(want + Math.PI / 2) * a.strafe * .7; hy = Math.sin(want) * toward + Math.sin(want + Math.PI / 2) * a.strafe * .7;
    if (wd && a.react <= 0 && Math.abs(df) < .22 && d < wd.range * .95) tryFire(b, .09 + Math.min(.08, d / 6000));
    if (w && w.mag === 0) startReload(b);
    if (wantMove && out) { hx = Math.cos(Math.atan2(zone.cy - b.y, zone.cx - b.x)); hy = Math.sin(Math.atan2(zone.cy - b.y, zone.cx - b.x)); }
  } else {
    // loot / roam / rotate
    if (wantMove) { const g = Math.atan2(zone.ty - b.y, zone.tx - b.x); hx = Math.cos(g); hy = Math.sin(g); speed = 195; a.goal = null; }
    else {
      if (a.lootT <= 0) {
        a.lootT = 1 + rand();
        let best = null, bs = 0;
        for (const it of loot) { const d = dist(b.x, b.y, it.x, it.y); if (d > 750) continue; const s = lootValue(b, it) / (80 + d); if (s > bs) { bs = s; best = it; } }
        a.goal = best;
      }
      if (a.goal && loot.includes(a.goal)) { const g = Math.atan2(a.goal.y - b.y, a.goal.x - b.x); hx = Math.cos(g); hy = Math.sin(g); }
      else {
        a.goal = null;
        if (!a.wp || a.wpT <= 0 || dist(b.x, b.y, a.wp[0], a.wp[1]) < 60) {
          const c = rand() < .5 && zone.phase >= 0 ? [zone.tx, zone.ty, zone.tr] : [b.x, b.y, 700];
          const an = rand() * TAU, dd = Math.sqrt(rand()) * Math.min(c[2], 800);
          a.wp = [clamp(c[0] + Math.cos(an) * dd, 100, WORLD - 100), clamp(c[1] + Math.sin(an) * dd, 100, WORLD - 100)]; a.wpT = rr(6, 12);
        }
        const g = Math.atan2(a.wp[1] - b.y, a.wp[0] - b.x); hx = Math.cos(g); hy = Math.sin(g); speed = 150;
      }
      if (hx || hy) { const want = Math.atan2(hy, hx), turn = 5 * dt; b.ang += clamp(angDiff(b.ang, want), -turn, turn); }
    }
  }
  // obstacle avoidance when stuck
  a.stuckT += dt;
  if (a.stuckT > .5) { if ((hx || hy) && dist(b.x, b.y, a.lx, a.ly) < 18) { a.avoidT = .9; a.avoidA = (rand() < .5 ? 1 : -1) * rr(1.1, 2.3); a.wp = null; } a.lx = b.x; a.ly = b.y; a.stuckT = 0; }
  if (a.avoidT > 0) { a.avoidT -= dt; const c = Math.cos(a.avoidA), s = Math.sin(a.avoidA); [hx, hy] = [hx * c - hy * s, hx * s + hy * c]; }
  const l = Math.hypot(hx, hy);
  if (l > 0) moveEnt(b, hx / l * speed, hy / l * speed, dt);
  // pick up what we stand on
  for (let i = loot.length - 1; i >= 0; i--) { const it = loot[i]; if (dist(b.x, b.y, it.x, it.y) < 26 && lootValue(b, it) > 0 && takeLoot(b, it)) { removeLoot(it); break; } }
}

/* ---------------------------------------------------------------- main update */
function update(dt) {
  time += dt;
  updateZone(dt);
  if (player && player.alive) updatePlayer(dt);
  for (const e of ents) {
    if (!e.alive) continue;
    if (e.remote) remoteThink(e, dt); else if (!e.isPlayer) botThink(e, dt);
    e.cd -= dt; e.flash -= dt;
    if (e.reload > 0) { e.reload -= dt; if (e.reload <= 0) finishReload(e); }
    if (e.healT > 0) { e.healT -= dt; if (e.healT <= 0 && e.heals > 0) { e.hp = Math.min(100, e.hp + 45); e.heals--; if (e.isPlayer) sfx('pickup', e.x, e.y); } }
    if (dist(e.x, e.y, zone.cx, zone.cy) > zone.r) damage(e, zone.dmg * dt, null, 0);
  }
  for (const h of ents) if (h.human && h.alive) autoPick(h);
  updateBullets(dt);
  for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; } fx = fx.filter(f => f.life > 0);
  for (const f of floaters) { f.y -= 40 * dt; f.life -= dt; } floaters = floaters.filter(f => f.life > 0);
  for (const f of feed) f.life -= dt; feed = feed.filter(f => f.life > 0);
  hitFlash = Math.max(0, hitFlash - dt); hitMark = Math.max(0, hitMark - dt); shake = Math.max(0, shake - dt * 14);
  if (player) { // camera
    const tx = player.x + (mouse.x - cv.width / 2) / scale * .18, ty = player.y + (mouse.y - cv.height / 2) / scale * .18;
    cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  }
  // end conditions (solo)
  if (state === 'play' && player) {
    if (!player.alive) { endTimer -= dt; if (endTimer <= 0) finish(false); }
    else if (aliveCount <= 1) { endTimer += dt; if (endTimer > 1.2) finish(true); }
  }
}
function finish(won) {
  state = 'over'; document.body.classList.remove('playing'); if (document.exitPointerLock) document.exitPointerLock();
  document.getElementById('endTitle').textContent = won ? '🏆 VIJAY! Champion Preet-18!' : 'Khel Khatam';
  document.getElementById('endTitle').style.color = won ? '#ffd166' : '#ff6b6b';
  const rank = won ? 1 : Math.max(2, aliveCount + 1);
  document.getElementById('endStats').innerHTML = `Rank <b>#${rank}</b> of 30 &nbsp;·&nbsp; Kills <b>${player.kills}</b> &nbsp;·&nbsp; Survived <b>${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}</b>`;
  endEl.classList.remove('hidden');
}

/* ---------------------------------------------------------------- rendering */
const hash2 = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h = (h ^ (h >>> 13)) >>> 0; return h / 4294967296; };
function circle(x, y, r, fill, stroke) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
function inView(x, y, m, v) { return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

function drawGround(v) {
  ctx.fillStyle = '#2b1d10'; ctx.fillRect(v.x0 - 10, v.y0 - 10, v.x1 - v.x0 + 20, v.y1 - v.y0 + 20);
  const T = 200, tx0 = Math.max(0, Math.floor(v.x0 / T)), tx1 = Math.min(19, Math.floor(v.x1 / T)), ty0 = Math.max(0, Math.floor(v.y0 / T)), ty1 = Math.min(19, Math.floor(v.y1 / T));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const h = hash2(tx, ty), cx = tx * T + 100, cy = ty * T + 100, nearRiver = Math.abs(cx - 1475) < 420 && cy > 1000 && cy < 3800;
    ctx.fillStyle = nearRiver ? (h < .5 ? '#a9b86a' : '#9cae5e') : h < .3 ? '#dcc690' : h < .65 ? '#d4bd85' : '#cfb77c';
    ctx.fillRect(tx * T, ty * T, T + 1, T + 1);
    if (h > .86) { ctx.fillStyle = 'rgba(120,100,50,.25)'; circle(cx + (h - .86) * 600, cy, 6 + h * 10, 'rgba(110,90,45,.22)'); }
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of roads) { ctx.beginPath(); ctx.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]); ctx.strokeStyle = '#b9a06a'; ctx.lineWidth = 64; ctx.stroke(); ctx.strokeStyle = '#c9b27d'; ctx.lineWidth = 48; ctx.stroke(); }
  for (const f of fields) {
    if (!inView(f.x + f.w / 2, f.y + f.h / 2, 300, v)) continue;
    ctx.fillStyle = '#6fa23c'; ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = '#8bbf4c'; for (let x = f.x + 8; x < f.x + f.w - 8; x += 22) ctx.fillRect(x, f.y + 6, 10, f.h - 12);
    ctx.strokeStyle = '#4c7a28'; ctx.lineWidth = 3; ctx.strokeRect(f.x, f.y, f.w, f.h);
  }
  for (const w of waters) {
    ctx.fillStyle = '#3d8fb8'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; const ph = time * 20;
    for (let y = w.y + 20; y < w.y + w.h; y += 46) for (let x = w.x + ((y / 46 | 0) % 2) * 25 + (ph % 50); x < w.x + w.w - 20; x += 50) ctx.fillRect(x, y, 22, 3);
    ctx.strokeStyle = '#2a6a8a'; ctx.lineWidth = 5; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
  ctx.font = 'bold 34px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(70,45,10,.32)';
  for (const l of labels) if (inView(l[1], l[2], 300, v)) ctx.fillText(l[0], l[1], l[2]);
  // border
  ctx.strokeStyle = '#7a3b00'; ctx.lineWidth = 14; ctx.strokeRect(0, 0, WORLD, WORLD);
}

function drawBuilding(b) {
  const S = STYLES[b.style];
  ctx.fillStyle = S.floor; ctx.fillRect(b.x, b.y, b.w, b.h);
  if (b.kind === 'bazaar') { const cols = ['#ff9933', '#e84a8a', '#1fb5a8', '#f4d35e']; for (let x = b.x + b.t, i = 0; x < b.x + b.w - b.t; x += 22, i++) { ctx.fillStyle = cols[i % 4] + '66'; ctx.fillRect(x, b.y + b.t, 11, b.h - 2 * b.t); } }
  else if (b.kind === 'temple') { circle(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * .22, '#ff9933'); circle(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) * .1, '#fff3c4'); }
  else if (b.kind === 'palace') { circle(b.x + b.w / 2, b.y + b.h / 2, 34, '#ff9933'); circle(b.x + b.w / 2, b.y + b.h / 2, 22, '#fff'); circle(b.x + b.w / 2, b.y + b.h / 2, 11, '#138808'); }
  else if (b.kind === 'haveli') { ctx.fillStyle = '#1d6fa355'; ctx.fillRect(b.x + b.w / 2 - 20, b.y + b.t, 40, b.h - 2 * b.t); }
  else if (b.kind === 'fortwall') { ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
  ctx.fillStyle = S.wall; ctx.strokeStyle = S.edge; ctx.lineWidth = 2;
  for (const c of queryCols(b.x, b.y, b.x + b.w, b.y + b.h)) if (c.t === 0 && c.x >= b.x - 1 && c.y >= b.y - 1 && c.x + c.w <= b.x + b.w + 1 && c.y + c.h <= b.y + b.h + 1 && !c._d) { ctx.fillRect(c.x, c.y, c.w, c.h); ctx.strokeRect(c.x, c.y, c.w, c.h); }
}
function drawTree(t) {
  ctx.fillStyle = 'rgba(0,0,0,.18)'; circle(t.x + 6, t.y + 8, t.r);
  if (t.kind === 'palm') { for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; ctx.strokeStyle = '#3f8a3a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(a) * t.r * 1.5, t.y + Math.sin(a) * t.r * 1.5); ctx.stroke(); } circle(t.x, t.y, 4, '#7b4b1d'); }
  else { circle(t.x, t.y, t.r, t.kind === 'banyan' ? '#2f7a34' : '#4a9a3c'); circle(t.x - t.r * .25, t.y - t.r * .25, t.r * .6, t.kind === 'banyan' ? '#3c9142' : '#5eb04a'); if (t.kind === 'banyan') circle(t.x, t.y, 4, '#6b4a22'); }
}
function drawLoot(it, near) {
  ctx.save(); ctx.translate(it.x, it.y);
  const pulse = 1 + Math.sin(time * 4 + it.x) * .06; ctx.scale(pulse, pulse);
  if (it.type === 'weapon') { const d = WEAPONS[it.k]; circle(0, 0, 17, 'rgba(255,255,255,.35)'); ctx.fillStyle = d.col; ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.fillRect(-d.len / 2, -3.5, d.len, 7); ctx.strokeRect(-d.len / 2, -3.5, d.len, 7); ctx.fillRect(-3, 2, 6, 8); }
  else if (it.type === 'ammo') { circle(0, 0, 13, 'rgba(255,214,10,.35)'); ctx.fillStyle = '#e9c46a'; ctx.strokeStyle = '#7a5c00'; ctx.lineWidth = 2; ctx.fillRect(-8, -6, 16, 12); ctx.strokeRect(-8, -6, 16, 12); ctx.fillStyle = '#7a5c00'; ctx.font = 'bold 8px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText(it.k[0].toUpperCase(), 0, 3); }
  else if (it.type === 'heal') { circle(0, 0, 14, 'rgba(255,230,120,.4)'); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#8a6a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffc61a'; ctx.fillRect(-6, -4, 12, 4); }
  else { circle(0, 0, 15, 'rgba(80,160,255,.35)'); ctx.fillStyle = '#4a8fe7'; ctx.strokeStyle = '#17407a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.lineTo(8, 2); ctx.quadraticCurveTo(8, 9, 0, 11); ctx.quadraticCurveTo(-8, 9, -8, 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function drawPerson(e) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; circle(e.x + 4, e.y + 5, 15);
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang);
  const w = curWeapon(e);
  if (w) { const d = WEAPONS[w.k]; ctx.fillStyle = '#2b2b2b'; ctx.fillRect(8, -2.5, d.len, 5); ctx.fillStyle = d.col; ctx.fillRect(8, -1.5, d.len - 3, 3); if (e.flash > 0) { circle(12 + d.len, 0, 8, 'rgba(255,220,80,.9)'); circle(12 + d.len, 0, 4, '#fff'); } }
  ctx.lineWidth = 2; ctx.strokeStyle = '#00000088';
  ctx.fillStyle = e.kurta; ctx.beginPath(); ctx.ellipse(0, 0, 9, 15, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (e.isPlayer) { ctx.fillStyle = '#ff9933'; ctx.beginPath(); ctx.ellipse(0, -9, 8, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#138808'; ctx.beginPath(); ctx.ellipse(0, 9, 8, 5, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#e0ac7e'; circle(11, -8, 3.5); circle(11, 8, 3.5); // hands
  circle(1, 0, 8.5, '#e0ac7e', '#00000088');
  ctx.fillStyle = e.turban; ctx.beginPath(); ctx.ellipse(-1, 0, 8.5, 9.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); // pagri
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-1, 0, 5.5, -1.2, 1.2); ctx.stroke();
  ctx.restore();
  if (e.isPlayer) { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang + Math.PI / 2); ctx.fillStyle = '#12327a'; ctx.font = 'bold 8px Trebuchet MS'; ctx.textAlign = 'center'; ctx.fillText('18', 0, 14); ctx.restore(); }
  if (e.healT > 0) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - e.healT / 1.8)); ctx.stroke(); }
  // name + hp
  ctx.textAlign = 'center'; ctx.font = `bold ${e.isPlayer ? 14 : 12}px Trebuchet MS`;
  ctx.fillStyle = e.isPlayer ? '#ffd166' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(e.name, e.x, e.y - 30); ctx.fillText(e.name, e.x, e.y - 30);
  if (!e.isPlayer && e.hp < 100) { ctx.fillStyle = '#0008'; ctx.fillRect(e.x - 16, e.y - 25, 32, 4); ctx.fillStyle = '#e63946'; ctx.fillRect(e.x - 16, e.y - 25, 32 * e.hp / 100, 4); }
}

let miniBase = null;
function buildMini() {
  miniBase = document.createElement('canvas'); miniBase.width = miniBase.height = 170; const c = miniBase.getContext('2d'), k = 170 / WORLD;
  c.fillStyle = '#cfb77c'; c.fillRect(0, 0, 170, 170);
  c.strokeStyle = '#b9a06a'; c.lineWidth = 3; for (const r of roads) { c.beginPath(); c.moveTo(r[0][0] * k, r[0][1] * k); for (let i = 1; i < r.length; i++) c.lineTo(r[i][0] * k, r[i][1] * k); c.stroke(); }
  c.fillStyle = '#6fa23c'; for (const f of fields) c.fillRect(f.x * k, f.y * k, f.w * k, f.h * k);
  c.fillStyle = '#3d8fb8'; for (const w of waters) c.fillRect(w.x * k, w.y * k, w.w * k, w.h * k);
  for (const b of buildings) { c.fillStyle = STYLES[b.style].wall; c.fillRect(b.x * k, b.y * k, Math.max(2, b.w * k), Math.max(2, b.h * k)); }
}
function drawMini() {
  if (!miniBase) buildMini();
  const k = 170 / WORLD; mctx.clearRect(0, 0, 170, 170); mctx.drawImage(miniBase, 0, 0);
  mctx.beginPath(); mctx.rect(0, 0, 170, 170); mctx.arc(zone.cx * k, zone.cy * k, Math.max(0, zone.r * k), 0, TAU, true); mctx.fillStyle = 'rgba(200,50,20,.35)'; mctx.fill('evenodd');
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(zone.tx * k, zone.ty * k, zone.tr * k, 0, TAU); mctx.stroke();
  mctx.fillStyle = '#ffd166'; mctx.strokeStyle = '#000'; mctx.beginPath(); mctx.arc(player.x * k, player.y * k, 4, 0, TAU); mctx.fill(); mctx.stroke();
  mctx.strokeStyle = '#ffd166'; mctx.beginPath(); mctx.moveTo(player.x * k, player.y * k); mctx.lineTo(player.x * k + Math.cos(player.ang) * 9, player.y * k + Math.sin(player.ang) * 9); mctx.stroke();
}

function bar(x, y, w, h, f, col, back = '#0009') { ctx.fillStyle = back; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(f, 0, 1), h); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
function pill(x, y, text, size = 18, col = '#fff') { ctx.font = `bold ${size}px Trebuchet MS`; const w = ctx.measureText(text).width + 22; ctx.fillStyle = '#000a'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - size, w, size + 12, 8) : ctx.rect(x - w / 2, y - size, w, size + 12); ctx.fill(); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 2); }

const e_hm = () => (player && !player.alive ? '#f55' : '#fff');
function drawHUD() {
  const W = cv.width, H = cv.height, p = player;
  // vignette when hurt
  if (hitFlash > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .8); g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${hitFlash * 1.4})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  const outside = dist(p.x, p.y, zone.cx, zone.cy) > zone.r;
  if (outside && p.alive) pill(W / 2, 110, '⚠ Aap Toofan mein hain – safe zone ki taraf bhaago!', 18, '#ff8a65');
  // top info
  ctx.textAlign = 'left'; ctx.font = 'bold 20px Trebuchet MS';
  ctx.fillStyle = '#000a'; ctx.fillRect(14, 14, 190, 74); ctx.fillStyle = '#fff'; ctx.fillText(`👥 Alive: ${aliveCount}`, 26, 42); ctx.fillText(`☠ Kills: ${p.kills}`, 26, 72);
  const msg = zone.state === 'final' ? 'Antim Toofan!' : zone.state === 'wait' ? `Toofan aane mein ${fmt(zone.t)}` : `Toofan sikud raha hai ${fmt(zone.t)}`;
  pill(W / 2, 38, msg, 18, zone.state === 'shrink' ? '#ff8a65' : '#ffe08a');
  // feed
  ctx.textAlign = 'right'; ctx.font = 'bold 15px Trebuchet MS';
  feed.forEach((f, i) => { ctx.globalAlpha = Math.min(1, f.life); ctx.fillStyle = '#000a'; const w = ctx.measureText(f.t).width + 16; ctx.fillRect(W - 14 - w, 14 + i * 26, w, 22); ctx.fillStyle = '#fff'; ctx.fillText(f.t, W - 22, 31 + i * 26); ctx.globalAlpha = 1; });
  // health / armour
  const hx = isTouch ? W / 2 - 130 : 24, hb = isTouch ? 112 : H - 58; // phones: bars at top-centre so thumbs/buttons never cover them
  bar(hx, hb, 260, 22, p.hp / 100, p.hp > 35 ? '#4cc94c' : '#e63946'); bar(hx, hb - 24, 260, 14, p.armor / 100, '#4a8fe7');
  ctx.textAlign = 'left'; ctx.font = 'bold 14px Trebuchet MS'; ctx.fillStyle = '#fff'; ctx.fillText(`HP ${Math.ceil(p.hp)}`, hx + 8, hb + 17); ctx.fillText(`Kavach ${Math.ceil(p.armor)}`, hx + 8, hb - 13);
  ctx.fillText(`🥛 Haldi Doodh ×${p.heals}${isTouch ? '' : '  [H]'}`, hx, hb - 32);
  // weapons
  for (let i = 0; i < 2; i++) {
    const x = W / 2 - 150 + i * 160, w = p.w[i], sel = i === p.cur; ctx.fillStyle = sel ? '#ff9933cc' : '#000a'; ctx.fillRect(x, H - 86, 148, 66); ctx.strokeStyle = sel ? '#fff' : '#555'; ctx.lineWidth = 2; ctx.strokeRect(x, H - 86, 148, 66);
    ctx.textAlign = 'left'; ctx.font = 'bold 12px Trebuchet MS'; ctx.fillStyle = '#fff'; ctx.fillText(`${i + 1}`, x + 8, H - 70);
    if (w) { const d = WEAPONS[w.k]; ctx.fillText(d.name, x + 24, H - 70); ctx.font = 'bold 24px Trebuchet MS'; ctx.fillText(`${w.mag}`, x + 10, H - 36); ctx.font = '14px Trebuchet MS'; ctx.fillStyle = '#ddd'; ctx.fillText(`/ ${p.ammo[d.ammo]} ${AMMO_LABEL[d.ammo]}`, x + 50, H - 36); ctx.fillStyle = d.col; ctx.fillRect(x + 10, H - 28, 40, 5); }
    else { ctx.fillStyle = '#888'; ctx.fillText('— empty —', x + 24, H - 70); }
  }
  const w = curWeapon(p);
  if (p.reload > 0 && w) { const f = 1 - p.reload / WEAPONS[w.k].reload; pill(W / 2, H / 2 + 56, 'Reload…', 14, '#fff'); bar(W / 2 - 40, H / 2 + 66, 80, 6, f, '#ffd166'); }
  const it = p.alive && playerPrompt(); if (it) pill(W / 2, H - 112, `${isTouch ? 'Tap PICK' : '[E]'}  ${WEAPONS[it.k].name}  (${it.mag} rounds)`, 16, '#ffe08a');
  // crosshair
  if (isTouch && state === 'play') {
    const ring = (ox, oy, x, y, on) => { ctx.globalAlpha = on ? .45 : .18; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, STICK_R, 0, TAU); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; };
    if (touch.moveId !== null) ring(touch.mx0, touch.my0, touch.mx, touch.my, true); else ring(110, H - 150, 110, H - 150, false);
    if (!mode3d) { if (touch.lookId !== null) ring(touch.ax0, touch.ay0, touch.ax, touch.ay, true); else ring(W - 330, H - 150, W - 330, H - 150, false); }
  }
  if (mode3d && hitMark > 0) { ctx.strokeStyle = e_hm(); ctx.lineWidth = 3; ctx.beginPath(); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(W / 2 + a * 7, H / 2 + b * 7); ctx.lineTo(W / 2 + a * 15, H / 2 + b * 15); } ctx.stroke(); }
  { const cx_ = mode3d ? W / 2 : mouse.x, cy_ = mode3d ? H / 2 : mouse.y;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx_, cy_, 9, 0, TAU); ctx.moveTo(cx_ - 14, cy_); ctx.lineTo(cx_ - 5, cy_); ctx.moveTo(cx_ + 5, cy_); ctx.lineTo(cx_ + 14, cy_); ctx.moveTo(cx_, cy_ - 14); ctx.lineTo(cx_, cy_ - 5); ctx.moveTo(cx_, cy_ + 5); ctx.lineTo(cx_, cy_ + 14); ctx.stroke();
  }
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

function render() {
  const W = cv.width, H = cv.height;
  scale = isTouch ? H / 560 : H / 900;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mode3d) { // WebGL draws the world on #gl; this canvas is the transparent HUD layer
    ctx.clearRect(0, 0, W, H);
    if (!player) return;
    if (r3dReady) window.__r3d.render(lastDt);
    drawHUD(); drawMini();
    if (state === 'play' && requireLock && !locked) { if (online) pill(W / 2, H / 2 + 100, 'Click the game to capture the mouse', 20, '#ffe08a'); else { ctx.fillStyle = '#000b'; ctx.fillRect(0, 0, W, H); pill(W / 2, H / 2, 'Paused – click to resume (mouse look)', 24, '#ffe08a'); } }
    return;
  }
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  if (!player) return;
  const sx = (rand() - .5) * shake, sy = (rand() - .5) * shake;
  const v = { x0: cam.x - W / 2 / scale, x1: cam.x + W / 2 / scale, y0: cam.y - H / 2 / scale, y1: cam.y + H / 2 / scale };
  ctx.setTransform(scale, 0, 0, scale, W / 2 - cam.x * scale + sx, H / 2 - cam.y * scale + sy);
  drawGround(v);
  for (const b of buildings) if (b.x < v.x1 && b.x + b.w > v.x0 && b.y < v.y1 && b.y + b.h > v.y0) drawBuilding(b);
  for (const t of trees) if (inView(t.x, t.y, 60, v)) drawTree(t);
  for (const it of loot) if (inView(it.x, it.y, 30, v)) drawLoot(it);
  for (const e of ents) if (!e.alive && inView(e.x, e.y, 30, v)) { ctx.fillStyle = 'rgba(0,0,0,.25)'; circle(e.x, e.y, 14); }
  for (const e of ents) if (e.alive && inView(e.x, e.y, 60, v)) drawPerson(e);
  ctx.lineCap = 'round';
  for (const b of bullets) { const sp = Math.hypot(b.vx, b.vy); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(b.x - b.vx / sp * 28, b.y - b.vy / sp * 28); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (const f of fx) { ctx.globalAlpha = clamp(f.life * 3, 0, 1); ctx.fillStyle = f.c; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); } ctx.globalAlpha = 1;
  ctx.font = 'bold 18px Trebuchet MS'; ctx.textAlign = 'center';
  for (const f of floaters) { ctx.globalAlpha = clamp(f.life * 2, 0, 1); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = '#ffd166'; ctx.fillText(f.text, f.x, f.y); } ctx.globalAlpha = 1;
  // sandstorm outside the zone
  ctx.beginPath(); ctx.rect(v.x0 - 50, v.y0 - 50, v.x1 - v.x0 + 100, v.y1 - v.y0 + 100); ctx.arc(zone.cx, zone.cy, Math.max(0, zone.r), 0, TAU, true);
  ctx.fillStyle = 'rgba(190,80,30,.38)'; ctx.fill('evenodd');
  ctx.strokeStyle = '#ff5a36'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(zone.cx, zone.cy, Math.max(0, zone.r), 0, TAU); ctx.stroke();
  if (zone.state === 'wait' || zone.state === 'shrink') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([24, 18]); ctx.beginPath(); ctx.arc(zone.tx, zone.ty, zone.tr, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawHUD(); drawMini();
}

/* ---------------------------------------------------------------- input / loop */
function resize() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();
window.addEventListener('keydown', ev => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(ev.code)) ev.preventDefault();
  keys[ev.code] = true;
  if (state !== 'play' || !player.alive) return;
  if (ev.code === 'KeyR') doReload();
  if (ev.code === 'KeyH') doHeal();
  if (ev.code === 'Digit1') doSwitch(0);
  if (ev.code === 'Digit2') doSwitch(1);
  if (ev.code === 'KeyQ') doSwitch(player.cur ^ 1);
  if (ev.code === 'KeyE') doPick();
});
window.addEventListener('keyup', ev => { keys[ev.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
document.addEventListener('mousemove', ev => { if (mode3d && locked) { view.yaw += ev.movementX * .0024; view.pitch = clamp(view.pitch + ev.movementY * .0020, -.25, .9); } });
cv.addEventListener('mousemove', ev => { mouse.x = ev.clientX * cv.width / cv.clientWidth; mouse.y = ev.clientY * cv.height / cv.clientHeight; });
cv.addEventListener('mousedown', ev => {
  if (ev.button !== 0) return; audio();
  if (mode3d && state === 'play' && requireLock && !locked) { lockPointer(); return; }
  mouse.down = true; mouse.clicked = true; mouse.cc = (mouse.cc | 0) + 1;
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; if (!locked) mouse.down = false; });
window.addEventListener('mouseup', ev => { if (ev.button === 0) mouse.down = false; });
cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('wheel', ev => { if (state === 'play' && player.alive) doSwitch(player.cur ^ 1); });
/* ---------------------------------------------------------------- touch controls (phones / tablets) */
function slotAt(x, y) { const W = cv.width, H = cv.height; for (let i = 0; i < 2; i++) { const sx = W / 2 - 150 + i * 160; if (x >= sx && x <= sx + 148 && y >= H - 86 && y <= H - 20) return i; } return -1; }
function stickVec(ox, oy, x, y) { let dx = x - ox, dy = y - oy; const m = Math.hypot(dx, dy); if (m > STICK_R) { dx = dx / m * STICK_R; dy = dy / m * STICK_R; } return [dx, dy]; }
function aimStick() {
  const [dx, dy] = stickVec(touch.ax0, touch.ay0, touch.ax, touch.ay), m = Math.hypot(dx, dy);
  touch.aiming = m > 10; if (touch.aiming) touch.aimA = Math.atan2(dy, dx); touch.stickFire = m > 30;
}
cv.addEventListener('touchstart', ev => {
  ev.preventDefault(); audio();
  if (state !== 'play' || !player.alive) return;
  for (const t of ev.changedTouches) {
    const x = t.clientX, y = t.clientY, s = slotAt(x, y);
    if (s >= 0) { doSwitch(s); continue; }
    if (x < cv.width * .45 && touch.moveId === null) { touch.moveId = t.identifier; touch.mx0 = touch.mx = x; touch.my0 = touch.my = y; }
    else if (x >= cv.width * .45 && touch.lookId === null) { touch.lookId = t.identifier; touch.lx = touch.ax0 = touch.ax = x; touch.ly = touch.ay0 = touch.ay = y; }
  }
}, { passive: false });
cv.addEventListener('touchmove', ev => {
  ev.preventDefault();
  for (const t of ev.changedTouches) {
    if (t.identifier === touch.moveId) { touch.mx = t.clientX; touch.my = t.clientY; const [dx, dy] = stickVec(touch.mx0, touch.my0, touch.mx, touch.my); touch.mx = touch.mx0 + dx; touch.my = touch.my0 + dy; touch.ix = dx / STICK_R; touch.iy = dy / STICK_R; }
    else if (t.identifier === touch.lookId) {
      if (mode3d) { view.yaw += (t.clientX - touch.lx) * .0048; view.pitch = clamp(view.pitch + (t.clientY - touch.ly) * .0036, -.25, .9); touch.lx = t.clientX; touch.ly = t.clientY; }
      else { touch.ax = t.clientX; touch.ay = t.clientY; aimStick(); }
    }
  }
}, { passive: false });
function touchEnd(ev) {
  ev.preventDefault();
  for (const t of ev.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.ix = touch.iy = 0; }
    if (t.identifier === touch.lookId) { touch.lookId = null; touch.aiming = false; touch.stickFire = false; }
  }
}
cv.addEventListener('touchend', touchEnd, { passive: false }); cv.addEventListener('touchcancel', touchEnd, { passive: false });
function bindBtn(id, down, up) {
  const el = document.getElementById(id); if (!el) return;
  const d = ev => { ev.preventDefault(); audio(); if (state === 'play' && player && player.alive) down(); el.classList.add('on'); };
  const u = ev => { ev.preventDefault(); if (up) up(); el.classList.remove('on'); };
  el.addEventListener('touchstart', d, { passive: false }); el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false });
}
bindBtn('tFire', () => { touch.btnFire = true; }, () => { touch.btnFire = false; });
bindBtn('tReload', () => doReload());
bindBtn('tHeal', () => doHeal());
bindBtn('tSwap', () => doSwitch(player.cur ^ 1));
bindBtn('tPick', () => doPick());

function begin(m3) {
  audio(); online = false; mode3d = m3; document.body.classList.add('playing');
  touch.moveId = touch.lookId = null; touch.ix = touch.iy = 0; touch.btnFire = touch.stickFire = touch.aiming = false;
  if (isTouch) { try { const de = document.documentElement; const r = de.requestFullscreen || de.webkitRequestFullscreen; if (r) { const pr = r.call(de); if (pr && pr.catch) pr.catch(() => {}); } if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* optional */ } }
  glCanvas.style.display = m3 ? 'block' : 'none';
  if (m3 && !r3dReady && window.__r3d) { window.__r3d.init(glCanvas, window.__rann); r3dReady = true; }
  if (m3 && !r3dReady) { alert('3D renderer not found (render3d.bundle.js). Playing in 2D.'); mode3d = false; glCanvas.style.display = 'none'; }
  newGame();
  if (mode3d && requireLock) lockPointer();
}
document.getElementById('start3dBtn').onclick = () => begin(true);
document.getElementById('startBtn').onclick = () => begin(false);
document.getElementById('againBtn').onclick = () => { if (online) { if (window.__net) window.__net.lobbyAgain(); } else begin(mode3d); };
document.getElementById('leaveBtn').onclick = () => location.reload();

let last = performance.now(), lastDt = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; lastDt = dt;
  const paused = !online && mode3d && requireLock && !locked && state === 'play';
  kick = Math.max(0, kick - dt * 6);
  if (online) clientStep(dt);
  else if (!paused && (state === 'play' || state === 'over')) update(state === 'over' ? dt * .5 : dt);
  render();
  requestAnimationFrame(frame);
}
if (/[?&]auto3d/.test(location.search)) setTimeout(() => begin(true), 0); else if (/[?&]auto/.test(location.search)) newGame();
requestAnimationFrame(frame);
/* ================================================================ Wi-Fi rooms ================================================================
   The Node server (server.js) loads this same file headless (ROLE === 'server') and runs the real simulation for a room.
   Browsers join as thin clients: they send inputs, receive snapshots (20/s) and only render. */
const R1 = v => Math.round(v * 10) / 10;
const mp = { // ---- used by server.js
  start(names, total) { newGame({ humans: names, total }); lootAdd = []; lootDel = []; outFeed = []; evs = []; return { roster: ents.map(e => ({ n: e.name, tb: e.turban, ku: e.kurta, h: e.human ? 1 : 0 })), loot: loot.map(lootRow) }; },
  tick(dt) { update(dt); },
  input(id, m) {
    const e = ents[id]; if (!e || !e.remote || !m) return;
    const n = (v, lim) => { v = +v; return isFinite(v) ? clamp(v, -lim, lim) : 0; }, I = e.input;
    I.mx = n(m.mx, 1.5); I.my = n(m.my, 1.5); I.ang = n(m.ang, 12); I.fire = !!m.f; I.sprint = !!m.sp; I.hold = !!m.hd; I.clk = m.ck | 0;
  },
  act(id, a, arg) {
    const e = ents[id]; if (!e || !e.alive || !e.remote) return;
    if (a === 'reload') startReload(e); else if (a === 'heal') startHeal(e); else if (a === 'sw') switchTo(e, arg === 1 ? 1 : 0); else if (a === 'pick') pickNearby(e);
  },
  drop(id) { const e = ents[id]; if (!e) return; if (e.alive) kill(e, null, `${e.name} left the game`); e.remote = false; },
  common() {
    return {
      t: 's', n: aliveCount, tm: R1(time),
      z: [R1(zone.cx), R1(zone.cy), R1(zone.r), R1(zone.tx), R1(zone.ty), R1(zone.tr), zone.state === 'wait' ? 0 : zone.state === 'shrink' ? 1 : 2, R1(zone.t), zone.phase],
      e: ents.map(e => [R1(e.x), R1(e.y), +e.ang.toFixed(3), Math.ceil(e.hp), Math.ceil(e.armor), e.alive ? 1 : 0, e.cur, e.w[0] ? WK.indexOf(e.w[0].k) : -1, e.w[1] ? WK.indexOf(e.w[1].k) : -1,
        (e.reload > 0 ? 1 : 0) | (e.healT > 0 ? 2 : 0) | (e.sprint ? 4 : 0), e.sc | 0, e.kills]),
      b: bullets.map(b => [b.id, R1(b.x), R1(b.y), Math.round(b.vx), Math.round(b.vy)]),
      la: lootAdd.map(lootRow), ld: lootDel.slice(), ev: evs.slice(), fd: outFeed.slice(),
    };
  },
  me(id) {
    const e = ents[id]; if (!e) return null;
    return { hp: Math.ceil(e.hp), ar: Math.ceil(e.armor), he: e.heals, w: e.w.map(w => (w ? [WK.indexOf(w.k), w.mag] : null)), cur: e.cur, am: [e.ammo.light, e.ammo.heavy, e.ammo.shell],
      rl: R1(e.reload), kl: e.kills, hs: e.hitSeq | 0, ha: +(e.hitAng || 0).toFixed(3), ms: e.markSeq | 0, rk: e.rank | 0, al: e.alive ? 1 : 0 };
  },
  flush() { lootAdd = []; lootDel = []; outFeed = []; evs = []; },
  over() {
    const alive = ents.filter(e => e.alive);
    if (alive.length > 1 && alive.some(e => e.human)) return { over: false };
    const w = alive.length ? alive.reduce((a, b) => (b.kills > a.kills ? b : a)) : null;
    if (w && w.human) w.rank = 1;
    return { over: true, winner: w ? w.name : '—' };
  },
  rank(id) { const e = ents[id]; return e ? e.rank | 0 : 0; },
};

// ---- client side (browser, when joined to a room)
function startOnline(info) {
  online = true; mode3d = !!info.mode3d; myId = info.me; overInfo = null; lastHS = lastMS = 0;
  document.body.classList.add('playing');
  touch.moveId = touch.lookId = null; touch.ix = touch.iy = 0; touch.btnFire = touch.stickFire = touch.aiming = false;
  if (mode3d && !r3dReady && window.__r3d) { window.__r3d.init(glCanvas, window.__rann); r3dReady = true; }
  if (mode3d && !r3dReady) mode3d = false;
  glCanvas.style.display = mode3d ? 'block' : 'none';
  ents = info.roster.map((r, i) => { const e = makeEnt(r.n, i === info.me); e.human = !!r.h; e.turban = r.tb; e.kurta = r.ku; e.id = i; e.tx = e.ty = 0; e.tang = 0; e.sc = 0; e.w = [null, null]; e.seen = false; return e; });
  player = ents[info.me]; bullets = []; bmap.clear(); lootById.clear(); fx = []; floaters = []; feed = []; time = 0; hitFlash = 0; hitMark = 0; shake = 0; endTimer = 0;
  loot = info.loot.map(rowToLoot); for (const l of loot) lootById.set(l.id, l);
  zone = { cx: 2000, cy: 2000, r: 2900, phase: 0, state: 'wait', t: 0, tx: 2000, ty: 2000, tr: 2900 };
  aliveCount = ents.length; state = 'play'; mm.style.display = 'block'; menuEl.classList.add('hidden'); endEl.classList.add('hidden'); document.getElementById('lobby').classList.add('hidden');
  say('Match shuru! Loot karo, Toofan se bacho!');
}
function applySnapshot(m) {
  if (!online || !player) return;
  aliveCount = m.n; time = m.tm;
  const z = m.z; zone.cx = z[0]; zone.cy = z[1]; zone.r = z[2]; zone.tx = z[3]; zone.ty = z[4]; zone.tr = z[5]; zone.state = z[6] === 0 ? 'wait' : z[6] === 1 ? 'shrink' : 'final'; zone.t = z[7]; zone.phase = z[8];
  for (let i = 0; i < m.e.length && i < ents.length; i++) {
    const r = m.e[i], e = ents[i]; e.tx = r[0]; e.ty = r[1]; e.tang = r[2]; e.hp = r[3]; e.armor = r[4];
    const was = e.alive; e.alive = !!r[5]; e.cur = r[6];
    e.w[0] = r[7] >= 0 ? { k: WK[r[7]], mag: e.w[0] ? e.w[0].mag : 0 } : null; e.w[1] = r[8] >= 0 ? { k: WK[r[8]], mag: e.w[1] ? e.w[1].mag : 0 } : null;
    e.reload = r[9] & 1 ? 1 : 0; e.healT = r[9] & 2 ? .9 : 0; if (e !== player) e.sprint = !!(r[9] & 4);
    if (!e.seen) { e.seen = true; e.x = e.tx; e.y = e.ty; e.ang = e.tang; if (e === player) { cam.x = e.x; cam.y = e.y; view.yaw = Math.atan2(2000 - e.y, 2000 - e.x); view.pitch = .22; } e.sc = r[10]; }
    else if (r[10] !== e.sc) { e.sc = r[10]; e.flash = .06; sfx('shot', e.x, e.y); }
    e.kills = r[11];
    if (e === player && was && !e.alive && state === 'play') endTimer = 1.4;
  }
  const seen = new Set();
  for (const r of m.b) { seen.add(r[0]); let b = bmap.get(r[0]); if (!b) { b = { id: r[0] }; bmap.set(r[0], b); bullets.push(b); } b.x = r[1]; b.y = r[2]; b.vx = r[3]; b.vy = r[4]; }
  if (bmap.size > seen.size) { bullets = bullets.filter(b => seen.has(b.id)); for (const id of [...bmap.keys()]) if (!seen.has(id)) bmap.delete(id); }
  for (const r of m.la) { const l = rowToLoot(r); loot.push(l); lootById.set(l.id, l); }
  if (m.ld.length) { const del = new Set(m.ld); loot = loot.filter(l => !del.has(l.id)); for (const id of m.ld) lootById.delete(id); }
  for (const [t, x, y] of m.ev) {
    if (t === 'h') { sfx('hit', x, y); for (let k = 0; k < 4; k++) fx.push({ x, y, vx: rr(-100, 100), vy: rr(-100, 100), life: .3, c: '#d62828' }); }
    else if (t === 'w') { for (let k = 0; k < 3; k++) fx.push({ x, y, vx: rr(-80, 80), vy: rr(-80, 80), life: .25, c: '#e8dcc0' }); }
    else if (t === 'd') { for (let k = 0; k < 10; k++) fx.push({ x, y, vx: rr(-140, 140), vy: rr(-140, 140), life: rr(.3, .7), c: '#c1121f' }); }
  }
  for (const t of m.fd) say(t);
  const me = m.me;
  if (me) {
    player.hp = me.hp; player.armor = me.ar; player.heals = me.he; player.w = me.w.map(w => (w ? { k: WK[w[0]], mag: w[1] } : null)); player.cur = me.cur;
    player.ammo = { light: me.am[0], heavy: me.am[1], shell: me.am[2] }; player.reload = me.rl; player.kills = me.kl; player.rank = me.rk;
    if (me.hs !== lastHS) { hitFlash = .35; hitAng = me.ha; shake = Math.min(8, shake + 3); lastHS = me.hs; }
    if (me.ms !== lastMS) { hitMark = .2; lastMS = me.ms; }
  }
}
function clientStep(dt) {
  if (!player) return;
  time += dt;
  const I = player.alive && state === 'play' ? readInput() : null;
  for (const e of ents) {
    const k = Math.min(1, dt * (e === player ? 24 : 16));
    e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.flash -= dt;
    if (e === player && I) { e.ang = I.ang; e.sprint = I.sprint; } else e.ang += angDiff(e.ang, e.tang) * Math.min(1, dt * 18);
  }
  for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; } fx = fx.filter(f => f.life > 0);
  for (const f of floaters) { f.y -= 40 * dt; f.life -= dt; } floaters = floaters.filter(f => f.life > 0);
  for (const f of feed) f.life -= dt; feed = feed.filter(f => f.life > 0);
  hitFlash = Math.max(0, hitFlash - dt); hitMark = Math.max(0, hitMark - dt); shake = Math.max(0, shake - dt * 14);
  const tx = player.x + (mouse.x - cv.width / 2) / scale * .18, ty = player.y + (mouse.y - cv.height / 2) / scale * .18;
  cam.x += (tx - cam.x) * Math.min(1, dt * 8); cam.y += (ty - cam.y) * Math.min(1, dt * 8);
  if (state === 'play' && !player.alive) { endTimer -= dt; if (endTimer <= 0) finishOnline(false); }
}
function readNetInput() {
  if (!player || !player.alive || state !== 'play') return { mx: 0, my: 0, ang: player ? player.ang : 0, f: 0, sp: 0, hd: 0, ck: mouse.cc | 0 };
  const I = readInput(), q = v => Math.round(v * 100) / 100;
  return { mx: q(I.mx), my: q(I.my), ang: Math.round(I.ang * 1000) / 1000, f: I.held ? 1 : 0, sp: I.sprint ? 1 : 0, hd: isTouch ? 1 : 0, ck: mouse.cc | 0 };
}
function finishOnline(final) {
  state = 'over'; document.body.classList.remove('playing'); if (document.exitPointerLock) document.exitPointerLock();
  const rank = player.rank || (final && overInfo && overInfo.rank) || aliveCount + 1, champ = rank === 1;
  const t = document.getElementById('endTitle'); t.textContent = champ ? `🏆 VIJAY! Champion ${player.name}!` : 'Khel Khatam'; t.style.color = champ ? '#ffd166' : '#ff6b6b';
  document.getElementById('endStats').innerHTML = `Rank <b>#${rank}</b> of ${ents.length} &nbsp;·&nbsp; Kills <b>${player.kills}</b>` + (final && overInfo ? ` &nbsp;·&nbsp; Winner: <b>${overInfo.winner}</b>` : '<br><small style="color:#b9ad96">Match abhi chal raha hai… dosre players khel rahe hain</small>');
  document.getElementById('againBtn').style.display = final ? '' : 'none'; document.getElementById('againBtn').textContent = 'Back to Lobby ▶';
  document.getElementById('leaveBtn').style.display = '';
  endEl.classList.remove('hidden');
}
function matchOver(m) { if (!online || !player) return; overInfo = m; if (m.rank) player.rank = m.rank; finishOnline(true); }
function lockPointer() { try { const pr = cv.requestPointerLock && cv.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* not allowed right now */ } }
function prelock() { if (mode3d && requireLock) lockPointer(); }
function toLobby() { online = false; state = 'menu'; player = null; ents = []; bullets = []; loot = []; glCanvas.style.display = 'none'; mm.style.display = 'none'; endEl.classList.add('hidden'); document.body.classList.remove('playing'); if (document.exitPointerLock) document.exitPointerLock(); }
const hooks = { startOnline, applySnapshot, matchOver, readNetInput, prelock, toLobby, isTouch };

window.__rann = { newGame, update, render, get state() { return { ents, loot, bullets, zone, player, aliveCount, time, st: state, fx, kick }; }, keys, mouse, view,
  world: { WORLD, buildings, trees, waters, fields, roads, labels, wallList, STYLES, WEAPONS }, hitsWall, inWater, curWeapon, mp, hooks };
})();
