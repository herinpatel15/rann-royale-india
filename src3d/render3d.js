// Rann Royale – 3D renderer (Three.js). Reads the simulation in game.js through window.__rann and draws it.
// Build:  npm run build   ->  render3d.bundle.js   (the bundle is what index.html loads)
import * as THREE from 'three';

const M = 1 / 16;                       // simulation units -> metres
let R = null;
window.__r3d = { init(canvas, api) { R = create(canvas, api); }, render(dt) { if (R) R.render(dt); } };

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashN = (x, y, z) => { let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ (z * 83492791), 2654435761); h ^= h >>> 15; return ((h >>> 0) % 10000) / 10000; };

function create(canvas, api) {
  const mobile = /[?&]touch/.test(location.search) || (!!window.matchMedia && matchMedia('(pointer:coarse)').matches);
  const W = api.world, WORLD = W.WORLD, WM = WORLD * M;
  const rnd = mulberry(1818), TAU = Math.PI * 2;

  /* ------------------------------------------------ renderer / scene */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  const HAZE = new THREE.Color('#ead7ad');
  scene.fog = new THREE.Fog(HAZE, 70, 360);
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, .1, 2000);
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });

  const sunDir = new THREE.Vector3(.5, .62, .38).normalize();
  // sky dome with sun glow
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#2a64c4') }, mid: { value: new THREE.Color('#86b9ec') }, hor: { value: HAZE.clone() }, sunDir: { value: sunDir } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vP;
      void main(){ float h = clamp(vP.y, 0., 1.); vec3 c = mix(hor, mid, smoothstep(0., .22, h)); c = mix(c, top, smoothstep(.18, .85, h));
        float s = max(dot(normalize(vP), normalize(sunDir)), 0.); c += vec3(1., .92, .72) * pow(s, 700.) * 4. + vec3(1., .8, .5) * pow(s, 10.) * .3;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  scene.add(new THREE.HemisphereLight('#cfe2ff', '#d2b077', 1.45));
  const sun = new THREE.DirectionalLight('#fff0d2', 3.1);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .06;
  Object.assign(sun.shadow.camera, { left: mobile ? -46 : -62, right: mobile ? 46 : 62, top: mobile ? 46 : 62, bottom: mobile ? -46 : -62, near: 1, far: 420 });
  scene.add(sun, sun.target);

  /* ------------------------------------------------ textures */
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function tex(c, repeat) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); } return t; }
  function noiseTile(size, base, amp, bricks) {
    const c = cnv(size, size), g = c.getContext('2d'), im = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) { const n = base + (rnd() - .5) * amp * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = n; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    if (bricks) { g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2; const bh = size / 8; for (let r = 0; r < 8; r++) { g.beginPath(); g.moveTo(0, r * bh); g.lineTo(size, r * bh); g.stroke(); const off = (r % 2) * size / 8; for (let x = off; x < size; x += size / 4) { g.beginPath(); g.moveTo(x, r * bh); g.lineTo(x, (r + 1) * bh); g.stroke(); } } }
    return c;
  }
  const plasterTex = tex(noiseTile(256, 238, .16, false), 0); plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
  const stoneTex = tex(noiseTile(256, 226, .22, true), 0); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;

  function groundTexture() {
    const S = 2048, c = cnv(S, S), g = c.getContext('2d'), k = S / WORLD;
    g.fillStyle = '#d3ba85'; g.fillRect(0, 0, S, S);
    const blot = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1; };
    const sands = ['#c9ad74', '#dcc592', '#cfb57c', '#d9c18a', '#bfa26a'];
    for (let i = 0; i < 380; i++) blot(rnd() * S, rnd() * S, 30 + rnd() * 150, sands[i % 5], .35);
    for (let i = 0; i < 150; i++) { const x = 1475 + (rnd() - .5) * 700, y = 1000 + rnd() * 2800; blot(x * k, y * k, (40 + rnd() * 90) * k * 2, rnd() < .6 ? '#8fa656' : '#a8b866', .32); }
    for (let i = 0; i < 40; i++) { const x = 1700 + rnd() * 1300, y = 3000 + rnd() * 900; blot(x * k, y * k, (80 + rnd() * 140) * k * 2, '#9bb05c', .3); }
    // packed earth plazas under the settlements
    for (const [cx, cy, r] of [[900, 850, 480], [3000, 900, 460], [820, 3000, 470], [3000, 2950, 420], [2150, 3350, 420]]) blot(cx * k, cy * k, r * k * 1.5, '#bda071', .75);
    // river bed + wet banks
    for (const w of W.waters) { g.fillStyle = '#8c7b55'; g.fillRect((w.x - 60) * k, (w.y - 60) * k, (w.w + 120) * k, (w.h + 120) * k); g.fillStyle = '#6b5d3f'; g.fillRect((w.x - 12) * k, (w.y - 12) * k, (w.w + 24) * k, (w.h + 24) * k); }
    // roads
    g.lineCap = g.lineJoin = 'round';
    for (const r of W.roads) { for (const [lw, col] of [[82, '#a88f5c'], [64, '#bba46f'], [30, '#c9b27d']]) { g.strokeStyle = col; g.lineWidth = lw * k; g.beginPath(); g.moveTo(r[0][0] * k, r[0][1] * k); for (let i = 1; i < r.length; i++) g.lineTo(r[i][0] * k, r[i][1] * k); g.stroke(); } }
    // fort courtyard stone
    g.fillStyle = '#b9a98a'; g.fillRect(1640 * k, 1640 * k, 720 * k, 720 * k);
    // fields: ploughed soil
    for (const f of W.fields) { g.fillStyle = '#6a4a2a'; g.fillRect(f.x * k, f.y * k, f.w * k, f.h * k); g.fillStyle = 'rgba(40,25,10,.35)'; for (let x = f.x; x < f.x + f.w; x += 14) g.fillRect(x * k, f.y * k, 3 * k, f.h * k); }
    // speckle
    for (let i = 0; i < 90000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(90,70,35,.22)' : 'rgba(255,240,200,.18)'; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
    return tex(c);
  }

  /* ------------------------------------------------ ground / water */
  const gMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 });
  const bump = new THREE.CanvasTexture(noiseTile(256, 128, .9, false)); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(230, 230);
  gMat.bumpMap = bump; gMat.bumpScale = .45;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WM, WM), gMat); ground.rotation.x = -Math.PI / 2; ground.position.set(WM / 2, 0, WM / 2); ground.receiveShadow = true; scene.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#b39a6a', roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(WM / 2, -.08, WM / 2); scene.add(outer);

  const rip = cnv(256, 256), rg = rip.getContext('2d'); rg.fillStyle = '#4b97c4'; rg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { rg.strokeStyle = `rgba(255,255,255,${.06 + rnd() * .14})`; rg.lineWidth = 1 + rnd() * 2; const x = rnd() * 256, y = rnd() * 256; rg.beginPath(); rg.moveTo(x, y); rg.quadraticCurveTo(x + 14, y - 5, x + 30, y); rg.stroke(); }
  const rippleTex = tex(rip); rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  const waterMeshes = [];
  for (const w of W.waters) {
    const t = rippleTex.clone(); t.needsUpdate = true; t.repeat.set(w.w * M / 6, w.h * M / 6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.w * M, w.h * M), new THREE.MeshStandardMaterial({ map: t, color: '#7fc0e6', roughness: .1, metalness: .15, transparent: true, opacity: .86 }));
    m.rotation.x = -Math.PI / 2; m.position.set((w.x + w.w / 2) * M, .06, (w.y + w.h / 2) * M); m.receiveShadow = true; scene.add(m); waterMeshes.push(m);
  }

  /* ------------------------------------------------ geometry helpers (merge into few draw calls) */
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function prep(geom, color, x, y, z, o = {}) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(...(o.s || [1, 1, 1]));
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const pos = g.attributes.position, n = pos.count, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      uv[i * 2] = (px + pz) * .4; uv[i * 2 + 1] = py * .4;
      const sh = o.flat ? 1 : .72 + .28 * Math.min(1, Math.max(0, py / 1.4));
      col[i * 3] = c.r * sh; col[i * 3 + 1] = c.g * sh; col[i * 3 + 2] = c.b * sh;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function merge(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3); let o = 0;
    for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(U, 2)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return out;
  }
  const mkMat = (map, rough = .88) => new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: rough, metalness: 0 });
  const plasterMat = mkMat(plasterTex), stoneMat = mkMat(stoneTex), plainMat = mkMat(null, .8);
  function addMesh(list, mat, shadow = true, recv = true) { if (!list.length) return null; const m = new THREE.Mesh(merge(list), mat); m.castShadow = shadow; m.receiveShadow = recv; scene.add(m); return m; }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const lift = c => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), .22).getHexString();
  const hOf = b => b.kind === 'fortwall' ? 5.6 : b.kind === 'palace' ? 4.6 : b.kind === 'camp' ? 2.0 : b.kind === 'temple' ? 3.6 : b.kind === 'haveli' ? 3.6 : b.style === 'fort' ? 3.8 : b.style === 'village' ? 2.7 : 3.0;

  /* ------------------------------------------------ buildings */
  const plasterList = [], stoneList = [], propList = [], floorList = [];
  for (const w of W.wallList) {
    const b = w.b, H = hOf(b), col = lift(W.STYLES[b.style].wall), wm = w.w * M, dm = w.h * M;
    (b.style === 'fort' ? stoneList : plasterList).push(prep(box(wm, H, dm), col, (w.x + w.w / 2) * M, H / 2, (w.y + w.h / 2) * M));
    if (b.kind === 'fortwall') { // battlements
      const long = wm > dm, len = long ? wm : dm, n = Math.floor(len / 2.1);
      for (let i = 0; i < n; i++) { const t = -len / 2 + (i + .5) * (len / n); stoneList.push(prep(box(long ? 1 : wm * .95, .95, long ? dm * .95 : 1), '#8d7b63', (w.x + w.w / 2) * M + (long ? t : 0), H + .475, (w.y + w.h / 2) * M + (long ? 0 : t), { flat: true })); }
    } else if (b.kind !== 'camp') { // plinth + eaves line
      plasterList.push(prep(box(wm + .08, .25, dm + .08), W.STYLES[b.style].edge, (w.x + w.w / 2) * M, .125, (w.y + w.h / 2) * M, { flat: true }));
    }
  }
  for (const b of W.buildings) floorList.push(prep(box(b.w * M, .14, b.h * M), W.STYLES[b.style].floor, (b.x + b.w / 2) * M, .07, (b.y + b.h / 2) * M, { flat: true }));
  const floors = addMesh(floorList, plasterMat, false, true);
  addMesh(plasterList, plasterMat); addMesh(stoneList, stoneMat);

  // roofs (one mesh per building so they can be hidden when you are inside)
  const stripeC = cnv(128, 16), sg = stripeC.getContext('2d'); ['#ff9933', '#e84a8a', '#1fb5a8', '#f4d35e', '#ffffff', '#138808'].forEach((c, i) => { sg.fillStyle = c; sg.fillRect(i * 21.33, 0, 22, 16); });
  const stripeTex = tex(stripeC); stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping; stripeTex.repeat.set(3, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: .85 });
  const roofs = [];
  const cone4 = new THREE.ConeGeometry(1, 1, 4, 1), sph = new THREE.SphereGeometry(1, 24, 12), hemi = new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2), cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  function addRoof(b) {
    const w = b.w * M, d = b.h * M, cx = (b.x + b.w / 2) * M, cz = (b.y + b.h / 2) * M, H = hOf(b), L = [];
    const big = w > 14;
    if (b.kind === 'fortwall') return;
    if (b.kind === 'bazaar') {
      const m = new THREE.Mesh(box(w + .7, .22, d + .7), stripeMat); m.position.set(cx, H + .11, cz); m.castShadow = m.receiveShadow = true; scene.add(m); roofs.push({ m, b }); return;
    }
    if (b.kind === 'village' || b.kind === 'farm') {
      L.push(prep(cone4, b.kind === 'farm' ? '#b89a58' : '#a9552f', cx, H + .85, cz, { ry: Math.PI / 4, s: [(w / 2 + .45) / .7071, 1.7, (d / 2 + .45) / .7071], flat: true }));
    } else if (b.kind === 'camp') {
      L.push(prep(cone4, '#4f7d3a', cx, H + 1.0, cz, { ry: Math.PI / 4, s: [(w / 2 + .35) / .7071, 2.0, (d / 2 + .35) / .7071], flat: true }));
    } else if (b.kind === 'haveli') {
      L.push(prep(box(w + .5, .3, d + .5), '#e9c6a8', cx, H + .15, cz, { flat: true }));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = cx + sx * (w / 2 - .9), pz = cz + sz * (d / 2 - .9);
        L.push(prep(cyl, '#d8508a', px, H + .9, pz, { s: [.45, 1.2, .45], flat: true })); L.push(prep(hemi, '#f6e8d2', px, H + 1.5, pz, { s: [.75, .75, .75], flat: true })); L.push(prep(sph, '#e6b422', px, H + 2.35, pz, { s: [.12, .12, .12], flat: true })); }
      L.push(prep(box(w * .35, 1.3, d * .35), '#f2dcc4', cx, H + .95, cz, { flat: true }));
    } else if (b.kind === 'temple' && big) { // main mandir: stepped shikhara
      let y = H, ww = w, dd = d; for (let i = 0; i < 5; i++) { const h = 1.25 - i * .1; ww *= .74; dd *= .74; L.push(prep(box(ww, h, dd), i % 2 ? '#f4a53a' : '#f6efe2', cx, y + h / 2, cz, { flat: true })); y += h; }
      L.push(prep(cone4, '#ff9933', cx, y + 1.3, cz, { ry: Math.PI / 4, s: [ww * .75 / .7071 / 1.0 * .9, 2.6, dd * .75 / .7071 * .9], flat: true })); y += 2.6;
      L.push(prep(sph, '#f0c030', cx, y + .2, cz, { s: [.3, .3, .3], flat: true })); L.push(prep(cyl, '#6b4a22', cx, y + 1.2, cz, { s: [.05, 2, .05], flat: true }));
      L.push(prep(box(.9, .5, .02), '#ff7a00', cx + .5, y + 1.8, cz, { flat: true }));
    } else if (b.kind === 'temple') { // small shrine: white dome
      L.push(prep(box(w + .3, .3, d + .3), '#f6efe2', cx, H + .15, cz, { flat: true })); L.push(prep(hemi, '#fbf3e4', cx, H + .3, cz, { s: [Math.min(w, d) * .38, Math.min(w, d) * .38, Math.min(w, d) * .38], flat: true })); L.push(prep(sph, '#e6b422', cx, H + .3 + Math.min(w, d) * .38 + .1, cz, { s: [.14, .22, .14], flat: true }));
    } else if (b.kind === 'palace') {
      L.push(prep(box(w + .4, .4, d + .4), '#f4e7cf', cx, H + .2, cz, { flat: true })); L.push(prep(cyl, '#f6efe2', cx, H + 1.4, cz, { s: [w * .33, 2, w * .33], flat: true }));
      L.push(prep(hemi, '#ff9933', cx, H + 2.4, cz, { s: [w * .36, w * .36, w * .36], flat: true })); L.push(prep(sph, '#f0c030', cx, H + 2.4 + w * .36 + .2, cz, { s: [.22, .3, .22], flat: true }));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = cx + sx * (w / 2 - .7), pz = cz + sz * (d / 2 - .7); L.push(prep(cyl, '#f6efe2', px, H + 1.1, pz, { s: [.5, 1.4, .5], flat: true })); L.push(prep(hemi, '#138808', px, H + 1.8, pz, { s: [.62, .7, .62], flat: true })); }
    } else { // fort inner halls: flat roof with merlons
      L.push(prep(box(w + .3, .4, d + .3), '#9a8767', cx, H + .2, cz, { flat: true }));
      for (let i = 0; i < Math.floor(w / 1.6); i++) for (const sz of [-1, 1]) L.push(prep(box(.8, .7, .5), '#8d7b63', cx - w / 2 + .8 + i * 1.6, H + .75, cz + sz * (d / 2 + .05), { flat: true }));
    }
    const m = new THREE.Mesh(merge(L), b.style === 'fort' ? stoneMat : plasterMat); m.castShadow = m.receiveShadow = true; scene.add(m); roofs.push({ m, b });
  }
  for (const b of W.buildings) addRoof(b);

  // fort: corner turrets, perimeter wall, flag pole
  const fortList = [];
  for (const [fx, fy] of [[1640, 1640], [2360, 1640], [1640, 2360], [2360, 2360]]) {
    fortList.push(prep(cyl, '#8d7b63', fx * M, 4.2, fy * M, { s: [1.5, 8.4, 1.5] })); fortList.push(prep(cyl, '#a09070', fx * M, 8.5, fy * M, { s: [1.85, .5, 1.85], flat: true }));
    fortList.push(prep(hemi, '#c0392b', fx * M, 8.7, fy * M, { s: [1.5, 1.7, 1.5], flat: true })); fortList.push(prep(sph, '#f0c030', fx * M, 10.5, fy * M, { s: [.16, .24, .16], flat: true }));
  }
  const bw = WM + 3; // outer boundary wall
  for (const [x, z, w, d] of [[WM / 2, -.75, bw, 1.5], [WM / 2, WM + .75, bw, 1.5], [-.75, WM / 2, 1.5, bw], [WM + .75, WM / 2, 1.5, bw]]) fortList.push(prep(box(w, 5, d), '#8a7a5e', x, 2.5, z));
  addMesh(fortList, stoneMat);
  const poleX = 2000 * M, poleZ = 2000 * M, poleTop = 4.6 + 2.4 + 10 * .36 * 1 + 1.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, 5.5, 8), new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: .6, roughness: .3 }));
  pole.position.set(poleX, 4.6 + 2.4 + 10 * .36 + 2.2, poleZ); pole.castShadow = true; scene.add(pole);
  const fc = cnv(192, 128), fg = fc.getContext('2d'); fg.fillStyle = '#ff9933'; fg.fillRect(0, 0, 192, 43); fg.fillStyle = '#fff'; fg.fillRect(0, 43, 192, 42); fg.fillStyle = '#138808'; fg.fillRect(0, 85, 192, 43);
  fg.strokeStyle = '#1a2a9a'; fg.lineWidth = 2; fg.beginPath(); fg.arc(96, 64, 17, 0, TAU); fg.stroke(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; fg.beginPath(); fg.moveTo(96, 64); fg.lineTo(96 + Math.cos(a) * 17, 64 + Math.sin(a) * 17); fg.stroke(); }
  const flagGeo = new THREE.PlaneGeometry(2.7, 1.8, 16, 8), flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: tex(fc), side: THREE.DoubleSide, roughness: .9 }));
  flag.position.set(poleX + 1.35, pole.position.y + 1.6, poleZ); flag.castShadow = true; scene.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  /* ------------------------------------------------ vegetation (instanced) */
  function blob(r, x, y, z, color, sc = [1, 1, 1]) {
    const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), n = 1 + (hashN(Math.round(vx * 9), Math.round(vy * 9), Math.round(vz * 9)) - .5) * .34; p.setXYZ(i, vx * n, vy * n, vz * n); }
    const nm = g.attributes.normal; for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1; nm.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); }
    return prep(g, color, x, y, z, { s: sc, flat: true });
  }
  const banyan = merge([
    prep(new THREE.CylinderGeometry(.7, 1.0, 3.6, 10), '#5a4128', 0, 1.8, 0),
    blob(3.4, 0, 5.4, 0, '#2d6e32', [1, .75, 1]), blob(2.5, 2.4, 4.7, 1.2, '#37803a', [1, .8, 1]), blob(2.6, -2.2, 4.5, -1.5, '#2b6a30', [1, .8, 1]), blob(2.2, .5, 4.4, -2.7, '#3a8a3c', [1, .75, 1]), blob(2.0, -.8, 6.4, .8, '#43963f', [1, .8, 1]),
    ...[0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * TAU; return prep(new THREE.CylinderGeometry(.05, .07, 4, 5), '#5a4128', Math.cos(a) * 2.6, 2.6, Math.sin(a) * 2.6, { flat: true }); }),
  ]);
  const neem = merge([
    prep(new THREE.CylinderGeometry(.34, .5, 2.9, 8), '#6a4b2c', 0, 1.45, 0),
    blob(2.3, 0, 4.1, 0, '#4f9d3f', [1, .85, 1]), blob(1.6, 1.4, 3.5, .8, '#5cae48', [1, .85, 1]), blob(1.6, -1.2, 3.4, -.9, '#478f39', [1, .85, 1]),
  ]);
  const palmParts = [];
  for (let i = 0; i < 6; i++) palmParts.push(prep(new THREE.CylinderGeometry(.2 - i * .01, .24 - i * .01, 1.2, 7), '#8a6a45', i * .06, .6 + i * 1.18, 0, { rz: -.04 * i }));
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; palmParts.push(prep(box(2.4, .05, .4), i % 2 ? '#3f8a3a' : '#4c9a42', .35 + Math.cos(a) * 1.0, 7.3, Math.sin(a) * 1.0, { ry: -a, rz: -.55, flat: true })); }
  palmParts.push(prep(sph, '#6b4a22', .3, 7.0, 0, { s: [.22, .22, .22], flat: true }));
  const palm = merge(palmParts);
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  const byKind = { banyan: [], neem: [], palm: [] }; for (const t of W.trees) byKind[t.kind].push(t);
  const dummy = new THREE.Object3D();
  for (const [kind, geo] of [['banyan', banyan], ['neem', neem], ['palm', palm]]) {
    const list = byKind[kind]; if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, treeMat, list.length); im.castShadow = im.receiveShadow = true;
    list.forEach((t, i) => { dummy.position.set(t.x * M, 0, t.y * M); dummy.rotation.set(0, rnd() * TAU, 0); const s = .85 + rnd() * .4; dummy.scale.set(s, s * (.9 + rnd() * .25), s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, new THREE.Color().setHSL(.0 + rnd() * .03, 0, .93 + rnd() * .1)); });
    scene.add(im);
  }
  // rocks + dry grass tufts + crops
  const free = (x, y) => !W.buildings.some(b => x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.h + 40) && !W.waters.some(w => x > w.x - 20 && x < w.x + w.w + 20 && y > w.y - 20 && y < w.y + w.h + 20);
  const rockGeo = new THREE.DodecahedronGeometry(.5, 0), NR = mobile ? 200 : 420, rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#a59a86', roughness: 1, flatShading: true }), NR); let rn = 0;
  while (rn < NR) { const x = rnd() * WORLD, y = rnd() * WORLD; if (!free(x, y)) continue; dummy.position.set(x * M, .15, y * M); dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); const s = .3 + rnd() * rnd() * 1.4; dummy.scale.set(s * (1 + rnd() * .6), s * .7, s); dummy.updateMatrix(); rocks.setMatrixAt(rn++, dummy.matrix); }
  rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks);
  const tuftGeo = new THREE.ConeGeometry(.12, .7, 4), NT = mobile ? 600 : 1500, tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: '#7e9a45', roughness: 1 }), NT); let tn = 0;
  while (tn < NT) { const nearR = rnd() < .6, x = nearR ? 1475 + (rnd() - .5) * 1200 : rnd() * WORLD, y = nearR ? 1000 + rnd() * 2800 : rnd() * WORLD; if (!free(x, y)) continue; for (let k = 0; k < 3 && tn < NT; k++) { dummy.position.set(x * M + (rnd() - .5) * .5, .3, y * M + (rnd() - .5) * .5); dummy.rotation.set((rnd() - .5) * .5, rnd() * 3, (rnd() - .5) * .5); const s = .7 + rnd() * .9; dummy.scale.set(s, s, s); dummy.updateMatrix(); tufts.setMatrixAt(tn++, dummy.matrix); } }
  scene.add(tufts);
  const crops = [];
  for (const f of W.fields) for (let x = f.x + 20; x < f.x + f.w - 10; x += 14) { crops.push(prep(box(.55, .6 + rnd() * .2, (f.h - 24) * M), rnd() < .5 ? '#6fa23c' : '#7db044', (x + 3) * M, .35, (f.y + f.h / 2) * M, { flat: true })); }
  addMesh(crops, plainMat, true, true);
  // haystacks beside the farm
  const hay = [];
  for (const [x, y] of [[1700, 3320], [1760, 3350], [2700, 3330], [2740, 3370], [1650, 3720], [2900, 3640]]) { hay.push(prep(cyl, '#c9a24a', x * M, .6, y * M, { s: [1.1, 1.2, 1.1], flat: true })); hay.push(prep(cone4, '#d7b258', x * M, 1.6, y * M, { ry: Math.PI / 4, s: [1.5, 1.0, 1.5], flat: true })); }
  addMesh(hay, plainMat);

  // floating place names
  for (const [name, x, y] of W.labels) {
    const c = cnv(512, 96), g = c.getContext('2d'); g.font = 'bold 54px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.lineWidth = 9; g.strokeStyle = 'rgba(40,20,0,.85)'; g.strokeText(name, 256, 62); g.fillStyle = '#ffe2a8'; g.fillText(name, 256, 62);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, fog: false, depthWrite: false, opacity: .9 })); sp.scale.set(30, 5.6, 1); sp.position.set(x * M, 16, y * M); scene.add(sp);
  }
  // clouds
  const cc = cnv(256, 128), cg = cc.getContext('2d'); for (let i = 0; i < 26; i++) { const x = 60 + rnd() * 136, y = 50 + rnd() * 30, r = 22 + rnd() * 30, gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.beginPath(); cg.arc(x, y, r, 0, TAU); cg.fill(); }
  const cloudTex = tex(cc), clouds = [];
  for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, fog: false, depthWrite: false, opacity: .8 })); const sc = 180 + rnd() * 180; s.scale.set(sc, sc / 2, 1); s.position.set(rnd() * 1600 - 600, 170 + rnd() * 90, rnd() * 1600 - 600); scene.add(s); clouds.push(s); }

  /* ------------------------------------------------ characters */
  const matCache = {};
  const M_ = (c, r = .85, m = 0) => matCache[c + r + m] || (matCache[c + r + m] = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
  const bx = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(box(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const cy_ = (r, len, mat, x, y, z, parent, axisX = true) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); if (axisX) m.rotation.z = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const GUN_LEN = { pistol: .24, smg: .5, rifle: .95, shotgun: .9, sniper: 1.25 };
  function gunModel(kind) {
    const g = new THREE.Group(), steel = M_('#23262a', .45, .7), wood = M_('#7a4b22', .7), dark = M_('#15171a', .5, .4);
    if (kind === 'pistol') { bx(.2, .05, .035, steel, .1, .02, 0, g); bx(.05, .12, .035, dark, .03, -.05, 0, g).rotation.z = .2; }
    else if (kind === 'smg') { bx(.34, .075, .05, dark, .17, 0, 0, g); bx(.05, .17, .035, steel, .15, -.11, 0, g); cy_(.016, .16, steel, .42, .01, 0, g); bx(.16, .03, .03, steel, -.08, 0, 0, g); bx(.05, .1, .035, dark, .06, -.08, 0, g); }
    else if (kind === 'rifle') { bx(.44, .08, .055, steel, .22, 0, 0, g); bx(.3, .075, .06, wood, .6, -.005, 0, g); cy_(.014, .4, steel, .88, .015, 0, g); bx(.06, .17, .04, steel, .34, -.12, 0, g).rotation.z = .25; bx(.3, .09, .045, wood, -.14, -.01, 0, g); bx(.05, .1, .04, wood, .05, -.09, 0, g); bx(.03, .04, .03, steel, .96, .05, 0, g); }
    else if (kind === 'shotgun') { cy_(.022, .85, steel, .45, .02, 0, g); cy_(.016, .6, steel, .4, -.02, 0, g); bx(.22, .055, .065, wood, .5, -.03, 0, g); bx(.28, .09, .05, steel, .12, 0, 0, g); bx(.34, .1, .045, wood, -.2, -.015, 0, g); }
    else { cy_(.014, .9, steel, .75, .02, 0, g); bx(.4, .08, .05, M_('#3c4a33', .7), .2, 0, 0, g); bx(.34, .1, .045, M_('#3c4a33', .7), -.17, -.01, 0, g); cy_(.03, .32, dark, .3, .1, 0, g); cy_(.022, .04, M_('#6fb7ff', .2, .1), .47, .1, 0, g); bx(.03, .16, .03, steel, .62, -.07, .03, g).rotation.x = .3; }
    g.userData.len = GUN_LEN[kind]; return g;
  }
  const flashTex = (() => { const c = cnv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(.3, 'rgba(255,200,80,.85)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c); })();
  const numTex = (() => { const c = cnv(128, 128), g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.font = 'bold 84px Trebuchet MS'; g.textAlign = 'center'; g.fillStyle = '#12327a'; g.fillText('18', 64, 92); return tex(c); })();

  const persons = new Map();
  function makePerson(e) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const skin = M_('#d6a073', .7), kurta = M_(e.kurta, .9), pants = M_(e.isPlayer ? '#f3efe4' : ['#2b2b33', '#3a3a2f', '#4a3b2a', '#ece7da'][Math.floor(Math.random() * 4)], .9), turban = M_(e.turban, .85), shoe = M_('#2a1d12', .8);
    const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(0, .86, -.12); legR.position.set(0, .86, .12); body.add(legL, legR);
    for (const l of [legL, legR]) { bx(.2, .78, .2, pants, 0, -.4, 0, l); bx(.27, .1, .21, shoe, .04, -.84, 0, l); }
    bx(.3, .72, .46, kurta, 0, 1.2, 0, body); bx(.32, .38, .44, kurta, 0, .86, 0, body);
    if (e.isPlayer) { const sash = bx(.33, .07, .5, M_('#ff9933', .8), 0, 1.5, 0, body); sash.rotation.x = .0; bx(.34, .07, .2, M_('#138808', .8), 0, 1.4, .0, body).rotation.x = .4; }
    for (const s of [-1, 1]) { const len = s < 0 ? .68 : .5, arm = new THREE.Group(); arm.position.set(.02, 1.42, s * .27); arm.rotation.y = s < 0 ? -.76 : .14; arm.rotation.z = -.2; body.add(arm); bx(len, .11, .11, kurta, len / 2, 0, 0, arm); const hand = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), skin); hand.position.set(len + .02, 0, 0); arm.add(hand); }
    const head = new THREE.Mesh(new THREE.SphereGeometry(.125, 14, 12), skin); head.position.set(.02, 1.64, 0); head.castShadow = true; body.add(head);
    const tb = new THREE.Mesh(new THREE.SphereGeometry(.155, 14, 10), turban); tb.scale.set(1.05, .8, 1.05); tb.position.set(0, 1.74, 0); tb.castShadow = true; body.add(tb);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.14, .035, 6, 16), turban); band.rotation.x = Math.PI / 2; band.position.set(0, 1.66, 0); body.add(band);
    for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(.015, 6, 6), M_('#111')); eye.position.set(.135, 1.65, s * .05); body.add(eye); }
    if (!e.isPlayer && Math.random() < .45) { const beard = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8, 0, TAU, Math.PI / 2, Math.PI / 2), M_('#1b1410', 1)); beard.position.set(.05, 1.6, 0); beard.scale.set(1, 1, 1.05); body.add(beard); }
    if (e.isPlayer) { const num = new THREE.Mesh(new THREE.PlaneGeometry(.34, .34), new THREE.MeshBasicMaterial({ map: numTex, transparent: true })); num.rotation.y = -Math.PI / 2; num.position.set(-.162, 1.22, 0); body.add(num); }
    const gunSlot = new THREE.Group(); gunSlot.position.set(.34, 1.2, .2); body.add(gunSlot);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); flash.visible = false; gunSlot.add(flash);
    let light = null; if (e.isPlayer) { light = new THREE.PointLight('#ffb050', 0, 14, 2); gunSlot.add(light); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .65, 32), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: .8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; ring.visible = false; root.add(ring);
    let label = null, lctx = null, lc = null;
    if (!e.isPlayer) { lc = cnv(256, 64); lctx = lc.getContext('2d'); const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; label = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true, depthWrite: false, fog: false })); label.scale.set(2.2, .55, 1); label.position.y = 2.25; root.add(label); }
    scene.add(root);
    const P = { root, body, legL, legR, gunSlot, gun: null, gunKind: null, flash, light, ring, label, lctx, lc, lkey: '', phase: Math.random() * 6, px: e.x, py: e.y, deadT: 0, speed: 0 };
    persons.set(e, P); return P;
  }
  function drawLabel(P, e) {
    const key = e.name + Math.ceil(e.hp / 5) + Math.ceil(e.armor / 25); if (key === P.lkey) return; P.lkey = key;
    const g = P.lctx; g.clearRect(0, 0, 256, 64); g.font = 'bold 26px Trebuchet MS'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(e.name, 128, 26); g.fillStyle = '#fff'; g.fillText(e.name, 128, 26);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(56, 38, 144, 10); g.fillStyle = e.hp > 35 ? '#5fd35f' : '#e63946'; g.fillRect(57, 39, 142 * Math.max(0, e.hp) / 100, 8);
    if (e.armor > 0) { g.fillStyle = '#4a8fe7'; g.fillRect(57, 50, 142 * e.armor / 100, 4); }
    P.label.material.map.needsUpdate = true;
  }
  function updatePerson(e, dt, T) {
    const P = persons.get(e) || makePerson(e), st = api.state, pl = st.player;
    P.root.position.set(e.x * M, 0, e.y * M); P.root.rotation.y = -e.ang;
    const mv = Math.hypot(e.x - P.px, e.y - P.py) * M / Math.max(dt, 1e-3); P.px = e.x; P.py = e.y; P.speed += (Math.min(mv, 9) - P.speed) * Math.min(1, dt * 10);
    const w = api.curWeapon(e), kind = w ? w.k : null;
    if (kind !== P.gunKind) { if (P.gun) P.gunSlot.remove(P.gun); P.gun = kind ? gunModel(kind) : null; if (P.gun) { P.gunSlot.add(P.gun); P.flash.position.set(P.gun.userData.len + .08, .02, 0); P.flash.scale.set(.7, .7, 1); } P.gunKind = kind; }
    if (!e.alive) {
      P.deadT = Math.min(1, P.deadT + dt * 2.4); const t = P.deadT * P.deadT * (3 - 2 * P.deadT);
      P.body.rotation.z = -t * Math.PI / 2; P.body.position.y = t * .24; P.legL.rotation.z = P.legR.rotation.z = 0; if (P.gun) P.gun.visible = false; if (P.label) P.label.visible = false; P.flash.visible = false; P.ring.visible = false; if (P.light) P.light.intensity = 0; return;
    }
    P.phase += P.speed * dt * 2.3; const amp = Math.min(.85, P.speed / 4);
    P.legL.rotation.z = Math.sin(P.phase) * amp; P.legR.rotation.z = -Math.sin(P.phase) * amp;
    P.body.position.y = Math.abs(Math.sin(P.phase)) * .05 * (amp > .1 ? 1 : 0) + Math.sin(T * 2 + P.phase) * .004;
    P.body.rotation.z = e.sprint ? -.18 : 0;
    if (P.gun) P.gun.rotation.z = e.reload > 0 ? -.7 : 0;
    P.flash.visible = e.flash > 0; if (P.light) P.light.intensity = e.flash > 0 ? 12 : 0;
    P.ring.visible = e.healT > 0; if (e.healT > 0) { const s = 1 + (1 - e.healT / 1.8) * .8; P.ring.scale.set(s, s, s); }
    if (P.label) { const d = Math.hypot(e.x - pl.x, e.y - pl.y) * M; P.label.visible = d < 55; if (P.label.visible) drawLabel(P, e); }
  }

  /* ------------------------------------------------ loot, bullets, particles, zone */
  const lootCol = { weapon: '#ffffff', ammo: '#ffd60a', heal: '#ffc830', armor: '#59a7ff' };
  const beamGeo = new THREE.CylinderGeometry(.16, .22, 4.2, 10, 1, true);
  const beamMats = {}; for (const k in lootCol) beamMats[k] = new THREE.MeshBasicMaterial({ color: lootCol[k], transparent: true, opacity: .08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const lootMeshes = new Map();
  function makeLoot(it) {
    const g = new THREE.Group(), item = new THREE.Group(); g.add(item);
    if (it.type === 'weapon') { const m = gunModel(it.k); m.scale.setScalar(1.35); m.position.x = -m.userData.len * .6; item.add(m); }
    else if (it.type === 'ammo') { bx(.36, .22, .24, M_('#c9a227', .5, .3), 0, 0, 0, item); bx(.38, .06, .26, M_('#6b4a10', .6), 0, .08, 0, item); for (let i = 0; i < 3; i++) cy_(.035, .14, M_('#d8b04a', .3, .8), -.1 + i * .1, .15, 0, item, false); }
    else if (it.type === 'heal') { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.17, .12, .3, 14), M_('#f4f4ee', .3)); item.add(cup); const milk = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .02, 14), M_('#ffc20e', .3)); milk.position.y = .13; item.add(milk); const h = new THREE.Mesh(new THREE.TorusGeometry(.1, .025, 6, 10, Math.PI), M_('#f4f4ee', .3)); h.position.set(.18, .02, 0); h.rotation.z = -Math.PI / 2; item.add(h); }
    else { bx(.42, .46, .2, M_('#3f7fd6', .5, .2), 0, 0, 0, item); bx(.14, .12, .2, M_('#2b5ca6', .5), -.14, .27, 0, item); bx(.14, .12, .2, M_('#2b5ca6', .5), .14, .27, 0, item); bx(.44, .08, .22, M_('#ffd166', .4, .5), 0, -.1, 0, item); }
    item.position.y = .95; item.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const beam = new THREE.Mesh(beamGeo, beamMats[it.type]); beam.position.y = 2.1; g.add(beam);
    g.position.set(it.x * M, 0, it.y * M); g.userData = { item, ph: Math.random() * 6 }; scene.add(g); return g;
  }
  function syncLoot(T, pl) {
    const seen = new Set();
    for (const it of api.state.loot) {
      seen.add(it); let g = lootMeshes.get(it); if (!g) { g = makeLoot(it); lootMeshes.set(it, g); }
      const d = Math.hypot(it.x - pl.x, it.y - pl.y) * M; g.visible = d < 110;
      if (g.visible) { g.userData.item.rotation.y = T * 1.4 + g.userData.ph; g.userData.item.position.y = .95 + Math.sin(T * 2.2 + g.userData.ph) * .07; }
    }
    for (const [it, g] of lootMeshes) if (!seen.has(it)) { scene.remove(g); lootMeshes.delete(it); }
  }
  const tracerGeo = new THREE.BoxGeometry(3.4, .035, .035), tracerMat = new THREE.MeshBasicMaterial({ color: '#ffe3a0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const tracers = new Map();
  function syncBullets() {
    const seen = new Set();
    for (const b of api.state.bullets) { seen.add(b); let m = tracers.get(b); if (!m) { m = new THREE.Mesh(tracerGeo, tracerMat); scene.add(m); tracers.set(b, m); m.rotation.y = -Math.atan2(b.vy, b.vx); } m.position.set(b.x * M, 1.28, b.y * M); }
    for (const [b, m] of tracers) if (!seen.has(b)) { scene.remove(m); tracers.delete(b); }
  }
  const MAXP = 700, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setDrawRange(0, 0);
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .16, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false })); points.frustumCulled = false; scene.add(points);
  const colCache = {};
  function syncFx() {
    const fx = api.state.fx; let n = 0;
    for (const f of fx) { if (n >= MAXP) break; pPos[n * 3] = f.x * M; pPos[n * 3 + 1] = 1.0 + (f.life > .3 ? .2 : 0) - (0.3 - Math.min(.3, f.life)) * 1.2; pPos[n * 3 + 2] = f.y * M; const c = colCache[f.c] || (colCache[f.c] = new THREE.Color(f.c)); pCol[n * 3] = c.r; pCol[n * 3 + 1] = c.g; pCol[n * 3 + 2] = c.b; n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }
  const zoneMat = new THREE.MeshBasicMaterial({ color: '#ff5a2a', transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false, fog: false });
  const zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 90, 160, 1, true), zoneMat); zoneWall.position.y = 45; zoneWall.frustumCulled = false; scene.add(zoneWall);
  const zoneRing = new THREE.Mesh(new THREE.TorusGeometry(1, .0035, 6, 200), new THREE.MeshBasicMaterial({ color: '#ff7a3c', fog: false })); zoneRing.rotation.x = Math.PI / 2; zoneRing.position.y = .35; zoneRing.frustumCulled = false; scene.add(zoneRing);
  const tgtWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 128, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false, fog: false })); tgtWall.position.y = 30; tgtWall.frustumCulled = false; scene.add(tgtWall);

  /* ------------------------------------------------ camera + frame */
  let T = 0, camT = 1, fov = 68;
  function updateCamera(dt) {
    const st = api.state, p = st.player, v = api.view;
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    const px = p.x * M, pz = p.y * M, py = p.alive ? 1.55 : 1.0, dist = 3.9 + (p.sprint ? .35 : 0), shoulder = .72;
    const ox = px - sy * shoulder, oz = pz + cy * shoulder, dx = -cy * cp, dy = sp, dz = -sy * cp;
    let t = 1;
    for (let s = 1; s <= 14; s++) { const f = s / 14, x = ox + dx * dist * f, z = oz + dz * dist * f, y = py + dy * dist * f; if (y < 3.6 && api.hitsWall(x / M, z / M, 6)) { t = Math.max(.1, (s - 1) / 14); break; } }
    camT = t < camT ? t : camT + (t - camT) * Math.min(1, dt * 4);
    const kk = st.kick || 0;
    camera.position.set(ox + dx * dist * camT, Math.max(.45, py + dy * dist * camT), oz + dz * dist * camT);
    camera.lookAt(camera.position.x + cy * cp * 10, camera.position.y - sp * 10 + kk * .05, camera.position.z + sy * cp * 10);
    const tf = 68 + (p.sprint ? 6 : 0) + kk * 2; fov += (tf - fov) * Math.min(1, dt * 6); if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  return {
    render(dt) {
      dt = Math.min(dt || .016, .05); T += dt;
      const st = api.state, pl = st.player; if (!pl) return;
      for (const e of st.ents) updatePerson(e, dt, T);
      syncLoot(T, pl); syncBullets(); syncFx();
      for (const r of roofs) { const b = r.b, inside = pl.x > b.x - 14 && pl.x < b.x + b.w + 14 && pl.y > b.y - 14 && pl.y < b.y + b.h + 14; r.m.visible = !inside; }
      const z = st.zone, zr = Math.max(.01, z.r * M); zoneWall.scale.set(zr, 1, zr); zoneWall.position.set(z.cx * M, 45, z.cy * M); zoneRing.scale.set(zr, zr, zr); zoneRing.position.set(z.cx * M, .35, z.cy * M);
      zoneMat.opacity = .16 + Math.sin(T * 2) * .04;
      const tr = Math.max(.01, z.tr * M); tgtWall.visible = z.state !== 'final'; tgtWall.scale.set(tr, 1, tr); tgtWall.position.set(z.tx * M, 30, z.ty * M);
      updateCamera(dt);
      const snap = .25, tx = Math.round(camera.position.x / snap) * snap, tz = Math.round(camera.position.z / snap) * snap;
      sun.target.position.set(tx, 0, tz); sun.position.set(tx + sunDir.x * 160, sunDir.y * 160, tz + sunDir.z * 160); sun.target.updateMatrixWorld();
      sky.position.copy(camera.position);
      for (const m of waterMeshes) { m.material.map.offset.x = T * .02; m.material.map.offset.y = T * .012; }
      const fp = flagGeo.attributes.position; for (let i = 0; i < fp.count; i++) { const x = flagBase[i * 3], y = flagBase[i * 3 + 1]; fp.setZ(i, Math.sin(x * 2.2 - T * 4 + y) * .14 * (x + 1.35) / 2.7); } fp.needsUpdate = true; flagGeo.computeVertexNormals();
      for (const c of clouds) { c.position.x += dt * 2.2; if (c.position.x > 1100) c.position.x = -900; }
      renderer.render(scene, camera);
    },
  };
}
