# ♠ Poker Hand Replayer

Import poker hand histories and replay them on a visual table — step by step,
street by street, with full playback controls. A zero-build web app: just static
files, ES modules, and a pure-JavaScript parser + replay engine that are unit
tested under Node.

![status](https://img.shields.io/badge/milestones-1%2C3%2C4%2C5%20%2B%20import%2Fstorage-blue)

## Quick start

No dependencies to install. Serve the folder over HTTP (ES modules don't load
from `file://`) and open it:

```bash
npm start          # python3 -m http.server 8080
# then open http://localhost:8080
```

Click **Sample** to load the bundled demo session (20 hands), or paste a hand
history into the box and hit **Parse Hand**. You can also **Open File…**, or drag
`.txt` files straight onto the window.

## Run the tests

```bash
npm test           # node --test  (no dependencies)
```

The suite covers money/card parsing, the PokerStars parser (cash, tournament with
antes, Omaha, all-in + side pots), multi-hand file splitting, the generic
fallback, and end-to-end replay (stacks, pots, street jumps) across 20+ sample
hands.

## What works today

| Spec area | Status |
|---|---|
| **§1 Import** — paste, open file, drag & drop, multi-hand files | ✅ |
| **§1.3 Parser** — id, date, table, stakes, seats, blinds/antes, actions, board, showdown, pots, rake, winners | ✅ (PokerStars + generic fallback) |
| **§1.5 Error handling** — incomplete flag, warnings, never drops data | ✅ |
| **§2.1 Storage** — local persistence, hand list | ✅ (localStorage) |
| **§2.5 Search** — players / tags / notes / id | ✅ |
| **§3 Visual table** — oval felt, seats, hole cards, badges, chip piles, board, pot | ✅ |
| **§3.5 Action feed** — plain-English log, current highlight, click to jump | ✅ |
| **§4 Controls** — start/back/play/forward/end, speed, keyboard shortcuts | ✅ |
| **§4.2 Street nav** + **§4.3 timeline** (click to seek, colored by street) | ✅ |
| **§4.5 Summary overlay** — winners, hero net, pot, rake | ✅ |
| **§6.1 Equity** — per-street win % for showdown contestants (side panel + per-seat bars) | ✅ |
| **§6.2 Pot odds** — call decisions annotated with pot odds in the action feed | ✅ |
| **§6.3 All-in equity** — runout equity shown per street at the all-in point | ✅ |
| **§7 Themes** — dark (default) / light toggle, responsive, ARIA labels | ✅ |

### Keyboard shortcuts
`←/→` step · `Space` play/pause · `Home/End` jump · `F/T/R/S` jump to street.

## Architecture

```
src/
  model/hand.js        Normalized Hand data model + card/money helpers (pure)
  parser/
    util.js            Money/currency parsing, multi-hand splitting
    pokerstars.js      PokerStars parser (cash + tournament, Hold'em + Omaha)
    generic.js         Best-effort fallback for unknown formats
    index.js           Site-detecting registry + parseHand / parseHandFile
  engine/replay.js     buildFrames(hand) → per-step state snapshots + pot odds
  engine/evaluator.js  7-card Hold'em hand evaluator (comparable scores)
  engine/equity.js     equity calculator (exact enumeration / Monte-Carlo)
  store/db.js          localStorage persistence (swappable for IndexedDB)
  ui/                  Vanilla DOM views: table, cards, controls, log, list, equity, app
tests/                 node:test suites (incl. jsdom UI tests) + sample hands
```

**Design choices**

- The **parser** and **replay engine** are DOM-free pure modules, so the same
  code runs in the browser and under `node --test`. Each site parser returns the
  same normalized `Hand`, so adding a site is local and testable.
- The **engine precomputes one immutable state snapshot per step**
  (`frames[0..N]`), so stepping, jumping to a street, clicking the timeline, and
  scrubbing are all O(1) lookups — backward navigation is free.
- Chip model: `committed` is what's in front of a player on the current street;
  it sweeps into `pot` when the street ends — which is exactly when chips would
  animate to the center.

### Adding a new site parser

1. Create `src/parser/<site>.js` exporting `canParse(text)` and a
   `parse<Site>(text)` that returns a normalized `Hand`.
2. Register it in `src/parser/index.js` **before** the generic fallback.
3. Add a sample `.txt` and assertions in `tests/`.

## Roadmap (next milestones)

- **§7 Multi-site** — dedicated GG / 888 / partypoker / Winamax parsers; watch-folder import (needs Electron/Tauri).
- **§5 Review tools** — street-by-street summary panel, range matrix annotation, player HUD stats (VPIP/PFR/AF).
- **§2 / §8 polish** — tagging & notes UI, CSV/JSON export & backup, side-pot
  splitting, settings panel.

Bundled sample histories are synthetic, for testing and demos.
