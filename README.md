# Sediment Defender

A tower-defense game for 10th grade engineering (EPIC STEM, Mill Creek HS) that teaches how civil and environmental engineers protect watersheds with stormwater **Best Management Practices (BMPs)**.

Storms wash pollution down channels toward a creek. Students build real BMPs — silt fences, check dams, bioswales, sediment basins, riparian buffers, oil-grit separators, sand filters, and constructed wetlands — and have to match each one to what it can actually remove.

## What's in this repo

| Path | What it is |
|---|---|
| `public/` | **Version 2** — the web app deployed to Firebase Hosting |
| `public/index.html` | The game |
| `public/teacher.html` | Teacher dashboard (roster, scores, maps) |
| `public/editor.html` | Map editor (students can design maps) |
| `public/js/data/` | **Game balance + science:** pollutants, treatment mechanisms, BMPs, waves |
| `public/js/maps/builtin.js` | The three built-in maps |
| `firestore.rules` | Who can read/write what in the database |
| `tools/sim.mjs` | Headless balance tester (bots play every map) |
| `index.html` (repo root) | Version 1, left untouched |

## How the science works

Every BMP removes pollution through real **mechanisms**: filtration, settling, infiltration, plant uptake, biological treatment, adsorption, flotation, and energy dissipation. Every pollutant is vulnerable to some mechanisms and immune to others. Effectiveness comes from that match, so the strengths and weaknesses aren't arbitrary:

- Silt fence filters coarse sediment well, but dissolved nutrients pass straight through.
- Sediment basins settle sediment, but floating oil goes right over the top.
- Metals never break down, so only adsorption (soil, media, wetland muck) removes them.

The Field Guide's **"What Works?"** chart fills in as each student sees a pairing happen in a game, so they discover it instead of being handed a table. Run `npm run matrix` to print the full chart.

Other real-world trade-offs built in:

- **Clogging and maintenance.** Sediment fills BMPs, and performance drops when they're full. Sediment control upstream (pretreatment) protects the biological BMPs downstream.
- **No selling during storms.** You only get 50% salvage, which kills the old "sell everything in the last wave" trick.
- **Scoring** rewards water quality, river health, and storms survived, plus **cost efficiency** (pollution removed per dollar), **land use** (acres), and **unspent budget**.
- **Map 3 breaches.** Walls usually show seepage one storm before they fail, so reinforcing is cheaper than repairing. Some breaches still come with no warning.

## Deploying (first time)

You need [Node.js](https://nodejs.org) and the Firebase CLI on your computer.

```bash
npm install -g firebase-tools
firebase login
git clone https://github.com/matthewtbennett95-ui/sediment-defender.git
cd sediment-defender
git checkout v2-rebuild        # or main, after merging
firebase deploy --only hosting,firestore
```

The game will be at **https://sediment-defender.web.app**.

If the district ever blocks `web.app`, GitHub Pages serves the same files at `https://matthewtbennett95-ui.github.io/sediment-defender/public/` once this branch is merged. For the teacher dashboard to work there, add `matthewtbennett95-ui.github.io` under Authentication → Settings → Authorized domains.

One-time setup in the [Firebase console](https://console.firebase.google.com/project/sediment-defender) → **Authentication → Sign-in method**:

1. **Anonymous** must be enabled. The old game already used it, so it probably is.
2. **Google** must be enabled. This is for the teacher dashboard.

> **Heads up:** `firestore.rules` makes the old v1 `scores` collection read-only. Once you deploy the rules, the old game will stop saving scores, so switch students to the new link at the same time.

## Each school year

1. Open `/teacher.html`, sign in with Google, and open **Class Roster**.
2. Add the new school year and type or paste each class's names. You can also paste rows from your old Google Sheet (`Year, Period, Name`) into **Import**.
3. Past years stay in the list, so returning students can still pick their name.

Only emails in **both** `public/js/services/config.js` (`TEACHER_EMAILS`) and `firestore.rules` (`isTeacher()`) can use the dashboard.

## Adding maps

- **Students:** open `/editor.html`, draw channels, add ponds and scenery, click **Test play**, then **Export file**.
- **Teacher:** dashboard → **Maps** → **Import a map**, test it, then **Publish**. No code changes are needed.

A good prize for the leaderboard winner: their map becomes the next mission.

## Tuning the game

Each data file has comments explaining its numbers.

- `public/js/data/pollutants.js`: pollutant toughness, speed, damage, and which mechanisms affect them
- `public/js/data/bmps.js`: costs, range, treatment strength, capacity, land, and upgrades
- `public/js/data/waves.js`: the 20-storm season and how fast storms grow
- `public/js/maps/builtin.js`: starting budget, river health, and breach settings for each map
- `public/js/engine/scoring.js`: score weights

After changing numbers, run `npm run sim` to see how bots do on each map. As tuned right now:

- **Easy:** wins about every time
- **Medium:** about half
- **Hard:** a smart bot wins about 30% and a random one never does

Add `?dev` to the game URL for a 10× speed button.

## Running locally

```bash
npm run serve      # then open http://localhost:8080
```
