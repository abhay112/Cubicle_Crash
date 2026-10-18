// Builds the static site for Vercel (or any static host) into dist/.
// The game server (server.js) needs a long-running WebSocket host, so it is deployed separately;
// GAME_SERVER_URL tells the page where it lives, e.g. https://cubicle-crash.onrender.com
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const three = path.join(root, 'node_modules/three');

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
// Same paths the Node server uses for the import map in index.html
fs.cpSync(path.join(three, 'build'), path.join(dist, 'vendor/three'), { recursive: true });
fs.cpSync(path.join(three, 'examples/jsm'), path.join(dist, 'vendor/three-addons'), { recursive: true });

// Cars and maps for the menus, so they show even when the game server is unreachable
const { gameInfo } = require('../server.js');
fs.writeFileSync(path.join(dist, 'info.json'), JSON.stringify({ ...gameInfo(), ips: [] }));

const server = (process.env.GAME_SERVER_URL || '').trim().replace(/\/+$/, '');
if (server && !/^https?:\/\//.test(server)) {
  console.error(`GAME_SERVER_URL must start with https:// (got "${server}")`);
  process.exit(1);
}
fs.writeFileSync(path.join(dist, 'config.js'), `window.GAME_SERVER_URL = ${JSON.stringify(server)};\n`);

if (server) console.log(`Built dist/ for game server ${server}`);
else console.warn('WARNING: GAME_SERVER_URL is not set, so the page will look for the game server on its own host. On Vercel that fails; set it in Project Settings > Environment Variables and redeploy.');
process.exit(0); // server.js leaves its game-loop timers running when required
