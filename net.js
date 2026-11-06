/* Rann Royale – Wi-Fi multiplayer client: lobby screens + WebSocket. The game itself lives in game.js (window.__rann.hooks). */
(() => {
  const $ = id => document.getElementById(id), H = window.__rann.hooks;
  const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  let ws = null, view = 'menu', lob = null, you = -1, timer = null;
  const show = id => $(id).classList.remove('hidden'), hide = id => $(id).classList.add('hidden');
  const gfx = () => $('lbGfx').value;

  $('onName').value = store.get('rr_name', 'Preet-18');
  $('lbGfx').value = store.get('rr_gfx', '3d');
  $('lbGfx').onchange = () => store.set('rr_gfx', gfx());
  $('onCode').value = (new URLSearchParams(location.search).get('join') || '').toUpperCase().slice(0, 4);

  window.__net = { send, lobbyAgain };
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function connect() {
    return new Promise((resolve, reject) => {
      if (location.protocol === 'file:') return reject(new Error('Open the game through the server: run "node server.js" on the host computer, then visit the http://<computer-IP>:8000 address it prints.'));
      if (ws && ws.readyState === 1) return resolve();
      ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Cannot reach the game server. Is "node server.js" running, and are you on the same Wi-Fi?'));
      ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
      ws.onclose = () => { if (view === 'game' || view === 'lobby') { toast('Disconnected from the server'); setTimeout(() => location.reload(), 2500); } };
    });
  }
  function toast(text) { const t = $(view === 'lobby' ? 'lbMsg' : 'onMsg'); t.textContent = text; }

  function enterFullscreenIfTouch() { if (!H.isTouch) return; try { const de = document.documentElement, r = de.requestFullscreen || de.webkitRequestFullscreen; if (r) { const p = r.call(de); if (p && p.catch) p.catch(() => {}); } if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* optional */ } }

  /* ---------- menu -> online ---------- */
  $('onlineBtn').onclick = () => { hide('menu'); show('online'); view = 'online'; $('onMsg').textContent = ''; };
  $('onBack').onclick = () => { hide('online'); show('menu'); view = 'menu'; };
  const myName = () => { const n = $('onName').value.trim() || 'Player'; store.set('rr_name', n); return n; };
  $('onCreate').onclick = async () => { $('onMsg').textContent = 'Connecting…'; enterFullscreenIfTouch(); try { await connect(); send({ t: 'create', name: myName() }); } catch (e) { $('onMsg').textContent = e.message; } };
  $('onJoin').onclick = async () => {
    const code = $('onCode').value.trim().toUpperCase(); if (code.length !== 4) { $('onMsg').textContent = 'Enter the 4-letter room code'; return; }
    $('onMsg').textContent = 'Connecting…'; enterFullscreenIfTouch(); try { await connect(); send({ t: 'join', room: code, name: myName() }); } catch (e) { $('onMsg').textContent = e.message; }
  };
  $('onCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('onJoin').click(); });

  /* ---------- lobby ---------- */
  function showLobby() {
    view = 'lobby'; hide('online'); hide('menu'); hide('end'); show('lobby');
    const host = lob.host === you;
    $('lbRoom').textContent = lob.room;
    $('lbUrl').innerHTML = `Friends: open <b>${location.host}</b> → Play with Friends → Join → enter <b>${lob.room}</b>`;
    $('lbList').innerHTML = lob.players.map(p => `<li>${p.pid === lob.host ? '👑 ' : ''}${esc(p.name)}${p.pid === you ? ' <b>(you)</b>' : ''}</li>`).join('');
    $('lbHost').style.display = host && lob.state === 'lobby' ? '' : 'none';
    $('lbWait').style.display = host && lob.state === 'lobby' ? 'none' : '';
    $('lbWait').textContent = lob.state === 'lobby' ? 'Waiting for the host to start…' : 'A match is in progress / just finished – waiting for the host to open a new one…';
    $('lbBots').value = String(lob.bots); $('lbStart').disabled = false;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('lbRoom').onclick = () => { try { navigator.clipboard.writeText(lob.room); $('lbMsg').textContent = 'Code copied'; } catch (e) { /* ignore */ } };
  $('lbBots').onchange = () => send({ t: 'cfg', bots: +$('lbBots').value });
  $('lbStart').onclick = () => { $('lbStart').disabled = true; store.set('rr_gfx', gfx()); H.prelock(); send({ t: 'start' }); };
  $('lbLeave').onclick = () => { send({ t: 'leave' }); setTimeout(() => location.reload(), 80); };
  function lobbyAgain() { if (lob && lob.host === you) send({ t: 'again' }); else { H.toLobby(); if (lob) showLobby(); } }

  /* ---------- messages from the server ---------- */
  function onMsg(m) {
    switch (m.t) {
      case 'lobby':
        lob = m; you = m.you;
        if (m.state === 'lobby') { if (view === 'game' || view === 'end') H.toLobby(); showLobby(); }
        else if (view === 'lobby') showLobby();
        break;
      case 'start':
        view = 'game'; hide('lobby'); hide('online'); hide('menu');
        H.startOnline({ me: m.me, roster: m.roster, loot: m.loot, mode3d: gfx() === '3d' });
        if (!timer) timer = setInterval(() => { if (view === 'game') send({ t: 'in', ...H.readNetInput() }); }, 33);
        break;
      case 's': H.applySnapshot(m); break;
      case 'over': view = 'end'; H.matchOver(m); break;
      case 'err': toast(m.msg); $('lbStart').disabled = false; break;
    }
  }
})();
