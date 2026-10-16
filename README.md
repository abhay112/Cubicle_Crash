# Car Fight 🚗💥

A local multiplayer car battle game. Every player snaps a webcam photo that gets stuck on the roof of their car, then everyone fights in one arena. Power-ups drop at random times and places. Every match is saved, and a winner list is shown at the end.

## Start it

```bash
npm install
npm start
```

- On this computer: open http://localhost:3000
- Other phones/laptops on the same Wi-Fi: open the `https://<your-ip>:3443` link printed in the terminal (also shown in the lobby). The browser will warn about the self-signed certificate; choose "Advanced" → "Proceed". HTTPS is needed so browsers allow the camera. (If you skip HTTPS, players can still use **Upload** to take a photo.)

## Play

1. Enter your name and take a photo.
2. One player clicks **Create room** and gets a 4-letter code. Everyone else enters the code and clicks **Join room**.
3. The host picks lives and match time, then clicks **Start match**.
4. Last car with lives left wins (or the best player when time runs out).

**Controls:** WASD / arrow keys to drive and steer, Shift to boost (recharging bar), Space to fire, H for the horn, C to switch between chase and top camera, M to mute, drag to rotate and scroll to zoom the camera. Phones get a joystick plus fire and boost buttons.

The arena is rendered in 3D with Three.js (`public/world.js`): a dirt arena with low-poly autumn trees, grass and rocks, a chase camera, boost trails, a minimap and a speedometer.

**Power-ups:** 🚀 rockets (splash damage) · 🔱 triple shot · 💣 mines · 🛡️ shield · ⚡ boost (faster, double ram damage) · ❤️ health. Ramming other cars at speed also does damage.

## Cars

Pick your car on the home screen (with a rotating 3D preview) or change it in the lobby: Maruti Suzuki Swift, Brezza and Ertiga, Tata Punch and Nexon, Kia Sonet, Hyundai Creta, Mahindra Thar and Scorpio-N, and Toyota Fortuner. Each has its own speed, handling and armor (small hatchbacks are fast but fragile, big SUVs are slow tanks). Each car sits in a ring of your player colour. Stats live in `CARS` in `server.js`; the low-poly shapes live in `public/cars.js`.

### Real car models

All 10 cars are real 3D models (free Creative Commons downloads from Sketchfab, credited on the home screen and in `public/models/credits.json`). There are no placeholder cars: a car is only offered if `public/models/<id>.glb` exists, and a match waits until every player's model has loaded.

The downloaded originals are in `models-src/` (97 MB) and are shrunk for the game by `tools/optimize-models.sh` (needs `cd tools && npm install` once): about 45k triangles or fewer and 1024 px WebP textures per car, 17 MB in total instead of 97 MB. To add or replace a car, put the original `.glb` in `models-src/`, add an `opt <id> <ratio>` line to the script, run it, and check which way the car faces (`FRONT` in `public/cars.js`).

### Speed

- The game picks its own resolution: it starts at up to 1.5x and drops to as low as 0.6x if the frame rate falls under ~45 fps, and turns shadows off as a last resort. It raises quality again when there is room.
- Models are downloaded on demand and merged into a few meshes per car.
- Player photos are sent once per player instead of with every lobby update; WebSocket messages skip compression and use TCP no-delay.
- The server costs well under 1% of a game tick even with 10 players (see `http://localhost:3000/api/stats`), so it stays in Node.js; a Rust or C++ rewrite would not make the game faster. The heavy work is graphics on the player's laptop.

## Maps

The host picks a map in the lobby (or 🎲 Random), and the 3D scene behind the menu changes to match: 🍂 Autumn Valley (204 x 136 m), 🌵 Desert Canyon (238 x 153 m), ❄️ Snow Peak (221 x 170 m), 🌃 Neon City (255 x 170 m) and 🌴 Jungle Maze (272 x 187 m). Each has its own sky, ground, trees and obstacle style. Bigger maps spawn power-ups more often. Layouts live in `MAPS` in `server.js` (`enlarge()` makes them bigger and scatters extra blocks symmetrically); looks live in `THEMES` in `public/world.js`.

## Match data

Each finished match is written to `data/matches/<time>_<room>.json`: players, settings, every kill, pickup, power-up spawn, respawn and elimination, plus final results (place, kills, deaths, damage dealt/taken, accuracy, power-ups). The **Leaderboard** button on the home and results screens shows all-time wins and stats from these files. APIs: `/api/matches`, `/api/matches/:id`, `/api/leaderboard`.

Ports can be changed with `PORT` and `HTTPS_PORT` env vars.
