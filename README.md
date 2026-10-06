# Stick Hero

A hand-drawn arcade bridge game. Hold to grow a stick, release to drop it, and walk across. Miss the gap and you fall. Built with plain HTML5 Canvas and vanilla JavaScript: no frameworks, no bundler, no build step.

![Title screen](docs/screenshots/title.png)

## Features

- Hold-and-release bridge mechanic with a difficulty curve that tightens gaps and narrows pillars as your score climbs.
- Mid-walk gravity flip: tap while crossing a gap to hang under the stick and grab cherries.
- Perfect drops on the red target pillar marker, with a combo multiplier.
- Armory with 6 heroes and 6 stick styles, each with a rarity tier, all drawn in code (no image assets).
- 12 feats that pay out cherries, a Records tab with lifetime stats, and a daily gift with a streak bonus.
- Six maps, each with its own sky, three-layer parallax scenery, pillar material and weather: Pine Meadow (fireflies), Sakura Shrine (petals), Dune Canyon (dust), Frozen Peaks (snow and aurora), Neon Harbor (rain and a lit skyline) and Ember Caldera (embers). Every map blends day, dusk and night as your score climbs, and the armory previews cycle through all three.
- Fully synthesised soundtrack of effects, no audio files: a creaking bamboo stick that rises in pitch as it grows, wood-on-stone knocks, soft sandal footsteps locked to the leg animation, taiko impacts and koto-style plucks. Everything is tuned to one pentatonic scale, perfect combos climb it, and a temple bell marks dusk and night. Mute with the speaker button or `M`.
- Fully responsive: phones in portrait and landscape, tablets, laptops and ultrawide monitors. Safe-area insets keep the HUD clear of notches, cards scroll instead of clipping on short screens, and tap targets stay thumb-sized.
- Works with mouse, touch and keyboard.
- Versioned save in `localStorage`, with migration from the previous release's keys.

## Screenshots

| Growing a bridge | Gravity flip | Perfect drop |
| --- | --- | --- |
| ![Stretching](docs/screenshots/stretching.png) | ![Flip](docs/screenshots/flip.png) | ![Perfect](docs/screenshots/perfect.png) |

| Armory: heroes | Armory: sticks | Records and feats |
| --- | --- | --- |
| ![Heroes](docs/screenshots/armory-heroes.png) | ![Sticks](docs/screenshots/armory-sticks.png) | ![Records](docs/screenshots/armory-records.png) |

| Pause | Game over | Phone |
| --- | --- | --- |
| ![Pause](docs/screenshots/pause.png) | ![Game over](docs/screenshots/gameover.png) | ![Phone](docs/screenshots/mobile-play.png) |

### Responsive

| Phone, landscape | Landscape game over | Landscape armory | Tablet |
| --- | --- | --- | --- |
| ![Landscape](docs/screenshots/landscape-play.png) | ![Landscape game over](docs/screenshots/landscape-gameover.png) | ![Landscape armory](docs/screenshots/landscape-armory.png) | ![Tablet](docs/screenshots/tablet-title.png) |

### Maps

| Pine Meadow | Sakura Shrine | Dune Canyon |
| --- | --- | --- |
| ![Pine Meadow](docs/screenshots/maps/meadow-day.png) | ![Sakura Shrine](docs/screenshots/maps/sakura-day.png) | ![Dune Canyon](docs/screenshots/maps/desert-dusk.png) |

| Frozen Peaks | Neon Harbor | Ember Caldera |
| --- | --- | --- |
| ![Frozen Peaks](docs/screenshots/maps/frost-night.png) | ![Neon Harbor](docs/screenshots/maps/neon-night.png) | ![Ember Caldera](docs/screenshots/maps/volcano-dusk.png) |

Maps are bought with cherries in the armory's Maps tab and apply to the next frame you play. Pine Meadow is free.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Grow the stick | Press and hold | Hold `Space` or `Enter` |
| Drop the stick | Release | Release `Space` or `Enter` |
| Flip while crossing | Click or tap | `Space` or `Enter` |
| Pause / resume | Pause button | `P` or `Esc` |
| Mute / unmute | Speaker button | `M` |
| Open the armory | Armory button | `A` |

## Rules

- A landing scores 1 point. A perfect drop (stick tip on the red marker) scores `combo x 2`, and the combo grows with each consecutive perfect.
- Flipping is only allowed while you are over a gap. Arriving at a pillar upside down crashes into it.
- Cherries hang beneath wide gaps (80 px or more). You can only collect them while flipped.
- The sky changes at scores 10 (dusk) and 20 (night) on every map.
- The daily gift pays 10 cherries plus 2 per streak day, capped at 22.

## Run locally

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
npm start
```

Then open <http://localhost:8089>. The server only serves the `public/` folder and rejects path traversal. Any static host works too, since the game is just files.

## Tests

```bash
npm test          # 46 unit tests for the game simulation, storage and catalog
npm run test:e2e  # 60 browser checks (needs the server running and Playwright)
npm run test:responsive  # 453 layout checks across 12 device sizes
```

The end-to-end suite drives the real UI: starting a run, holding and releasing, flips, cherries, pause, game over, persistence, reset and a phone-sized viewport. It also fails on any console error. The responsive suite loads every screen at 12 sizes (from a 320x568 iPhone SE to a 2560x1080 ultrawide, portrait and landscape) and fails on clipped content, overlapping HUD groups, page scrolling, tap targets under 34 px or a card that does not fit. Set `SHOOT=1` to save screenshots of each. The suites read Playwright from `PLAYWRIGHT_PATH` if set, and regenerates the images in `docs/screenshots/`.

## Project structure

```text
public/
  index.html        markup, SVG icon sprite, all screens
  css/style.css     paper-cut UI theme
  assets/           self-hosted fonts and favicon
  js/
    game.js         simulation: physics, rules, difficulty (no DOM, no canvas)
    renderer.js     canvas scene: pillars, hero, particles, shake, theme blend
    scenery.js      per-map sky, ridges, props, pillar materials, weather
    maps.js         the six maps as data (palettes, layers, pillar, weather)
    draw.js         hero, stick and cherry drawing helpers
    catalog.js      heroes, sticks, feats, rarity, map lookup
    storage.js      versioned save, migration, daily gift
    audio.js        Web Audio sound synthesis
    ui.js           HUD, armory, toasts, dialogs
    main.js         input, game loop, wiring
server.js           tiny static file server
tests/              unit and end-to-end suites
```

The simulation in `game.js` is pure logic that emits events (`perfect`, `flip`, `cherry`, `crash`, ...). `main.js` translates those into sound, UI updates and screen shake, and `renderer.js` only reads game state. That split is what lets the unit tests run in plain Node.

## Deploy

The repo includes a `vercel.json` that publishes `public/` with clean URLs. On Vercel, import the repository and keep the defaults. GitHub Pages or Netlify work the same way by pointing them at `public/`.

## License

MIT, see [LICENSE](LICENSE). Made by [Sunil](https://github.com/Sunil56224972).