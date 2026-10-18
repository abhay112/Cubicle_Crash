// Car Fight client: photo capture, lobby, HUD, input and sound. 3D rendering lives in world.js.
import { World, POWER_COLOR, POWER_ICON } from './world.js';
import { CarPreview, hasCar, setAvailableModels, ensureModel } from './cars.js';

const $ = id => document.getElementById(id);
// On Vercel the game server is a separate host (see config.js); locally it is the page's own host
const SERVER = (window.GAME_SERVER_URL || '').replace(/\/+$/, '');
const api = p => SERVER + p;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ws = null, myId = null, roomCode = null, hostId = null, arena = null;
let players = {};           // id -> {name, color, photo, img}
let state = null;           // latest snapshot
let photo = store.get('photo') || null;
let inGame = false;

const world = new World($('three'));
window.__world = world; // handy for debugging in the console
window.__state = () => state;
let maps = [], roomSettings = null, cars = [], mapArenas = {};

// The 3D scene behind the menus shows the map the host has picked (Random keeps Autumn Valley)
function previewMap(id) {
  const a = mapArenas[id] || mapArenas.autumn;
  if (a && !inGame) world.buildArena(a);
}
let myCar = store.get('car');
const carPreview = new CarPreview($('carPreview'));
window.__carPreview = carPreview; // debugging: freeze with __carPreview.paused = true
// Falls back to the info baked in at build time when the game server can't be reached
fetch(api('/api/info')).then(r => r.json()).catch(() => fetch('/info.json').then(r => r.json())).then(info => {
  maps = info.maps;
  mapArenas = Object.fromEntries(info.maps.filter(m => m.arena).map(m => [m.id, m.arena]));
  cars = info.cars;
  setAvailableModels(cars.map(c => c.id));
  if (!hasCar(myCar)) myCar = cars.find(c => c.id === 'brezza')?.id || cars[0]?.id;
  renderCars();
  fetch('/models/credits.json').then(r => r.json()).then(c => {
    $('credits').innerHTML = '<details><summary>Car model credits</summary>' + cars.filter(x => c[x.id]).map(x => {
      const m = c[x.id];
      return `<div><a href="${m.url}" target="_blank" rel="noopener">${esc(m.title)}</a> by ${esc(m.author)} (<a href="${m.licenseUrl}" target="_blank" rel="noopener">${esc(m.license)}</a>)</div>`;
    }).join('') + '</details>';
  }).catch(() => {});
  if (!arena) world.buildArena(info.arena);
  renderMaps();
});

// ---------- Car picker ----------
const bar = v => `<div class="bar"><i style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></i></div>`;
function pickCar(id) {
  myCar = id;
  store.set('car', id);
  if (myId) send({ t: 'car', car: id });
  renderCars();
}
function renderCars() {
  if (!cars.length) return;
  const c = cars.find(x => x.id === myCar) || cars[0];
  // The preview shows the real model as soon as it has downloaded
  if (!carPreview.setCar(c.id, players[myId]?.color || '#ef4444')) {
    carPreview.pivot.clear?.();
    ensureModel(c.id).then(() => { if (myCar === c.id) carPreview.setCar(c.id, players[myId]?.color || '#ef4444'); });
  }
  $('carInfo').innerHTML = `
    <div class="brand">${esc(c.brand)}</div><div class="nm">${esc(c.name)}</div><div class="blurb">${esc(c.blurb)}</div>
    <div class="stats">Speed${bar((c.speed - 0.8) / 0.35)}Handling${bar((c.turn - 0.75) / 0.45)}Armor${bar((1.3 - c.armor) / 0.6)}</div>`;
  const chips = cars.map(x => `<button class="chip ${x.id === myCar ? 'sel' : ''}" data-car="${x.id}">${esc(x.name)}</button>`).join('');
  for (const el of [$('carChips'), $('lobbyCars')]) {
    el.innerHTML = chips;
    el.querySelectorAll('.chip').forEach(b => b.onclick = () => pickCar(b.dataset.car));
  }
}

function renderMaps() {
  if (!maps.length || !roomSettings) return;
  const isHost = myId === hostId;
  $('mapPicker').classList.toggle('readonly', !isHost);
  $('mapPicker').innerHTML = maps.map(m => `
    <button class="map ${roomSettings.map === m.id ? 'sel' : ''}" data-map="${m.id}">
      <span class="em">${m.emoji}</span>${esc(m.name)}<small>${m.w ? `${m.w / 100}×${m.h / 100}${m.arena?.levels?.length > 1 ? ' · 3 levels' : ''}` : 'Surprise me'}</small>
    </button>`).join('');
  if (isHost) $('mapPicker').querySelectorAll('.map').forEach(b => b.onclick = () => {
    roomSettings.map = b.dataset.map;
    previewMap(roomSettings.map);
    sendSettings();
    renderMaps();
  });
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  inGame = id === 'game';
}

// ---------- Sound (tiny WebAudio synth) ----------
let audio = null, muted = store.get('muted') === '1';
function sfx(kind, vol = 1) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, g = audio.createGain();
    g.connect(audio.destination);
    if (kind === 'boom' || kind === 'hit') {
      const len = kind === 'boom' ? 0.6 : 0.08;
      const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = audio.createBufferSource(); src.buffer = buf;
      const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'boom' ? 700 : 3000;
      src.connect(f); f.connect(g);
      g.gain.value = (kind === 'boom' ? 0.6 : 0.15) * vol;
      src.start(t);
    } else {
      const notes = { horn: [[392, 0], [330, 0]], pickup: [[520, 0], [780, 0.07], [1040, 0.14]] }[kind];
      for (const [freq, at] of notes) {
        const o = audio.createOscillator();
        o.type = kind === 'horn' ? 'square' : 'triangle';
        o.frequency.value = freq;
        o.connect(g);
        o.start(t + at); o.stop(t + at + (kind === 'horn' ? 0.35 : 0.1));
      }
      g.gain.setValueAtTime(0.12 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    }
  } catch {}
}

// ---------- Photo ----------
const video = $('video'), preview = $('photoPreview');
let stream = null;

function drawPreview() {
  const ctx = preview.getContext('2d');
  ctx.clearRect(0, 0, 160, 160);
  if (!photo) { $('photoPlaceholder').classList.remove('hidden'); return; }
  const img = new Image();
  img.onload = () => { ctx.drawImage(img, 0, 0, 160, 160); $('photoPlaceholder').classList.add('hidden'); };
  img.src = photo;
}
drawPreview();

function squareCrop(source, sw, sh, mirror) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d');
  const s = Math.min(sw, sh);
  if (mirror) { ctx.translate(160, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, 160, 160);
  return c.toDataURL('image/jpeg', 0.8);
}

$('camBtn').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    $('camMsg').textContent = 'Camera needs https (or localhost). Use the https link, or tap Upload to take a photo.';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 }, audio: false });
    video.srcObject = stream;
    video.classList.remove('hidden');
    preview.classList.add('hidden');
    $('photoPlaceholder').classList.add('hidden');
    $('snapBtn').classList.remove('hidden');
    $('camBtn').classList.add('hidden');
    $('camMsg').textContent = '';
  } catch (e) {
    $('camMsg').textContent = 'Could not open the camera: ' + e.message;
  }
};

$('snapBtn').onclick = () => {
  photo = squareCrop(video, video.videoWidth, video.videoHeight, true);
  store.set('photo', photo);
  stream?.getTracks().forEach(t => t.stop());
  video.classList.add('hidden');
  preview.classList.remove('hidden');
  $('snapBtn').classList.add('hidden');
  $('camBtn').classList.remove('hidden');
  $('camBtn').textContent = '📷 Retake';
  drawPreview();
};

$('fileInput').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => { photo = squareCrop(img, img.naturalWidth, img.naturalHeight, false); store.set('photo', photo); drawPreview(); };
  img.src = URL.createObjectURL(f);
};

// ---------- Connection ----------
$('nameInput').value = store.get('name') || '';

// Hosted on a static host (Vercel) without a game server configured: nothing to connect to
const NO_SERVER = !SERVER && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && /\.vercel\.app$|\.netlify\.app$|\.pages\.dev$/.test(location.hostname);
const noServerMsg = 'No game server is set up for this site. The owner needs to deploy the server and set GAME_SERVER_URL (see README), then redeploy.';
if (NO_SERVER) $('homeErr').textContent = noServerMsg;

function connect(first) {
  if (NO_SERVER) { $('homeErr').textContent = noServerMsg; return; }
  ws = new WebSocket(SERVER ? SERVER.replace(/^http/, 'ws') : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify(first));
  ws.onmessage = e => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (myId) { alert('Disconnected from the server.'); location.reload(); }
    else $('homeErr').textContent = SERVER
      ? `Could not reach the game server at ${SERVER}. If it is on a free plan it may be waking up; wait a minute and try again.`
      : 'Could not reach the game server. Is it running?';
  };
}

function begin(kind) {
  let name = $('nameInput').value.trim();
  if (!name) name = $('nameInput').value = 'Driver ' + Math.floor(10 + Math.random() * 90);
  if (!photo) { $('homeErr').textContent = 'Take a photo first so it can go on your car.'; return; }
  store.set('name', name);
  const msg = { t: kind, name, photo, car: myCar };
  if (kind === 'join') {
    msg.code = $('codeInput').value.trim().toUpperCase();
    if (msg.code.length !== 4) { $('homeErr').textContent = 'Enter the 4-letter room code.'; return; }
    msg.code = msg.code.slice(0, 4);
  }
  $('homeErr').textContent = '';
  stream?.getTracks().forEach(t => t.stop());
  connect(msg);
}
$('createBtn').onclick = () => begin('create');
$('joinBtn').onclick = () => begin('join');
// Opened from an invite link: just take a photo and join that room
const urlCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
function setInviteMode(on) {
  $('normalJoin').classList.toggle('hidden', on);
  $('inviteBanner').classList.toggle('hidden', !on);
  $('inviteJoinBtn').classList.toggle('hidden', !on);
  $('newRoomLink').classList.toggle('hidden', !on);
  $('historyBtn').classList.toggle('hidden', on);
}
if (urlCode) {
  $('codeInput').value = urlCode;
  $('inviteCode').textContent = urlCode;
  setInviteMode(true);
  if (!photo) $('camBtn').click();
}
$('inviteJoinBtn').onclick = () => begin('join');
$('newRoomLink').onclick = () => { history.replaceState(null, '', '/'); $('codeInput').value = ''; setInviteMode(false); };

const send = m => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function onMessage(m) {
  switch (m.t) {
    case 'error':
      $('homeErr').textContent = m.message;
      ws.onclose = null; ws.close();
      break;
    case 'joined':
      myId = m.id; roomCode = m.code; arena = m.arena;
      world.buildArena(m.arena);
      history.replaceState(null, '', '?room=' + m.code);
      show('lobby');
      fetch(api('/api/info')).then(r => r.json()).then(info => {
        const links = SERVER ? [`${location.origin}/?room=${m.code}`] : info.ips.map(ip => `https://${ip}:${info.httpsPort}/?room=${m.code}`);
        $('shareLink').value = links[0] || location.href;
        $('joinHint').textContent = SERVER ? 'Send this link to friends. They only take a photo and tap Join.' : 'Send this link to friends on the same Wi-Fi. They only take a photo and tap Join.';
      });
      break;
    case 'roster': onRoster(m); break;
    case 'started':
      arena = m.arena; state = null; curLevel = null;
      $('levelBadge').classList.add('hidden');
      world.buildArena(m.arena);
      $('mapName').textContent = m.arena.name || '';
      world.clearMatch();
      $('feed').innerHTML = '';
      show('game');
      // Wait for every car model before the fight begins (no placeholder cars)
      $('center-msg').textContent = 'Loading cars…';
      Promise.all(Object.values(players).map(p => ensureModel(p.car))).then(() => {
        $('center-msg').textContent = m.spectating ? 'Watching. You join next round.' : 'FIGHT!';
        setTimeout(() => { if ($('center-msg').textContent === 'FIGHT!') $('center-msg').textContent = ''; }, 1200);
      });
      break;
    case 'state': onState(m); break;
    case 'ended': showResults(m); break;
  }
}

function onRoster(m) {
  hostId = m.hostId;
  roomCode = m.code;
  const next = {};
  for (const p of m.players) {
    const old = players[p.id];
    // The server sends each photo only once; keep the one we already have
    const photo = p.photo !== undefined ? p.photo : old?.photo;
    next[p.id] = { ...p, photo, img: old && old.photo === photo ? old.img : loadImg(photo) };
  }
  players = next;
  for (const p of m.players) ensureModel(p.car); // start downloading everyone's car while in the lobby
  $('roomCode').textContent = m.code;
  $('playerCount').textContent = `${m.players.length} player${m.players.length === 1 ? '' : 's'}`;
  const isHost = myId === hostId;
  $('lobbyPlayers').innerHTML = m.players.map(mp => players[mp.id]).map(p => `
    <div class="pl">
      ${p.photo ? `<img src="${p.photo}" style="border-color:${p.color}">` : `<div class="noimg" style="border-color:${p.color}"></div>`}
      <div class="name">${esc(p.name)}</div>
      <div class="car">🚗 ${esc(cars.find(c => c.id === p.car)?.name || '')}</div>
      <div class="tag">${p.id === m.hostId ? 'HOST' : ''}${p.id === myId ? ' (you)' : ''}</div>
    </div>`).join('');
  $('hostControls').classList.toggle('hidden', !isHost);
  $('waitMsg').classList.toggle('hidden', isHost);
  $('lobbyBtn').classList.toggle('hidden', !isHost);
  $('hostBtns').classList.toggle('hidden', !isHost);
  roomSettings = m.settings;
  if (m.state === 'lobby') previewMap(m.settings.map);
  renderMaps();
  if (document.activeElement !== $('livesInput')) $('livesInput').value = m.settings.lives;
  if (document.activeElement !== $('durationInput')) $('durationInput').value = m.settings.duration;
  if (m.state === 'lobby') { show('lobby'); world.clearMatch(); state = null; }
}

function loadImg(src) {
  if (!src) return null;
  const i = new Image();
  i.src = src;
  return i;
}

$('startBtn').onclick = () => send({ t: 'start' });
$('lobbyBtn').onclick = () => send({ t: 'lobby' });
$('endBtn').onclick = () => { if (confirm('End the match now?')) send({ t: 'end' }); };
$('restartBtn').onclick = () => { if (confirm('Restart the match? Current scores are discarded.')) send({ t: 'restart' }); };
$('againBtn').onclick = () => send({ t: 'restart' });
const sendSettings = () => send({ t: 'settings', lives: $('livesInput').value, duration: $('durationInput').value, map: roomSettings?.map || 'random' });
$('livesInput').onchange = $('durationInput').onchange = sendSettings;

// ---------- HUD ----------
let curLevel = null;
const WEAPON_NAME = { gun: 'Machine gun', rocket: 'Rockets', triple: 'Triple shot', mine: 'Mines' };

function onState(m) {
  state = m;
  const me = m.cars.find(c => c.id === myId);
  for (const f of m.feed) {
    const d = document.createElement('div');
    d.textContent = f.text;
    $('feed').prepend(d);
    setTimeout(() => d.remove(), 5000);
  }
  for (const f of m.fx) {
    world.spawnFx(f);
    const near = (me ? Math.max(0.15, 1 - Math.hypot(f.x - me.x, f.y - me.y) / 1200) : 0.5) * ((f.lv || 0) === (me?.lv || 0) ? 1 : 0.2);
    if (f.k === 'boom') sfx('boom', near);
    else if (f.k === 'horn') sfx('horn', near);
    else if (f.k === 'pickup') sfx('pickup', near);
    else if (f.k === 'hit' && f.id === myId) {
      sfx('hit', 1);
      world.shake = Math.min(1.2, world.shake + 0.25 + f.dmg / 40);
      const v = $('hitFlash');
      v.style.transition = 'none';
      v.style.opacity = Math.min(1, 0.45 + f.dmg / 40);
      requestAnimationFrame(() => requestAnimationFrame(() => { v.style.transition = 'opacity .45s'; v.style.opacity = 0; }));
    }
    else if (f.k === 'spark') sfx('hit', near * 0.6);
  }
  // Level badge and a quick fade when a ramp takes you to another floor
  if (me) {
    const lv = me.lv || 0;
    if (lv !== curLevel) {
      const first = curLevel === null;
      curLevel = lv;
      const multi = (arena?.levels?.length || 1) > 1;
      $('levelBadge').classList.toggle('hidden', !multi);
      $('levelBadge').textContent = lv === 0 ? '🏢 Ground' : `🅿️ Basement ${-lv}`;
      if (!first && multi) { const f = $('levelFade'); f.style.transition = 'none'; f.style.opacity = 0.85; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; })); }
    }
  }
  const mins = Math.floor(m.timeLeft / 60), secs = String(m.timeLeft % 60).padStart(2, '0');
  $('timer').textContent = `${mins}:${secs}`;

  $('scoreboard').innerHTML = [...m.cars].sort((a, b) => b.lives - a.lives || b.k - a.k).map(c => {
    const p = players[c.id] || { name: '?', color: '#888' };
    return `<div class="sb ${c.lives ? '' : 'out'}">
      ${p.photo ? `<img src="${p.photo}" style="border-color:${p.color}">` : `<div class="noimg" style="border-color:${p.color}"></div>`}
      <span>${esc(p.name)}</span><span class="k">${'♥'.repeat(Math.max(0, c.lives))} · ${c.k}💀</span></div>`;
  }).join('');

  if (me) {
    $('hpFill').style.width = me.hp + '%';
    $('hpFill').style.background = me.hp > 50 ? 'linear-gradient(90deg,#22c55e,#84cc16)' : me.hp > 25 ? '#f59e0b' : '#ef4444';
    $('hpText').textContent = `${me.hp} HP`;
    $('lives').textContent = `🚗 × ${me.lives}`;
    $('weapon').textContent = `${POWER_ICON[me.w] || '🔫'} ${WEAPON_NAME[me.w]}${me.ammo ? ' ×' + me.ammo : ''}${me.sh ? ' 🛡️' : ''}${me.bo ? ' ⚡' : ''}`;
    $('speed').textContent = Math.round(Math.abs(me.sp) * 0.3);
    $('energyFill').style.width = (me.bo ? 100 : me.en) + '%';
    const cm = $('center-msg');
    if (!me.alive && me.lives > 0) cm.textContent = `Wrecked! Respawn in ${me.respawn}…`;
    else if (!me.alive) cm.textContent = 'You are out. Spectating…';
    else if (cm.textContent.startsWith('Wrecked') || cm.textContent.startsWith('You are out')) cm.textContent = '';
  }
}

const mini = $('minimap'), mctx = mini.getContext('2d');
function drawMinimap() {
  if (!arena || !state) return;
  const W = mini.width, H = mini.height;
  mctx.clearRect(0, 0, W, H);
  mctx.save();
  mctx.beginPath(); mctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); mctx.clip();
  // Multi-level maps show the level the player is on
  const lv = world.viewLevel;
  mctx.fillStyle = lv < 0 ? '#0e1117' : '#5d6b2a'; mctx.fillRect(0, 0, W, H);
  const s = Math.min(W * 0.86 / arena.w, H * 0.86 / arena.h), ox = (W - arena.w * s) / 2, oy = (H - arena.h * s) / 2;
  if (lv >= 0 || !arena.basement) { mctx.fillStyle = lv < 0 ? '#333' : '#c8703a'; mctx.fillRect(ox, oy, arena.w * s, arena.h * s); }
  else { const b = arena.basement; mctx.fillStyle = '#3a3d44'; mctx.fillRect(ox + (b.x - 60) * s, oy + (b.y - 60) * s, (b.w + 120) * s, (b.h + 120) * s); }
  const KIND = { building: '#aab4c4', library: '#8fa0b8', trees: '#3c7a3a', parked: '#b9b9b4', highway: '#2f3236', planter: '#4c8a3b', wall: '#9a9ca0', core: '#b3b5b8', pillar: '#d2d3d5' };
  for (const o of arena.obstacles) {
    if ((o.lv || 0) !== lv) continue;
    mctx.fillStyle = KIND[o.k] || '#6f6763';
    mctx.fillRect(ox + o.x * s, oy + o.y * s, Math.max(1, o.w * s), Math.max(1, o.h * s));
  }
  for (const pt of arena.portals || []) { // ramps: green = going up, orange = going down
    if (pt.lv !== lv) continue;
    mctx.fillStyle = pt.to > lv ? '#22c55e' : '#f59e0b';
    mctx.fillRect(ox + pt.x * s, oy + pt.y * s, Math.max(3, pt.w * s), Math.max(3, pt.h * s));
  }
  for (const p of state.powerups) {
    if ((p.lv || 0) !== lv) continue;
    mctx.fillStyle = POWER_COLOR[p.type];
    mctx.beginPath(); mctx.arc(ox + p.x * s, oy + p.y * s, 3, 0, Math.PI * 2); mctx.fill();
  }
  for (const c of state.cars) {
    if (!c.alive || (c.lv || 0) !== lv) continue;
    const p = players[c.id];
    mctx.save();
    mctx.translate(ox + c.x * s, oy + c.y * s);
    mctx.rotate(c.a);
    mctx.fillStyle = p?.color || '#fff';
    mctx.strokeStyle = c.id === myId ? '#fff' : 'rgba(0,0,0,.6)';
    mctx.lineWidth = c.id === myId ? 2 : 1;
    mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -5); mctx.lineTo(-3, 0); mctx.lineTo(-5, 5); mctx.closePath();
    mctx.fill(); mctx.stroke();
    mctx.restore();
  }
  mctx.restore();
}

// ---------- Main loop ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  world.update(inGame ? state : null, players, myId, dt, t / 1000);
  if (inGame) drawMinimap();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Input ----------
const input = { up: 0, down: 0, left: 0, right: 0, fire: 0, boost: 0, horn: 0, jx: 0, jy: 0 };
const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', Enter: 'fire', ShiftLeft: 'boost', ShiftRight: 'boost', KeyH: 'horn',
};
let lastSent = '';
function sendInput(force) {
  const s = JSON.stringify(input);
  if (force || s !== lastSent) { lastSent = s; send({ t: 'input', i: input }); }
}
setInterval(() => { if (inGame) sendInput(true); }, 150);
window.__drive = (jx, jy, extra = {}) => { Object.assign(input, { jx, jy }, extra); sendInput(true); }; // debugging: steer from the console

addEventListener('keydown', e => {
  if (!inGame || e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyC') { world.camMode = world.camMode === 'chase' ? 'top' : 'chase'; return; }
  if (e.code === 'KeyM') { muted = !muted; store.set('muted', muted ? '1' : '0'); return; }
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  input[k] = 1; sendInput();
});
addEventListener('keyup', e => {
  const k = KEYS[e.code];
  if (!k) return;
  input[k] = 0; sendInput();
});
addEventListener('blur', () => { Object.keys(input).forEach(k => input[k] = 0); sendInput(); });

// Drag to rotate camera, scroll to zoom
let drag = null;
$('three').addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = e.clientX; });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => {
  if (drag === null) return;
  world.camYaw += (e.clientX - drag) * 0.006;
  drag = e.clientX;
});
$('three').addEventListener('dblclick', () => world.camYaw = 0);
addEventListener('wheel', e => {
  if (!inGame) return;
  world.camDist = Math.max(6, Math.min(26, world.camDist + e.deltaY * 0.01));
}, { passive: true });

$('copyBtn').onclick = async () => {
  const input = $('shareLink');
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
  $('copyBtn').textContent = '✅ Copied!';
  setTimeout(() => $('copyBtn').textContent = '📋 Copy invite link', 1500);
};

$('ctrlToggle').onclick = () => {
  const hidden = $('ctrlRows').classList.toggle('hidden');
  $('ctrlToggle').textContent = hidden ? '+' : '–';
};

// Touch controls
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) { document.body.classList.add('touch'); $('touch').classList.remove('hidden'); }
const stick = $('stick'), knob = $('knob');
let stickId = null;
function stickMove(t) {
  const r = stick.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  const max = r.width / 2, m = Math.hypot(dx, dy);
  if (m > max) { dx *= max / m; dy *= max / m; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  // Stick is relative to the chase camera, so "up" means "where the camera looks"
  const me = state?.cars.find(c => c.id === myId);
  const yaw = world.camMode === 'chase' && me ? me.a + world.camYaw + Math.PI / 2 : 0;
  const sx = dx / max, sy = dy / max;
  input.jx = +(sx * Math.cos(yaw) - sy * Math.sin(yaw)).toFixed(2);
  input.jy = +(sx * Math.sin(yaw) + sy * Math.cos(yaw)).toFixed(2);
  sendInput();
}
stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; stickMove(t); }, { passive: false });
stick.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t); }, { passive: false });
const stickEnd = e => {
  for (const t of e.changedTouches) if (t.identifier === stickId) {
    stickId = null; knob.style.transform = ''; input.jx = input.jy = 0; sendInput();
  }
};
stick.addEventListener('touchend', stickEnd);
stick.addEventListener('touchcancel', stickEnd);
for (const [id, key] of [['fireBtn', 'fire'], ['boostBtn', 'boost']]) {
  const b = $(id);
  b.addEventListener('touchstart', e => { e.preventDefault(); input[key] = 1; sendInput(); }, { passive: false });
  b.addEventListener('touchend', e => { e.preventDefault(); input[key] = 0; sendInput(); }, { passive: false });
  b.addEventListener('touchcancel', () => { input[key] = 0; sendInput(); });
}

// ---------- Results ----------
const REASONS = {
  'time': 'Time ran out.', 'last-car-standing': 'Last car standing!', 'everyone-out': 'Everyone got wrecked.', 'host-ended': 'The host ended the match.',
};
function avatar(r, size) {
  return r.photo ? `<img src="${r.photo}" width="${size}" height="${size}" style="border-color:${r.color}">`
    : `<div class="noimg" style="width:${size}px;height:${size}px;border-color:${r.color}"></div>`;
}
function showResults(m) {
  Object.keys(input).forEach(k => input[k] = 0);
  show('results');
  $('resultReason').textContent = `${m.mapName ? m.mapName + ' · ' : ''}${REASONS[m.reason] || ''} Match lasted ${Math.round(m.durationMs / 1000)}s.`;
  const top = m.results.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = { 1: 110, 2: 80, 3: 56 }, medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  $('podium').innerHTML = order.map(r => `
    <div class="pod">
      ${avatar(r, r.place === 1 ? 90 : 68)}
      <div><b>${esc(r.name)}</b></div>
      <div class="bar" style="background:${r.color};height:${heights[r.place]}px">${medal[r.place]}</div>
    </div>`).join('');
  $('resultTable').innerHTML = `
    <tr><th>#</th><th style="text-align:left">Driver</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Taken</th><th>Accuracy</th><th>Power-ups</th><th>Lives left</th></tr>
    ${m.results.map(r => `
      <tr><td>${r.place}</td><td class="n"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}${r.left ? ' (left)' : ''} <small style="opacity:.6">${esc(cars.find(c => c.id === r.car)?.name || '')}</small></td>
      <td>${r.kills}</td><td>${r.deaths}</td><td>${r.damageDealt}</td><td>${r.damageTaken}</td><td>${r.accuracy}%</td><td>${r.powerups}</td><td>${r.livesLeft}</td></tr>`).join('')}`;
}

// ---------- History ----------
async function openHistory() {
  $('history').classList.remove('hidden');
  const [board, matches] = await Promise.all([fetch(api('/api/leaderboard')).then(r => r.json()), fetch(api('/api/matches')).then(r => r.json())]);
  $('leaderTable').innerHTML = board.length ? `
    <tr><th>#</th><th style="text-align:left">Driver</th><th>Wins</th><th>Matches</th><th>Kills</th><th>Deaths</th><th>Damage</th></tr>
    ${board.map((e, i) => `<tr><td>${i + 1}</td><td class="n">${esc(e.name)}</td><td>${e.wins}</td><td>${e.matches}</td><td>${e.kills}</td><td>${e.deaths}</td><td>${e.damageDealt}</td></tr>`).join('')}`
    : '<tr><td>No matches played yet.</td></tr>';
  $('matchList').innerHTML = matches.map(m => `
    <details class="match">
      <summary>${new Date(m.startedAt).toLocaleString()} · ${esc(m.map?.name || 'Classic')} · 🏆 <b>${esc(m.winner?.name || '—')}</b> · ${m.results.length} players</summary>
      <div class="table-wrap"><table>
        <tr><th>#</th><th style="text-align:left">Driver</th><th>Kills</th><th>Deaths</th><th>Damage</th><th>Power-ups</th></tr>
        ${m.results.map(r => `<tr><td>${r.place}</td><td class="n">${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.damageDealt}</td><td>${r.powerups}</td></tr>`).join('')}
      </table></div>
    </details>`).join('') || '<p class="hint">No matches yet.</p>';
}
$('historyBtn').onclick = $('historyBtn2').onclick = openHistory;
$('closeHistory').onclick = () => $('history').classList.add('hidden');
