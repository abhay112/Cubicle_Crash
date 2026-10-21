// Car Fight: local multiplayer server.
// Serves the client over HTTP (localhost) and HTTPS (LAN, needed for webcam access),
// runs an authoritative game loop per room and stores every match in data/matches.
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const HTTP_PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const DATA_DIR = path.join(__dirname, 'data');
const MATCH_DIR = path.join(DATA_DIR, 'matches');
fs.mkdirSync(MATCH_DIR, { recursive: true });

// ---------- Arena & tuning ----------
const CAR_R = 24;
const TICK = 1000 / 60;
const SEND_EVERY = 2; // broadcast every 2 ticks (30 Hz)

// ---------- Maps ----------
// Layouts are mirrored into all four quadrants; `center` pieces are placed once.
function mirrored(w, h, quarter, center = []) {
  const out = [];
  for (const o of quarter) {
    out.push(o, { ...o, x: w - o.x - o.w }, { ...o, y: h - o.y - o.h }, { ...o, x: w - o.x - o.w, y: h - o.y - o.h });
  }
  return [...out, ...center];
}
const MAPS = {
  autumn: {
    name: 'Autumn Valley', emoji: '🍂', w: 2400, h: 1600,
    obstacles: mirrored(2400, 1600, [
      { x: 320, y: 260, w: 220, h: 60 }, { x: 760, y: 180, w: 60, h: 260 }, { x: 1020, y: 420, w: 160, h: 60 },
      { x: 260, y: 620, w: 60, h: 180 }, { x: 620, y: 640, w: 160, h: 120 },
    ], [{ x: 1100, y: 700, w: 200, h: 200 }]),
  },
  desert: {
    name: 'Desert Canyon', emoji: '🌵', w: 2800, h: 1800,
    obstacles: mirrored(2800, 1800, [
      { x: 300, y: 300, w: 500, h: 80 }, { x: 300, y: 380, w: 80, h: 250 }, { x: 1000, y: 150, w: 80, h: 450 },
      { x: 600, y: 700, w: 250, h: 200 }, { x: 1150, y: 760, w: 80, h: 120 },
    ], [{ x: 1250, y: 820, w: 300, h: 160 }]),
  },
  snow: {
    name: 'Snow Peak', emoji: '❄️', w: 2600, h: 2000,
    obstacles: mirrored(2600, 2000, [
      { x: 250, y: 250, w: 140, h: 140 }, { x: 600, y: 200, w: 300, h: 60 }, { x: 1050, y: 300, w: 60, h: 300 },
      { x: 300, y: 650, w: 60, h: 300 }, { x: 650, y: 550, w: 200, h: 200 }, { x: 1000, y: 800, w: 150, h: 60 },
    ], [{ x: 1200, y: 900, w: 200, h: 200 }]),
  },
  city: {
    name: 'Neon City', emoji: '🌃', w: 3000, h: 2000,
    obstacles: mirrored(3000, 2000, [180, 640, 1100].flatMap(x => [180, 600].map(y => ({ x, y, w: 280, h: 240 })))),
  },
  jungle: {
    name: 'Jungle Maze', emoji: '🌴', w: 3200, h: 2200,
    obstacles: mirrored(3200, 2200, [
      { x: 250, y: 250, w: 600, h: 60 }, { x: 250, y: 310, w: 60, h: 350 }, { x: 1100, y: 200, w: 60, h: 500 },
      { x: 500, y: 600, w: 400, h: 60 }, { x: 850, y: 850, w: 60, h: 250 }, { x: 1250, y: 950, w: 300, h: 60 },
    ], [{ x: 1500, y: 1050, w: 200, h: 100 }]),
  },
};
// Make every map bigger: positions spread out by `f`, blocks get a bit larger, and extra blocks are scattered
// (mirrored into all four quadrants so no start corner is better than another).
function enlarge(map, f, seedStart) {
  let seed = seedStart;
  const rnd = (a, b) => a + ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 * (b - a);
  const W = Math.round(map.w * f), H = Math.round(map.h * f), sf = 1 + (f - 1) * 0.45;
  const scaled = map.obstacles.map(o => {
    const w = Math.round(o.w * sf), h = Math.round(o.h * sf);
    return { x: Math.round((o.x + o.w / 2) * f - w / 2), y: Math.round((o.y + o.h / 2) * f - h / 2), w, h };
  });
  const sizes = [[220, 60], [60, 220], [150, 150], [260, 56], [56, 260], [110, 110], [190, 80], [80, 190]];
  const placed = [];
  const clear = (r, others, gap) => !others.some(o => r.x < o.x + o.w + gap && o.x < r.x + r.w + gap && r.y < o.y + o.h + gap && o.y < r.y + r.h + gap);
  const target = Math.round(map.obstacles.length / 4 * (f * f - 1) * 0.8);
  for (let tries = 0; tries < 4000 && placed.length < target * 4 / 4; tries++) {
    const [w, h] = sizes[Math.floor(rnd(0, sizes.length))];
    const r = { x: Math.round(rnd(160, W / 2 - 160 - w)), y: Math.round(rnd(160, H / 2 - 160 - h)), w, h };
    // keep the middle lanes open and leave room to drive around every block
    if (!clear(r, scaled, 190) || !clear(r, placed, 190)) continue;
    placed.push(r);
  }
  const mirror = [];
  for (const r of placed) mirror.push(r, { ...r, x: W - r.x - r.w }, { ...r, y: H - r.y - r.h }, { ...r, x: W - r.x - r.w, y: H - r.y - r.h });
  return { ...map, w: W, h: H, obstacles: [...scaled, ...mirror] };
}
for (const [i, id] of Object.keys(MAPS).entries()) MAPS[id] = enlarge(MAPS[id], 1.7, 1000 + i * 77);
const MAP_IDS = Object.keys(MAPS);
const arenaFor = id => ({
  id, theme: id, name: MAPS[id].name, w: MAPS[id].w, h: MAPS[id].h, obstacles: MAPS[id].obstacles,
  portals: MAPS[id].portals || [], levels: MAPS[id].levels || [0], basement: MAPS[id].basement || null, rampOpenings: MAPS[id].rampOpenings || [],
});
// Obstacles only block cars, bullets and mines on their own level (0 = ground, -1/-2 = basements)
const obstaclesByLevel = arena => {
  const out = Object.fromEntries(arena.levels.map(l => [l, []]));
  for (const o of arena.obstacles) (out[o.lv ?? 0] ||= []).push(o);
  return out;
};

// Cars: stats are multipliers. speed = top speed and acceleration, turn = steering, armor = damage taken (lower is tougher).
const CARS = {
  swift:    { name: 'Swift',    brand: 'Maruti Suzuki', speed: 1.10, turn: 1.15, armor: 1.15, blurb: 'Fast and nimble, but fragile.' },
  punch:    { name: 'Punch',    brand: 'Tata',          speed: 1.00, turn: 1.10, armor: 1.00, blurb: 'Tiny SUV that turns on a coin.' },
  sonet:    { name: 'Sonet',    brand: 'Kia',           speed: 1.05, turn: 1.05, armor: 1.05, blurb: 'Quick all-rounder.' },
  nexon:    { name: 'Nexon',    brand: 'Tata',          speed: 1.00, turn: 1.00, armor: 0.92, blurb: 'Solid build, takes hits well.' },
  brezza:   { name: 'Brezza',   brand: 'Maruti Suzuki', speed: 1.00, turn: 1.00, armor: 1.00, blurb: 'Balanced in every way.' },
  creta:    { name: 'Creta',    brand: 'Hyundai',       speed: 1.06, turn: 0.95, armor: 0.95, blurb: 'Strong and fast on straights.' },
  ertiga:   { name: 'Ertiga',   brand: 'Maruti Suzuki', speed: 0.90, turn: 0.90, armor: 0.85, blurb: 'Big family tank, slow to steer.' },
  thar:     { name: 'Thar',     brand: 'Mahindra',      speed: 0.95, turn: 1.00, armor: 0.85, blurb: 'Off-road brawler.' },
  scorpio:  { name: 'Scorpio-N', brand: 'Mahindra',     speed: 0.95, turn: 0.90, armor: 0.80, blurb: 'Heavy hitter with thick armor.' },
  fortuner: { name: 'Fortuner', brand: 'Toyota',        speed: 0.90, turn: 0.85, armor: 0.72, blurb: 'The tank. Slow, hard to kill.' },
};
const DEFAULT_CAR = 'brezza';
// A car is only offered when its real 3D model exists in public/models/<id>.glb (no placeholder cars)
const availableCars = () => {
  try { return fs.readdirSync(path.join(__dirname, 'public/models')).filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4)).filter(id => CARS[id]); }
  catch { return []; }
};
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#e11d48', '#6366f1'];
const POWERUPS = ['rocket', 'triple', 'mine', 'shield', 'boost', 'health', 'jump', 'turbo', 'foot'];
const WEAPONS = {
  gun: { cooldown: 260, speed: 720, dmg: 7, r: 4 },
  rocket: { cooldown: 650, speed: 540, dmg: 30, r: 7, splash: 80, splashDmg: 18, ammo: 4 },
  triple: { cooldown: 300, speed: 720, dmg: 7, r: 4, ammo: 10 },
  mine: { cooldown: 500, dmg: 40, ammo: 3 },
  launcher: { cooldown: 900, speed: 620, dmg: 55, r: 8, splash: 130, splashDmg: 38 }, // on-foot rocket launcher
};

// ---------- Helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();
const genId = () => crypto.randomBytes(6).toString('hex');

function circleRect(cx, cy, r, o) {
  const nx = clamp(cx, o.x, o.x + o.w), ny = clamp(cy, o.y, o.y + o.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r ? { nx, ny, dx, dy } : null;
}

function freeSpot(room, r = CAR_R + 10, lv = 0) {
  const { w: W, h: H } = room.arena;
  const OBSTACLES = room.obs[lv] || [];
  const b = lv < 0 ? room.arena.basement : null; // basements only exist under part of the map
  for (let i = 0; i < 300; i++) {
    const x = b ? rand(b.x + 60, b.x + b.w - 60) : rand(60, W - 60), y = b ? rand(b.y + 60, b.y + b.h - 60) : rand(60, H - 60);
    if (OBSTACLES.some(o => circleRect(x, y, r + 10, o))) continue;
    if (room.arena.portals.some(pt => pt.lv === lv && circleRect(x, y, r + 20, pt))) continue; // never spawn on a ramp
    let ok = true;
    for (const p of room.players.values()) {
      if (p.alive && p.lv === lv && Math.hypot(p.x - x, p.y - y) < 160) { ok = false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: W / 2, y: 120 };
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

// ---------- Rooms ----------
const rooms = new Map();

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: makeCode(),
    hostId: null,
    players: new Map(),
    state: 'lobby',
    settings: { lives: 3, duration: 180, map: 'random' },
    arena: arenaFor('autumn'),
    bullets: [], powerups: [], mines: [], fx: [], feed: [],
    match: null, lastResults: null, tick: 0,
  };
  rooms.set(room.code, room);
  return room;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg) {
  const s = JSON.stringify(msg);
  if (msg.t === 'state') perf._bytes += s.length * room.players.size;
  for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
}

// Photos are big (tens of KB), so each client receives a player's photo only once; later roster updates leave it out.
function roster(room, to) {
  return {
    t: 'roster',
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: room.settings,
    players: [...room.players.values()].map(p => {
      const first = to && !to.sentPhotos.has(p.id);
      if (first) to.sentPhotos.add(p.id);
      return { id: p.id, name: p.name, color: p.color, car: p.car, ...(first || !to ? { photo: p.photo } : {}) };
    }),
  };
}
function broadcastRoster(room) {
  for (const p of room.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(roster(room, p)));
}

function newStats() {
  return { kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0, shots: 0, hits: 0, powerups: 0 };
}

function pickCar(car) {
  const ok = availableCars();
  return ok.includes(car) ? car : ok.includes(DEFAULT_CAR) ? DEFAULT_CAR : ok[0] || DEFAULT_CAR;
}

function addPlayer(room, ws, name, photo, car) {
  const used = new Set([...room.players.values()].map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[room.players.size % COLORS.length];
  const p = {
    id: genId(), ws, name, photo, color, car: pickCar(car), sentPhotos: new Set(),
    input: { up: 0, down: 0, left: 0, right: 0, fire: 0, boost: 0, horn: 0, jump: 0, jx: 0, jy: 0 }, energy: 100, jumps: 0, jumpUntil: 0, turboUntil: 0, footUntil: 0, hornReady: 0,
    x: 0, y: 0, angle: 0, speed: 0, vx: 0, vy: 0,
    hp: 100, lives: 0, alive: false, spectator: false, lv: 0, portalCd: 0,
    respawnAt: 0, weapon: 'gun', ammo: 0, fireReady: 0, shieldUntil: 0, boostUntil: 0,
    lastHitBy: null, lastHitAt: 0, ramCd: {}, eliminatedAt: null, stats: newStats(),
  };
  room.players.set(p.id, p);
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function logEvent(room, ev) {
  if (!room.match) return;
  room.match.events.push({ t: now() - room.match.startedAt, ...ev });
}

// ---------- Match lifecycle ----------
function startMatch(room) {
  room.state = 'playing';
  const mapId = MAPS[room.settings.map] ? room.settings.map : MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)];
  room.arena = arenaFor(mapId);
  room.areaFactor = (room.arena.w * room.arena.h) / (1600 * 1000);
  room.obs = obstaclesByLevel(room.arena);
  room.bullets = []; room.powerups = []; room.mines = []; room.fx = []; room.feed = [];
  const startedAt = now();
  room.match = {
    id: `${new Date(startedAt).toISOString().replace(/[:.]/g, '-')}_${room.code}`,
    room: room.code,
    startedAt,
    endsAt: startedAt + room.settings.duration * 1000,
    settings: { ...room.settings },
    map: { id: mapId, name: room.arena.name },
    players: [],
    events: [],
  };
  room.nextPowerupAt = startedAt + rand(2000, 4000);
  for (const p of room.players.values()) {
    p.spectator = false;
    p.lives = room.settings.lives;
    p.stats = newStats();
    p.eliminatedAt = null;
    p.weapon = 'gun'; p.ammo = 0;
    spawnCar(room, p);
    room.match.players.push({ id: p.id, name: p.name, color: p.color, photo: p.photo, car: p.car });
  }
  room.startingCount = room.players.size;
  logEvent(room, { type: 'start', players: room.players.size });
  broadcastRoster(room);
  broadcast(room, { t: 'started', arena: room.arena });
}

function spawnCar(room, p) {
  const s = freeSpot(room);
  const { w: W, h: H } = room.arena;
  Object.assign(p, {
    x: s.x, y: s.y, lv: 0, portalCd: 0, angle: Math.atan2(H / 2 - s.y, W / 2 - s.x), speed: 0, vx: 0, vy: 0,
    hp: 100, alive: true, shieldUntil: now() + 2000, boostUntil: 0, jumps: 0, jumpUntil: 0, turboUntil: 0, footUntil: 0, lastHitBy: null, energy: 100,
  });
}

function rankPlayers(room) {
  return [...room.players.values()]
    .filter(p => !p.spectator)
    .sort((a, b) =>
      (b.lives - a.lives) ||
      ((b.eliminatedAt ?? Infinity) - (a.eliminatedAt ?? Infinity)) ||
      (b.stats.kills - a.stats.kills) ||
      (b.stats.damageDealt - a.stats.damageDealt));
}

function endMatch(room, reason) {
  if (room.state !== 'playing') return;
  room.state = 'ended';
  const endedAt = now();
  const results = rankPlayers(room).map((p, i) => ({
    place: i + 1, id: p.id, name: p.name, color: p.color, photo: p.photo, car: p.car,
    livesLeft: p.lives, ...p.stats,
    damageDealt: Math.round(p.stats.damageDealt), damageTaken: Math.round(p.stats.damageTaken),
    accuracy: p.stats.shots ? Math.round((p.stats.hits / p.stats.shots) * 100) : 0,
  }));
  // Players who left mid-match are no longer in the room; keep them in results from the match log.
  for (const left of room.match.left || []) results.push({ ...left, place: results.length + 1 });
  logEvent(room, { type: 'end', reason });
  const record = {
    ...room.match, endedAt, durationMs: endedAt - room.match.startedAt, reason,
    winner: results[0] ? { id: results[0].id, name: results[0].name } : null,
    results,
  };
  delete record.endsAt; delete record.left;
  fs.writeFile(path.join(MATCH_DIR, `${record.id}.json`), JSON.stringify(record, null, 2), err => {
    if (err) console.error('Failed to save match', err);
    else console.log(`Saved match ${record.id} (winner: ${record.winner?.name ?? 'none'})`);
  });
  room.lastResults = { matchId: record.id, reason, durationMs: record.durationMs, mapName: room.arena.name, results };
  broadcast(room, { t: 'ended', ...room.lastResults });
  broadcastRoster(room);
}

function backToLobby(room) {
  room.state = 'lobby';
  room.match = null;
  for (const p of room.players.values()) { p.alive = false; p.spectator = false; }
  broadcastRoster(room);
}

// ---------- Combat ----------
function damage(room, target, amount, attackerId, cause) {
  if (!target.alive || amount <= 0) return;
  if (target.jumpUntil > now()) return; // airborne: nothing can touch you
  if (target.shieldUntil > now()) { room.fx.push({ k: 'shieldhit', x: target.x, y: target.y, lv: target.lv }); return; }
  amount *= CARS[target.car].armor * (target.footUntil > now() ? 1.4 : 1); // soldiers are fragile
  amount = Math.min(amount, target.hp);
  target.hp -= amount;
  target.stats.damageTaken += amount;
  room.fx.push({ k: 'hit', x: target.x, y: target.y, lv: target.lv, id: target.id, dmg: Math.max(1, Math.round(amount)) });
  const attacker = attackerId && room.players.get(attackerId);
  if (attacker && attacker !== target) {
    attacker.stats.damageDealt += amount;
    target.lastHitBy = attackerId; target.lastHitAt = now();
  }
  if (target.hp <= 0) killCar(room, target, attacker && attacker !== target ? attacker : null, cause);
}

function killCar(room, p, killer, cause) {
  p.alive = false;
  p.lives -= 1;
  p.stats.deaths += 1;
  if (!killer && p.lastHitBy && now() - p.lastHitAt < 5000) killer = room.players.get(p.lastHitBy) || null;
  if (killer) killer.stats.kills += 1;
  room.fx.push({ k: 'boom', x: p.x, y: p.y, lv: p.lv, big: 1 });
  const text = killer ? `${killer.name} wrecked ${p.name} (${cause})` : `${p.name} crashed out`;
  room.feed.push({ text, at: now() });
  logEvent(room, { type: 'kill', victim: p.id, victimName: p.name, killer: killer?.id ?? null, killerName: killer?.name ?? null, cause });
  if (p.lives > 0) {
    p.respawnAt = now() + 3000;
  } else {
    p.eliminatedAt = now();
    room.feed.push({ text: `${p.name} is out!`, at: now() });
    logEvent(room, { type: 'eliminated', player: p.id, name: p.name });
  }
}

function fire(room, p) {
  const t = now();
  if (t < p.fireReady) return;
  const onFoot = p.footUntil > t;
  const w = onFoot ? WEAPONS.launcher : WEAPONS[p.weapon];
  p.fireReady = t + w.cooldown;
  const nose = onFoot ? 14 : CAR_R + 6;
  const bx = p.x + Math.cos(p.angle) * nose, by = p.y + Math.sin(p.angle) * nose;
  const shoot = (ang, kind, wd) => {
    room.bullets.push({
      x: bx, y: by, vx: Math.cos(ang) * wd.speed + p.vx * 0.3, vy: Math.sin(ang) * wd.speed + p.vy * 0.3,
      owner: p.id, kind, dmg: wd.dmg, r: wd.r, life: 1.6, lv: p.lv, splash: wd.splash, splashDmg: wd.splashDmg,
    });
    p.stats.shots += 1;
  };
  if (onFoot) { shoot(p.angle, 'rocket', w); return; }
  if (p.weapon === 'gun') shoot(p.angle, 'gun', w);
  else if (p.weapon === 'triple') [-0.22, 0, 0.22].forEach(d => shoot(p.angle + d, 'gun', w));
  else if (p.weapon === 'rocket') shoot(p.angle, 'rocket', w);
  else if (p.weapon === 'mine') {
    room.mines.push({
      id: genId(), x: p.x - Math.cos(p.angle) * (CAR_R + 14), y: p.y - Math.sin(p.angle) * (CAR_R + 14),
      owner: p.id, armAt: t + 600, expires: t + 30000, lv: p.lv,
    });
  }
  if (p.weapon !== 'gun') {
    p.ammo -= 1;
    if (p.ammo <= 0) { p.weapon = 'gun'; p.ammo = 0; }
  }
}

function explode(room, x, y, owner, radius, dmg, lv = 0) {
  room.fx.push({ k: 'boom', x, y, lv });
  for (const q of room.players.values()) {
    if (!q.alive || q.lv !== lv) continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < radius + CAR_R) damage(room, q, dmg * (1 - d / (radius + CAR_R) * 0.5), owner, 'explosion');
  }
}

function pickup(room, p, pu) {
  p.stats.powerups += 1;
  const t = now();
  if (pu.type === 'health') p.hp = Math.min(100, p.hp + 40);
  else if (pu.type === 'shield') p.shieldUntil = t + 6000;
  else if (pu.type === 'boost') p.boostUntil = t + 5000;
  else if (pu.type === 'foot') { p.footUntil = t + 12000; p.speed = 0; p.shieldUntil = Math.max(p.shieldUntil, t + 1000); }
  else if (pu.type === 'jump') p.jumps = Math.min(3, p.jumps + 2);
  else if (pu.type === 'turbo') { p.turboUntil = t + 7000; p.boostUntil = Math.max(p.boostUntil, t + 7000); }
  else { p.weapon = pu.type; p.ammo = WEAPONS[pu.type].ammo; }
  room.fx.push({ k: 'pickup', x: pu.x, y: pu.y, lv: pu.lv, type: pu.type });
  logEvent(room, { type: 'pickup', player: p.id, name: p.name, powerup: pu.type });
}

// ---------- Simulation ----------
function step(room, dt) {
  const t = now();
  const { w: W, h: H } = room.arena;

  // Random power-ups at random times and places
  if (t >= room.nextPowerupAt) {
    // Bigger maps get power-ups more often and can hold more of them
    room.nextPowerupAt = t + rand(2500, 7000) / Math.sqrt(room.areaFactor);
    if (room.powerups.length < Math.round(Math.max(4, room.players.size + 2) * Math.sqrt(room.areaFactor))) {
      // On multi-level maps a good share of power-ups appear in the basements
      const levels = room.arena.levels;
      const lv = levels.length > 1 ? (Math.random() < 0.45 ? 0 : levels[1 + Math.floor(Math.random() * (levels.length - 1))]) : 0;
      const s = freeSpot(room, 20, lv);
      const type = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
      room.powerups.push({ id: genId(), x: s.x, y: s.y, lv, type, born: t });
      logEvent(room, { type: 'powerup_spawn', powerup: type, x: Math.round(s.x), y: Math.round(s.y), level: lv });
    }
  }

  const cars = [...room.players.values()].filter(p => !p.spectator);
  for (const p of cars) {
    if (!p.alive) {
      if (p.lives > 0 && p.respawnAt && t >= p.respawnAt) {
        p.respawnAt = 0;
        spawnCar(room, p);
        logEvent(room, { type: 'respawn', player: p.id });
      }
      continue;
    }
    const inp = p.input;
    // Shift boost uses a recharging energy bar; the boost power-up gives free boost
    const nitro = inp.boost && p.energy > 0 && p.boostUntil <= t;
    p.energy = clamp(p.energy + (nitro ? -40 : 14) * dt, 0, 100);
    const boosted = p.boostUntil > t || nitro;
    const turbo = p.turboUntil > t;
    const onFoot = p.footUntil > t;
    if (inp.jump && p.jumps > 0 && p.jumpUntil <= t) { p.jumps--; p.jumpUntil = t + 800; room.fx.push({ k: 'jump', x: p.x, y: p.y, lv: p.lv }); }
    if (inp.horn && t >= p.hornReady) { p.hornReady = t + 600; room.fx.push({ k: 'horn', x: p.x, y: p.y, lv: p.lv, id: p.id }); }
    const cs = CARS[p.car];
    const maxSpeed = onFoot ? 210 : (turbo ? 700 : boosted ? 480 : 300) * cs.speed;
    let throttle = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    let steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    // Touch joystick: steer toward the stick direction, throttle by how far it is pushed
    const jm = Math.hypot(inp.jx, inp.jy);
    if (jm > 0.15) {
      const target = Math.atan2(inp.jy, inp.jx);
      let diff = Math.atan2(Math.sin(target - p.angle), Math.cos(target - p.angle));
      steer = clamp(diff * 3, -1, 1);
      throttle = Math.min(1, jm) * (Math.abs(diff) > 2.4 ? 0.3 : 1);
    }
    p.speed += throttle * (onFoot ? 1600 : turbo ? 1500 : boosted ? 900 : 600) * cs.speed * dt;
    if (!throttle) p.speed *= Math.pow(onFoot ? 0.0005 : 0.12, dt);
    p.speed = clamp(p.speed, -maxSpeed * 0.5, maxSpeed);
    const turnFactor = onFoot ? 1 : clamp(Math.abs(p.speed) / 120, 0.35, 1) * Math.sign(p.speed || 1);
    p.angle += steer * (onFoot ? 4.6 : 3.2 * cs.turn) * turnFactor * dt;
    p.vx = Math.cos(p.angle) * p.speed;
    p.vy = Math.sin(p.angle) * p.speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Walls
    if (p.x < CAR_R) { p.x = CAR_R; p.speed *= -0.4; }
    if (p.x > W - CAR_R) { p.x = W - CAR_R; p.speed *= -0.4; }
    if (p.y < CAR_R) { p.y = CAR_R; p.speed *= -0.4; }
    if (p.y > H - CAR_R) { p.y = H - CAR_R; p.speed *= -0.4; }
    for (const o of room.obs[p.lv] || []) {
      const c = circleRect(p.x, p.y, CAR_R, o);
      if (c) {
        const d = Math.hypot(c.dx, c.dy) || 1;
        p.x = c.nx + (c.dx / d) * CAR_R;
        p.y = c.ny + (c.dy / d) * CAR_R;
        p.speed *= -0.4;
      }
    }

    // Ramps: touching a portal moves the car to another level
    if (t >= p.portalCd) {
      for (const pt of room.arena.portals) {
        if (pt.lv !== p.lv || !circleRect(p.x, p.y, CAR_R * 0.6, pt)) continue;
        room.fx.push({ k: 'ramp', x: p.x, y: p.y, lv: p.lv, id: p.id });
        p.lv = pt.to; p.x = pt.tx; p.y = pt.ty; p.portalCd = t + 1200;
        logEvent(room, { type: 'ramp', player: p.id, name: p.name, level: p.lv });
        break;
      }
    }

    if (inp.fire) fire(room, p);

    // Power-up pickup
    for (let i = room.powerups.length - 1; i >= 0; i--) {
      const pu = room.powerups[i];
      if (pu.lv === p.lv && Math.hypot(pu.x - p.x, pu.y - p.y) < CAR_R + 18) { room.powerups.splice(i, 1); pickup(room, p, pu); }
    }
    // Mines
    for (let i = room.mines.length - 1; i >= 0; i--) {
      const m = room.mines[i];
      if (t < m.armAt || m.lv !== p.lv || p.jumpUntil > t) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) < CAR_R + 12) {
        room.mines.splice(i, 1);
        room.fx.push({ k: 'boom', x: m.x, y: m.y, lv: m.lv });
        damage(room, p, WEAPONS.mine.dmg, m.owner, 'mine');
      }
    }
  }
  room.mines = room.mines.filter(m => m.expires > t);

  // Car vs car collisions with ram damage
  const alive = cars.filter(p => p.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      if (a.lv !== b.lv) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= CAR_R * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, overlap = CAR_R * 2 - d;
      a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
      b.x += nx * overlap / 2; b.y += ny * overlap / 2;
      if (a.footUntil > t || b.footUntil > t) continue; // soldiers just get shoved, no ram damage
      const key = a.id < b.id ? a.id + b.id : b.id + a.id;
      if ((room.ramCd?.[key] || 0) > t) continue;
      const aInto = a.vx * nx + a.vy * ny; // a's speed toward b
      const bInto = -(b.vx * nx + b.vy * ny);
      if (aInto + bInto < 120) continue;
      room.ramCd = room.ramCd || {};
      room.ramCd[key] = t + 500;
      const aMul = a.boostUntil > t ? 2 : 1.3 * (a.input.boost && a.energy > 0) || 1;
      const bMul = b.boostUntil > t ? 2 : 1.3 * (b.input.boost && b.energy > 0) || 1;
      damage(room, b, Math.max(0, aInto) * 0.06 * aMul, a.id, 'ram');
      damage(room, a, Math.max(0, bInto) * 0.06 * bMul, b.id, 'ram');
      a.speed *= -0.5; b.speed *= -0.5;
      room.fx.push({ k: 'spark', x: a.x + nx * CAR_R, y: a.y + ny * CAR_R, lv: a.lv });
    }
  }

  // Bullets
  for (let i = room.bullets.length - 1; i >= 0; i--) {
    const b = room.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let hit = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > W || b.y > H || (room.obs[b.lv] || []).some(o => circleRect(b.x, b.y, b.r, o));
    let victim = null;
    if (!hit) {
      for (const q of alive) {
        if (q.id === b.owner || !q.alive || q.lv !== b.lv) continue;
        if (Math.hypot(q.x - b.x, q.y - b.y) < CAR_R + b.r) { hit = true; victim = q; break; }
      }
    }
    if (!hit) continue;
    room.bullets.splice(i, 1);
    const owner = room.players.get(b.owner);
    if (victim && owner) owner.stats.hits += 1;
    if (b.kind === 'rocket') {
      if (victim) damage(room, victim, b.dmg, b.owner, 'rocket');
      if (b.life > 0) explode(room, b.x, b.y, b.owner, b.splash || WEAPONS.rocket.splash, b.splashDmg || WEAPONS.rocket.splashDmg, b.lv);
    } else if (victim) {
      damage(room, victim, b.dmg, b.owner, 'gun');
      room.fx.push({ k: 'spark', x: b.x, y: b.y, lv: b.lv });
    }
  }

  // End conditions
  const inPlay = cars.filter(p => p.lives > 0);
  if (t >= room.match.endsAt) endMatch(room, 'time');
  else if (room.startingCount >= 2 && inPlay.length <= 1) endMatch(room, 'last-car-standing');
  else if (inPlay.length === 0) endMatch(room, 'everyone-out');
}

function snapshot(room) {
  const t = now();
  const msg = {
    t: 'state',
    timeLeft: Math.max(0, Math.round((room.match.endsAt - t) / 1000)),
    cars: [...room.players.values()].filter(p => !p.spectator).map(p => ({
      id: p.id, x: Math.round(p.x), y: Math.round(p.y), lv: p.lv, a: +p.angle.toFixed(3), hp: Math.round(p.hp),
      lives: p.lives, alive: p.alive, sh: p.shieldUntil > t ? 1 : 0, bo: p.boostUntil > t ? 1 : 0, tb: p.turboUntil > t ? 1 : 0, ft: p.footUntil > t ? Math.ceil((p.footUntil - t) / 1000) : 0, jp: p.jumpUntil > t ? +(1 - (p.jumpUntil - t) / 800).toFixed(2) : -1, jc: p.jumps,
      w: p.weapon, ammo: p.ammo, k: p.stats.kills, sp: Math.round(p.speed), en: Math.round(p.energy),
      nb: p.alive && p.input.boost && p.energy > 0 ? 1 : 0,
      respawn: !p.alive && p.lives > 0 ? Math.max(0, Math.ceil((p.respawnAt - t) / 1000)) : 0,
    })),
    bullets: room.bullets.map(b => [Math.round(b.x), Math.round(b.y), b.kind === 'rocket' ? 1 : 0, +Math.atan2(b.vy, b.vx).toFixed(2), b.lv]),
    powerups: room.powerups.map(p => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), lv: p.lv, type: p.type })),
    mines: room.mines.map(m => ({ x: Math.round(m.x), y: Math.round(m.y), lv: m.lv, armed: t >= m.armAt, owner: m.owner })),
    fx: room.fx,
    feed: room.feed,
  };
  room.fx = [];
  room.feed = [];
  return msg;
}

// Server cost per game tick, so we can tell whether the server is ever the bottleneck (see /api/stats)
const perf = { avgMs: 0, maxMs: 0, ticks: 0, players: 0, bytesPerSec: 0, _bytes: 0, _since: Date.now() };
setInterval(() => {
  const t0 = process.hrtime.bigint();
  for (const room of rooms.values()) {
    if (room.state !== 'playing') continue;
    step(room, TICK / 1000);
    if (room.state !== 'playing') continue;
    room.tick++;
    if (room.tick % SEND_EVERY === 0) broadcast(room, snapshot(room));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  perf.avgMs += (ms - perf.avgMs) * 0.02;
  perf.maxMs = Math.max(perf.maxMs * 0.999, ms);
  perf.ticks++;
}, TICK);

// ---------- WebSocket protocol ----------
function handleConnection(ws, req) {
  req.socket.setNoDelay(true); // send small updates immediately instead of batching them (lower latency)
  let room = null, player = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'create' || msg.t === 'join') {
      if (player) return;
      const name = String(msg.name || 'Driver').trim().slice(0, 16) || 'Driver';
      const photo = typeof msg.photo === 'string' && msg.photo.startsWith('data:image/') && msg.photo.length < 200000 ? msg.photo : null;
      if (msg.t === 'create') room = createRoom();
      else {
        room = rooms.get(String(msg.code || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'error', message: 'Room not found. Check the code.' });
      }
      player = addPlayer(room, ws, name, photo, msg.car);
      send(ws, { t: 'joined', id: player.id, code: room.code, arena: room.arena });
      broadcastRoster(room);
      if (room.state === 'ended' && room.lastResults) send(ws, { t: 'ended', ...room.lastResults });
      if (room.state === 'playing') {
        // Drop-in: late joiners get a car straight away with full lives
        player.lives = room.settings.lives;
        spawnCar(room, player);
        room.match.players.push({ id: player.id, name: player.name, color: player.color, photo: player.photo, car: player.car });
        room.startingCount += 1;
        room.feed.push({ text: `${player.name} joined the fight!`, at: now() });
        logEvent(room, { type: 'join', player: player.id, name: player.name });
        send(ws, { t: 'started', arena: room.arena });
      }
      return;
    }
    if (!player) return;

    if (msg.t === 'input') {
      const i = msg.i || {};
      player.input = {
        up: i.up ? 1 : 0, down: i.down ? 1 : 0, left: i.left ? 1 : 0, right: i.right ? 1 : 0, fire: i.fire ? 1 : 0,
        boost: i.boost ? 1 : 0, horn: i.horn ? 1 : 0, jump: i.jump ? 1 : 0,
        jx: clamp(Number(i.jx) || 0, -1, 1), jy: clamp(Number(i.jy) || 0, -1, 1),
      };
    } else if (msg.t === 'car' && room.state !== 'playing' && availableCars().includes(msg.car)) {
      player.car = msg.car;
      broadcastRoster(room);
    } else if (msg.t === 'settings' && player.id === room.hostId && room.state !== 'playing') {
      room.settings.lives = clamp(Math.round(Number(msg.lives) || 3), 1, 9);
      room.settings.duration = clamp(Math.round(Number(msg.duration) || 180), 30, 900);
      if (MAPS[msg.map] || msg.map === 'random') room.settings.map = msg.map;
      broadcastRoster(room);
    } else if (msg.t === 'start' && player.id === room.hostId && room.state !== 'playing') {
      startMatch(room);
    } else if (msg.t === 'lobby' && player.id === room.hostId && room.state === 'ended') {
      backToLobby(room);
    } else if (msg.t === 'restart' && (room.state === 'ended' || (room.state === 'playing' && player.id === room.hostId))) {
      // Rematch in the same room: anyone can call it from the results screen, the host can also restart mid-match
      startMatch(room);
    } else if (msg.t === 'end' && player.id === room.hostId && room.state === 'playing') {
      endMatch(room, 'host-ended');
    }
  });

  ws.on('close', () => {
    if (!room || !player) return;
    room.players.delete(player.id);
    if (room.state === 'playing' && room.match && !player.spectator) {
      logEvent(room, { type: 'leave', player: player.id, name: player.name });
      (room.match.left = room.match.left || []).push({
        id: player.id, name: player.name, color: player.color, photo: player.photo, car: player.car, livesLeft: 0, left: true,
        ...player.stats, damageDealt: Math.round(player.stats.damageDealt), damageTaken: Math.round(player.stats.damageTaken),
        accuracy: player.stats.shots ? Math.round((player.stats.hits / player.stats.shots) * 100) : 0,
      });
      room.feed.push({ text: `${player.name} left the match`, at: now() });
    }
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
    broadcastRoster(room);
  });
}

// ---------- HTTP ----------
const app = express();
// The page can be hosted elsewhere (e.g. Vercel); ALLOWED_ORIGIN limits who may call the API (default: anyone)
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  next();
});
// Always revalidate (ETag) so players never run an old cached copy of the game after an update
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/vendor/three-addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
// Real car models: drop public/models/<car id>.glb (e.g. brezza.glb) and it replaces the low-poly shape
app.get('/api/stats', (req, res) => {
  const secs = (Date.now() - perf._since) / 1000;
  const players = [...rooms.values()].reduce((n, r) => n + r.players.size, 0);
  res.json({ tickBudgetMs: +TICK.toFixed(2), avgTickMs: +perf.avgMs.toFixed(3), maxTickMs: +perf.maxMs.toFixed(3), rooms: rooms.size, players,
    kbPerSecOut: Math.round(perf._bytes / 1024 / secs), rssMb: Math.round(process.memoryUsage().rss / 1048576) });
  perf._bytes = 0; perf._since = Date.now();
});

const gameInfo = () => ({ ips: lanIPs(), httpPort: HTTP_PORT, httpsPort: HTTPS_PORT, arena: arenaFor('autumn'),
  cars: availableCars().map(id => ({ id, ...CARS[id] })),
  maps: [{ id: 'random', name: 'Random', emoji: '🎲' }, ...MAP_IDS.map(id => ({ id, name: MAPS[id].name, emoji: MAPS[id].emoji, w: MAPS[id].w, h: MAPS[id].h, arena: arenaFor(id) }))] });
app.get('/api/info', (req, res) => res.json(gameInfo()));
// scripts/build-static.js bakes this into the static site so the menus work even if the game server is asleep
if (require.main !== module) module.exports = { gameInfo };

function readMatches() {
  return fs.readdirSync(MATCH_DIR).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(MATCH_DIR, f), 'utf8')); } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
}

app.get('/api/matches', (req, res) => {
  res.json(readMatches().map(m => ({
    id: m.id, room: m.room, startedAt: m.startedAt, durationMs: m.durationMs, reason: m.reason,
    map: m.map, winner: m.winner, results: m.results.map(({ photo, ...r }) => r),
  })));
});

app.get('/api/matches/:id', (req, res) => {
  const file = path.join(MATCH_DIR, path.basename(req.params.id) + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  res.sendFile(file);
});

// All-time leaderboard, grouped by player name
app.get('/api/leaderboard', (req, res) => {
  const board = {};
  for (const m of readMatches()) {
    for (const r of m.results) {
      const key = r.name.toLowerCase();
      const e = board[key] ||= { name: r.name, matches: 0, wins: 0, kills: 0, deaths: 0, damageDealt: 0, powerups: 0 };
      e.matches++; e.kills += r.kills; e.deaths += r.deaths; e.damageDealt += r.damageDealt; e.powerups += r.powerups;
      if (r.place === 1 && m.results.length > 1) e.wins++;
    }
  }
  res.json(Object.values(board).sort((a, b) => b.wins - a.wins || b.kills - a.kills || b.damageDealt - a.damageDealt));
});

if (require.main === module) {
  const httpServer = http.createServer(app);
  new WebSocketServer({ server: httpServer, perMessageDeflate: false }).on('connection', handleConnection);
  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`\n  Car Fight is running!`);
    console.log(`  This computer:   http://localhost:${HTTP_PORT}`);
  });

  // Self-signed HTTPS so phones/laptops on the LAN can use their camera (browsers require a secure origin).
  if (process.env.LAN_HTTPS === '0') {
    // Hosted behind a platform that terminates TLS (Render, Fly, ...): no self-signed HTTPS needed
  } else try {
    const certDir = path.join(DATA_DIR, 'cert');
    const keyFile = path.join(certDir, 'key.pem'), certFile = path.join(certDir, 'cert.pem');
    if (!fs.existsSync(keyFile)) {
      const selfsigned = require('selfsigned');
      const altNames = [{ type: 2, value: 'localhost' }, ...['127.0.0.1', ...lanIPs()].map(ip => ({ type: 7, ip }))];
      const pems = selfsigned.generate([{ name: 'commonName', value: 'car-fight.local' }], {
        days: 825, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }],
      });
      fs.mkdirSync(certDir, { recursive: true });
      fs.writeFileSync(keyFile, pems.private);
      fs.writeFileSync(certFile, pems.cert);
    }
    const httpsServer = https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, app);
    new WebSocketServer({ server: httpsServer, perMessageDeflate: false }).on('connection', handleConnection);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      for (const ip of lanIPs()) console.log(`  Other devices:   https://${ip}:${HTTPS_PORT}  (accept the certificate warning)`);
      console.log(`  Match data is saved in ${MATCH_DIR}\n`);
    });
  } catch (err) {
    console.warn('HTTPS disabled:', err.message);
  }
}
