# Nova Dash

A browser arcade racer on **Jellybean Ridge**, the first stop of the Ribbon Cup. Six original racers, crate power-ups, three laps, a live leaderboard, and a podium.

Everything on screen — names, track, items, and shapes — is original.

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

The static site lands in `dist/`.

## Controls

The buggy accelerates on its own. You steer, brake, drift, and fire items.

| Action | Keyboard | On screen |
| --- | --- | --- |
| Steer | A / D or Left / Right | ◀ ▶ |
| Brake | S or Down | Brake |
| Drift | W, Up, or Shift while turning | Drift |
| Use item | Space, E, or F | Item |
| Choose racer | Left / Right on the menu | Racer cards |
| Start | Enter or Race! | Race! |
| Pause | Esc | Pause |
| Mute | M | Sound |

Tap during the **GO** window for a start burst. Release a charged drift for a boost. Yellow chevrons on the road are boost pads. Spinning crates hand you one item.

## Racers

- **Quill Swift** — snappy acceleration
- **Moss Bumper** — heavy grip
- **Luma Vane** — highest top speed
- **Nix Hoot** — balanced, luckier crates
- **Cinder Hop** — longer drift boosts
- **Pebble Dumpling** — steady and sturdy

## Items

- **Spark Coil** — speed burst
- **Pebble Pop** — drops a bumper
- **Gust Orb** — homing spin-out
- **Bubble Wrap** — blocks one hit
- **Nova Bloom** — invincible dash

## Deploy

The repo is set up as a static Vite site. On Vercel, import the project and leave the defaults: framework **Vite**, build `npm run build`, output `dist`. `vercel.json` records the same settings.

No API keys, no paid services, no server.
