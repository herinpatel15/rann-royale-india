# Rann Royale

An original Indian-themed battle royale for the browser: **3D third-person mode** (Three.js) and a classic **2D top-down mode**.
You are **Preet-18** vs 29 bots. No code or assets from any other game.

## Run

**Single player (no server):** open `index.html` in Chrome / Edge / Firefox, click **Play 3D** or **2D Mode**.

**Wi-Fi multiplayer + phones (recommended):** on one computer run
```
cd rann-royale
node server.js          # needs Node 18+; no npm install
```
It prints addresses like `http://192.168.31.253:8000`. Open that address on **every** phone/laptop on the same Wi-Fi.

1. One person taps **Play with Friends → Create Room** – a 4-letter room code appears.
2. Everyone else opens the same address → **Play with Friends → Join**, types the code.
3. The room creator picks how many players (bots fill the empty slots), picks 3D or 2D for themself (each player chooses their own), and taps **Start Match**.
4. When the match ends everyone can return to the same lobby for another round.

Up to 12 humans per room (30 players with bots). The matches run on the computer that runs `node server.js`
(it simulates the game; phones only send controls and draw), so keep that terminal open. If macOS asks whether Node may accept
incoming connections, choose Allow. Anyone on the same Wi-Fi who has the address and room code can join – it is meant for a home/party network.

## Play on a phone / tablet (landscape)
Use the Wi-Fi server above (a phone cannot open a file from your computer). Touch controls:
**left thumb** = move (push far = sprint) · **right thumb** = look/aim · **FIRE / RELOAD / HEAL / PICK** buttons · tap a weapon slot to switch.
In 2D mode the right thumb is an aim stick (drag to aim, drag farther to fire).

## Controls (keyboard + mouse)
| Key | Action |
|---|---|
| W A S D | move (3D: relative to where the camera looks) |
| Mouse | look / aim (3D) · aim (2D) |
| Click | shoot |
| Shift | sprint |
| R | reload |
| E | pick up weapon |
| 1 / 2 / Q / wheel | switch weapon |
| H | drink Haldi Doodh (heal) |

## Theme
Rang Mahal Qila (fort with tricolour flag), Chandni Bazaar (striped awnings), Gaon Pipalwadi (terracotta huts),
Haveli Nagar (chhatri domes), Mandir Chowk (shikhara temple), Khet-Khalihan (farms), Ganga Ghat (river).
Kavach = armour, Haldi Doodh = heal, Toofan = the shrinking sandstorm zone.

## Files
- `server.js` – Wi-Fi multiplayer server (static files + WebSocket rooms; runs the real `game.js` headless for each match)
- `net.js` – lobby screens + WebSocket client for multiplayer
- `game.js` – game rules + 2D renderer + input/HUD (runs in the browser for solo, headless in the server for rooms, thin client online)
- `src3d/render3d.js` – 3D renderer source (Three.js scene: sky, sun shadows, buildings, trees, characters, zone wall)
- `render3d.bundle.js` – built from the above (this is what `index.html` loads; keeps the game openable from disk)

## Rebuild the 3D bundle (only if you edit `src3d/`)
```
npm install
npm run build
```

## Tuning
Top of `game.js`: `BOT_DMG`, `WEAPONS`, `PHASES` (zone timing); bot count in `newGame()`.
Server debug: `PORT=9000 node server.js`, `RR_TIMESCALE=8` (run matches 8x faster for testing).
Debug URL params: `?touch` (force touch UI) · `?auto3d` (skip menu) · `&nolock` (no pointer lock) · `&tp=x,y` · `&yaw=rad` · `&sim=seconds` (fast-forward).
