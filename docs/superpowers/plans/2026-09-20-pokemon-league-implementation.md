# Pokémon TCG Family League Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages site that tracks a family Pokémon TCG league (4 players, ad-hoc pairings, borrowable decks), fitting a joint player-skill + deck-strength rating model from a plain-text match log, with weak-deck flagging and "try this next" matchup suggestions.

**Architecture:** A single static page (`index.html` + ES modules under `src/` + a Tailwind-compiled `tailwind.css`) with no runtime build step. All rating math (a two-factor Bradley-Terry model fit via Newton-Raphson) runs client-side against JSON data files under `data/`. Chart.js (CDN) renders rating-history line charts.

**Tech Stack:** Plain HTML/CSS/JS with native ES modules, Tailwind CSS (compiled once via the Tailwind CLI, output committed), Chart.js via CDN, Node's built-in `node:assert` for dev-time tests (no test framework dependency), GitHub Pages for hosting.

**Spec:** `docs/superpowers/specs/2026-09-18-pokemon-league-design.md`

## Global Constraints

- No runtime build step — GitHub Pages must be able to serve the repo's files as-is.
- No npm runtime dependencies; Tailwind is a dev-only dependency, its compiled output is committed.
- No test framework — tests are plain scripts using Node's built-in `node:assert/strict`, run via `node <file>`.
- Every match record in `data/matches.json` is fully explicit (`player1`, `deck1`, `player2`, `deck2`, `winner`, `date`) — no inferred defaults stored in the file itself.
- `data/matches.json` starts as `[]` (fresh start, per spec — no backfilled history).
- Players are `M`, `T`, `C`, `J`. Target repo: `https://github.com/JonasHelming/pokemom-league` (exact name as created — do not "fix" the spelling).

---

### Task 1: Project scaffold — Tailwind, page skeleton, git remote

**Files:**
- Create: `package.json`
- Create: `tailwind.config.js`
- Create: `src/input.css`
- Create: `index.html`
- Create: `.gitignore`

**Interfaces:**
- Produces: `tailwind.css` (compiled, committed) referenced by `index.html`; DOM element ids that later tasks render into: `#weak-deck-banners`, `#suggestions-panel`, `#player-leaderboard`, `#player-rating-chart` (canvas), `#player-head-to-head`, `#deck-leaderboard`, `#deck-rating-chart` (canvas), `#deck-head-to-head`, `#match-history`; a `<script type="module" src="src/main.js">` load point for Task 9's `main.js`.

- [ ] **Step 1: Initialize npm and add Tailwind as a dev dependency**

```bash
npm init -y
npm install -D tailwindcss@^3.4.0
```

- [ ] **Step 2: Write `package.json` scripts**

Replace the generated `package.json` with:

```json
{
  "name": "pokemon-league",
  "private": true,
  "type": "module",
  "scripts": {
    "build:css": "tailwindcss -i ./src/input.css -o ./tailwind.css --minify",
    "test": "node tests/linalg.test.js && node tests/bradley-terry.test.js && node tests/history.test.js && node tests/recommendations.test.js && node tests/render.test.js && node tests/charts.test.js"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0"
  }
}
```

- [ ] **Step 3: Create `tailwind.config.js`**

Type-color accents (fire/water/grass/electric) and a playful display font, per
the spec's visual-style section:

```js
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: { display: ['"Baloo 2"', 'cursive'] },
      colors: {
        typeFire: '#f87171',
        typeWater: '#60a5fa',
        typeGrass: '#4ade80',
        typeElectric: '#facc15',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: Create `src/input.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Create `index.html`**

Uses Google Fonts' "Baloo 2" (free, open-license, no Nintendo assets) for the
playful display font referenced by `tailwind.config.js` above.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pokémon TCG Family League</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="tailwind.css" />
</head>
<body class="bg-slate-50 text-slate-900 font-display p-6 max-w-4xl mx-auto space-y-8">
  <h1 class="text-3xl font-bold">Pokémon TCG Family League</h1>

  <div id="weak-deck-banners"></div>
  <div id="suggestions-panel"></div>

  <div id="player-leaderboard"></div>
  <canvas id="player-rating-chart" class="bg-white rounded p-2"></canvas>
  <div id="player-head-to-head"></div>

  <div id="deck-leaderboard"></div>
  <canvas id="deck-rating-chart" class="bg-white rounded p-2"></canvas>
  <div id="deck-head-to-head"></div>

  <div id="match-history"></div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 7: Build the Tailwind CSS output**

```bash
npm run build:css
```

Expected: creates `tailwind.css` in the repo root, non-empty (Tailwind's base/utility layers even with no custom classes used yet produce a non-trivial file, typically several KB).

- [ ] **Step 8: Verify the build output exists and is non-empty**

```bash
test -s tailwind.css && echo "OK: tailwind.css generated"
```

Expected: prints `OK: tailwind.css generated`.

- [ ] **Step 9: Point the repo at the existing GitHub remote**

```bash
git remote add origin https://github.com/JonasHelming/pokemom-league.git
git remote -v
```

Expected: `origin` listed with the `pokemom-league` URL for both fetch and push. Do not push yet — that happens in Task 10, after the user confirms.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tailwind.config.js src/input.css index.html .gitignore tailwind.css
git commit -m "Scaffold static site with Tailwind build"
```

---

### Task 2: Seed data files and entry-convention README

**Files:**
- Create: `data/players.json`
- Create: `data/decks.json`
- Create: `data/matches.json`
- Create: `data/README.md`

**Interfaces:**
- Produces: the on-disk data schema every later task reads: `players.json` → `[{id, name, defaultDeck}]`; `decks.json` → `[{id, name, owner, predecessor?, retired?}]`; `matches.json` → `[{player1, deck1, player2, deck2, winner, date}]` (`winner` equals the winning player's `id`, `date` is `"YYYY-MM-DD"`).

- [ ] **Step 1: Create `data/players.json`**

```json
[
  { "id": "M", "name": "M", "defaultDeck": "fire" },
  { "id": "T", "name": "T", "defaultDeck": "water" },
  { "id": "C", "name": "C", "defaultDeck": "grass" },
  { "id": "J", "name": "J", "defaultDeck": "electric" }
]
```

- [ ] **Step 2: Create `data/decks.json`**

```json
[
  { "id": "fire", "name": "Fire", "owner": "M" },
  { "id": "water", "name": "Water", "owner": "T" },
  { "id": "grass", "name": "Grass", "owner": "C" },
  { "id": "electric", "name": "Electric", "owner": "J" }
]
```

- [ ] **Step 3: Create `data/matches.json`**

```json
[]
```

- [ ] **Step 4: Create `data/README.md`**

```markdown
# League data files

- `players.json` — one entry per player, with their usual (`defaultDeck`) deck id.
- `decks.json` — one entry per deck version. `owner` is who normally plays it.
  A rebuilt deck gets a new id (e.g. `fire` → `fire-1`), sets `predecessor`
  to the old id, and the old entry is marked `retired: true`.
- `matches.json` — one entry per match: `{ player1, deck1, player2, deck2, winner, date }`.
  `winner` is the winning player's id. Every match is always fully explicit,
  even if a player used their own default deck.

## Adding a match from a casual report

If someone reports a result by names only (e.g. "M beat T"), fill in the
deck fields from each player's `defaultDeck` in `players.json` before
committing the entry — unless they mention a borrowed deck, in which case
use the deck actually played. This lets a person, or an AI agent given a
one-line report, always produce a fully explicit `matches.json` entry.
```

- [ ] **Step 5: Verify all three JSON files parse**

```bash
node -e "['players','decks','matches'].forEach(f => { JSON.parse(require('fs').readFileSync('data/'+f+'.json','utf8')); console.log('OK:', f); })"
```

Expected: prints `OK: players`, `OK: decks`, `OK: matches`.

- [ ] **Step 6: Commit**

```bash
git add data/players.json data/decks.json data/matches.json data/README.md
git commit -m "Add seed data files and entry-convention README"
```

---

### Task 3: Linear algebra utilities

**Files:**
- Create: `src/linalg.js`
- Test: `tests/linalg.test.js`

**Interfaces:**
- Produces: `invert(matrix: number[][]): number[][]`, `matVec(matrix: number[][], vec: number[]): number[]`, `dot(a: number[], b: number[]): number`, `quadForm(matrix: number[][], vec: number[]): number`, `shermanMorrisonGain(cov: number[][], x: number[], w: number): number` — all pure functions, no dependencies. Consumed by Task 4 (Newton-Raphson solve + covariance) and Task 6 (matchup-suggestion scoring).

- [ ] **Step 1: Write the failing test**

Create `tests/linalg.test.js`:

```js
import assert from 'node:assert/strict';
import { invert, matVec, dot, quadForm, shermanMorrisonGain } from '../src/linalg.js';

const inv2x2 = invert([[4, 7], [2, 6]]);
assert.ok(Math.abs(inv2x2[0][0] - 0.6) < 1e-9);
assert.ok(Math.abs(inv2x2[0][1] - -0.7) < 1e-9);
assert.ok(Math.abs(inv2x2[1][0] - -0.2) < 1e-9);
assert.ok(Math.abs(inv2x2[1][1] - 0.4) < 1e-9);

assert.deepEqual(invert([[1, 0], [0, 1]]), [[1, 0], [0, 1]]);

assert.throws(() => invert([[1, 2], [2, 4]]));

assert.deepEqual(matVec([[1, 0], [0, 1]], [3, 4]), [3, 4]);
assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
assert.equal(quadForm([[1, 0], [0, 1]], [3, 4]), 25);
assert.equal(shermanMorrisonGain([[1, 0], [0, 1]], [1, 0], 1), 0.5);

console.log('OK: linalg.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/linalg.test.js`
Expected: FAIL — `Cannot find module '../src/linalg.js'`.

- [ ] **Step 3: Write `src/linalg.js`**

```js
export function invert(matrix) {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => {
    const identityRow = new Array(n).fill(0);
    identityRow[i] = 1;
    return [...row, ...identityRow];
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow][col]) < 1e-12) {
      throw new Error('Matrix is singular and cannot be inverted');
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    const pivotValue = augmented[col][col];
    for (let j = 0; j < 2 * n; j++) {
      augmented[col][j] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = 0; j < 2 * n; j++) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row.slice(n));
}

export function matVec(matrix, vec) {
  return matrix.map((row) => row.reduce((sum, value, j) => sum + value * vec[j], 0));
}

export function dot(a, b) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

export function quadForm(matrix, vec) {
  return dot(vec, matVec(matrix, vec));
}

export function shermanMorrisonGain(cov, x, w) {
  const covX = matVec(cov, x);
  const numerator = w * dot(covX, covX);
  const denominator = 1 + w * dot(x, covX);
  return numerator / denominator;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/linalg.test.js`
Expected: PASS — prints `OK: linalg.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/linalg.js tests/linalg.test.js
git commit -m "Add linear algebra utilities for the rating model"
```

---

### Task 4: Joint Bradley-Terry rating fit

**Files:**
- Create: `src/bradley-terry.js`
- Test: `tests/bradley-terry.test.js`

**Interfaces:**
- Consumes: `invert`, `matVec`, `dot`, `quadForm` from `src/linalg.js` (Task 3).
- Produces:
  - `buildDesignRow(playerA, deckA, playerB, deckB, playerIndex, deckIndex, numFree): number[]`
  - `fitBradleyTerry(matches, playerIds, deckIds): { playerIndex: Map, deckIndex: Map, playerAnchor: string, deckAnchor: string, theta: number[], cov: number[][], numFree: number }`
  - `predictWinProbability(fit, playerA, deckA, playerB, deckB): number`
  - `meanCenteredRatings(fit, family: 'player'|'deck', ids: string[]): { [id]: { value: number, se: number } }`
  - `toEloScale(value: number): number`

  Consumed by Task 5 (`fitBradleyTerry`, `meanCenteredRatings`, `toEloScale`), Task 6 (`buildDesignRow`, `predictWinProbability`, `meanCenteredRatings`), and Task 9 (`fitBradleyTerry`, `meanCenteredRatings`, `toEloScale`).

- [ ] **Step 1: Write the failing test**

Create `tests/bradley-terry.test.js`:

```js
import assert from 'node:assert/strict';
import { fitBradleyTerry, predictWinProbability, meanCenteredRatings, toEloScale } from '../src/bradley-terry.js';

// Balanced dataset: A/x and B/y trade wins evenly -> ratings should stay at 0.5/0.5.
const balancedMatches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'B', date: '2026-01-02' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'B', date: '2026-01-03' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'A', date: '2026-01-04' },
];
const balancedFit = fitBradleyTerry(balancedMatches, ['A', 'B'], ['x', 'y']);
const balancedP = predictWinProbability(balancedFit, 'A', 'x', 'B', 'y');
assert.ok(Math.abs(balancedP - 0.5) < 1e-6, `expected ~0.5, got ${balancedP}`);

// Lopsided dataset: A/x beats B/y five times straight.
const lopsidedMatches = Array.from({ length: 5 }, (_, i) => ({
  player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: `2026-02-0${i + 1}`,
}));
const lopsidedFit = fitBradleyTerry(lopsidedMatches, ['A', 'B'], ['x', 'y']);
const lopsidedP = predictWinProbability(lopsidedFit, 'A', 'x', 'B', 'y');
assert.ok(lopsidedP > 0.7, `expected a strong A favorite, got ${lopsidedP}`);

const playerRatings = meanCenteredRatings(lopsidedFit, 'player', ['A', 'B']);
assert.ok(playerRatings.A.value > playerRatings.B.value, 'A should rate above B');
assert.ok(playerRatings.A.se > 0 && Number.isFinite(playerRatings.A.se), 'se should be a finite positive number');

assert.equal(toEloScale(0), 1000);

console.log('OK: bradley-terry.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bradley-terry.test.js`
Expected: FAIL — `Cannot find module '../src/bradley-terry.js'`.

- [ ] **Step 3: Write `src/bradley-terry.js`**

```js
import { invert, matVec, dot, quadForm } from './linalg.js';

const RIDGE = 1e-6;
const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD = 1e-9;

function buildIndex(ids, offset) {
  const anchor = ids[0];
  const index = new Map();
  ids.forEach((id, i) => {
    index.set(id, i === 0 ? null : offset + i - 1);
  });
  return { index, anchor };
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function buildDesignRow(playerA, deckA, playerB, deckB, playerIndex, deckIndex, numFree) {
  const x = new Array(numFree).fill(0);
  const add = (index, sign) => {
    if (index !== null && index !== undefined) x[index] += sign;
  };
  add(playerIndex.get(playerA), 1);
  add(playerIndex.get(playerB), -1);
  add(deckIndex.get(deckA), 1);
  add(deckIndex.get(deckB), -1);
  return x;
}

function computeNegHessian(rows, theta, numFree) {
  const negHessian = Array.from({ length: numFree }, () => new Array(numFree).fill(0));
  for (const { x } of rows) {
    const p = sigmoid(dot(theta, x));
    const w = p * (1 - p);
    for (let i = 0; i < numFree; i++) {
      for (let j = 0; j < numFree; j++) {
        negHessian[i][j] += w * x[i] * x[j];
      }
    }
  }
  for (let i = 0; i < numFree; i++) negHessian[i][i] += RIDGE;
  return negHessian;
}

export function fitBradleyTerry(matches, playerIds, deckIds) {
  const { index: playerIndex, anchor: playerAnchor } = buildIndex(playerIds, 0);
  const { index: deckIndex, anchor: deckAnchor } = buildIndex(deckIds, playerIds.length - 1);
  const numFree = (playerIds.length - 1) + (deckIds.length - 1);

  const rows = matches.map((m) => ({
    x: buildDesignRow(m.player1, m.deck1, m.player2, m.deck2, playerIndex, deckIndex, numFree),
    y: m.winner === m.player1 ? 1 : 0,
  }));

  let theta = new Array(numFree).fill(0);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const grad = new Array(numFree).fill(0);
    for (const { x, y } of rows) {
      const p = sigmoid(dot(theta, x));
      for (let i = 0; i < numFree; i++) grad[i] += (y - p) * x[i];
    }

    const negHessian = computeNegHessian(rows, theta, numFree);
    const cov = invert(negHessian);
    const delta = matVec(cov, grad);
    theta = theta.map((v, i) => v + delta[i]);

    if (delta.every((d) => Math.abs(d) < CONVERGENCE_THRESHOLD)) break;
  }

  const cov = invert(computeNegHessian(rows, theta, numFree));

  return { playerIndex, deckIndex, playerAnchor, deckAnchor, theta, cov, numFree };
}

export function predictWinProbability(fit, playerA, deckA, playerB, deckB) {
  const x = buildDesignRow(playerA, deckA, playerB, deckB, fit.playerIndex, fit.deckIndex, fit.numFree);
  return sigmoid(dot(fit.theta, x));
}

function paramVectorFor(fit, family, id) {
  const v = new Array(fit.numFree).fill(0);
  const index = family === 'player' ? fit.playerIndex.get(id) : fit.deckIndex.get(id);
  if (index !== null && index !== undefined) v[index] = 1;
  return v;
}

export function meanCenteredRatings(fit, family, ids) {
  const vectors = ids.map((id) => paramVectorFor(fit, family, id));
  const m = ids.length;
  const meanVector = new Array(fit.numFree).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < fit.numFree; i++) meanVector[i] += v[i] / m;
  }

  const result = {};
  ids.forEach((id, idx) => {
    const diff = vectors[idx].map((v, i) => v - meanVector[i]);
    result[id] = {
      value: dot(diff, fit.theta),
      se: Math.sqrt(Math.max(quadForm(fit.cov, diff), 0)),
    };
  });
  return result;
}

export function toEloScale(value) {
  return 1000 + value * (400 / Math.LN10);
}
```

Note: standard errors are computed on the *mean-centered* parameterization
(`diff` vectors), not the raw anchored `theta` values — the anchor entity's
raw value is fixed at 0 by construction, but its mean-centered value and
uncertainty are still well-defined and correctly reflect the covariance
matrix, since `diff` is nonzero even for the anchor.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/bradley-terry.test.js`
Expected: PASS — prints `OK: bradley-terry.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/bradley-terry.js tests/bradley-terry.test.js
git commit -m "Add joint player-skill + deck-strength Bradley-Terry rating fit"
```

---

### Task 5: Rating history over time

**Files:**
- Create: `src/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Consumes: `fitBradleyTerry`, `meanCenteredRatings`, `toEloScale` from `src/bradley-terry.js` (Task 4).
- Produces: `computeRatingHistory(matches, playerIds, deckIds): Array<{ date: string, playerRatings: {[id]: number}, deckRatings: {[id]: number} }>`. Consumed by Task 9 (`main.js`, feeding the rating-history charts).

- [ ] **Step 1: Write the failing test**

Create `tests/history.test.js`:

```js
import assert from 'node:assert/strict';
import { computeRatingHistory } from '../src/history.js';

const matches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-03' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'B', date: '2026-01-02' },
];

const history = computeRatingHistory(matches, ['A', 'B'], ['x', 'y']);

assert.equal(history.length, 3);
assert.deepEqual(history.map((h) => h.date), ['2026-01-01', '2026-01-02', '2026-01-03']);
assert.ok(Number.isFinite(history[0].playerRatings.A));
assert.ok(Number.isFinite(history[0].playerRatings.B));
assert.ok(Number.isFinite(history[2].deckRatings.x));

console.log('OK: history.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/history.test.js`
Expected: FAIL — `Cannot find module '../src/history.js'`.

- [ ] **Step 3: Write `src/history.js`**

```js
import { fitBradleyTerry, meanCenteredRatings, toEloScale } from './bradley-terry.js';

export function computeRatingHistory(matches, playerIds, deckIds) {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const snapshots = [];

  for (let i = 1; i <= sorted.length; i++) {
    const subset = sorted.slice(0, i);
    const fit = fitBradleyTerry(subset, playerIds, deckIds);
    const playerRatings = meanCenteredRatings(fit, 'player', playerIds);
    const deckRatings = meanCenteredRatings(fit, 'deck', deckIds);

    snapshots.push({
      date: sorted[i - 1].date,
      playerRatings: Object.fromEntries(playerIds.map((id) => [id, toEloScale(playerRatings[id].value)])),
      deckRatings: Object.fromEntries(deckIds.map((id) => [id, toEloScale(deckRatings[id].value)])),
    });
  }

  return snapshots;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/history.test.js`
Expected: PASS — prints `OK: history.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/history.js tests/history.test.js
git commit -m "Add rating history over time for charts"
```

---

### Task 6: Weak-deck flagging and matchup suggestions

**Files:**
- Create: `src/recommendations.js`
- Test: `tests/recommendations.test.js`

**Interfaces:**
- Consumes: `meanCenteredRatings`, `buildDesignRow`, `predictWinProbability` from `src/bradley-terry.js` (Task 4); `shermanMorrisonGain` from `src/linalg.js` (Task 3).
- Produces:
  - `countMatchesByDeck(matches): Map<string, number>`
  - `flagWeakDecks(fit, activeDeckIds, matches, minMatches = 8): string[]`
  - `suggestMatchups(fit, activePlayerIds, activeDeckIds, topN = 3): Array<{ playerA, deckA, playerB, deckB, predictedWinProbA: number, gain: number }>`

  Consumed by Task 9 (`main.js`).

- [ ] **Step 1: Write the failing test**

Create `tests/recommendations.test.js`:

```js
import assert from 'node:assert/strict';
import { fitBradleyTerry } from '../src/bradley-terry.js';
import { flagWeakDecks, suggestMatchups, countMatchesByDeck } from '../src/recommendations.js';

// Deck x beats deck y most of the time (not always — see below), and
// piloting alternates between A and B every match. The crossed pairing is
// what makes deck strength statistically separable from player skill at all
// — a fixed pairing (A always on x, B always on y) makes "player B is weak"
// and "deck y is weak" perfectly confounded, no matter how much data you add
// (see the design spec's identifiability discussion).
//
// Outcomes must NOT be 100% deterministic: if the stronger deck wins every
// single match, that's complete separation in the logistic fit — under ridge
// regularization the standard error then shrinks only as 1/sqrt(ln n)
// instead of 1/sqrt(n), so the confidence-interval gap required to flag a
// deck is essentially never reached, no matter how large n gets. A periodic,
// deterministic "upset" (the weaker deck occasionally wins) keeps the
// fixture reproducible while giving the MLE a finite true win probability to
// converge to, so `se` actually shrinks like 1/sqrt(n) as more matches are
// added — which is what makes `flagWeakDecks` able to fire at all.
//
// Numerically verified (see the Task 6 implementation report): even
// `upsetEvery` values (4, 6, 8, ...) are pathological here, because
// `isUpset` (`i % upsetEvery === upsetEvery - 1`) then always coincides with
// the same parity of `i`, so every match of one covariate pattern (e.g. "A
// pilots x") is won 100% of the time while the other pattern still has
// upsets. That one always-100% pattern is quasi-complete separation — the
// same failure mode as the all-deterministic fixture above, just confined to
// half the data — producing a huge, non-shrinking `se` no matter how large
// `n` gets. It is NOT a rank-deficiency/confound problem (the design matrix
// stays full rank) — an odd `upsetEvery` fixes it by making the upset land
// on both parities, so every covariate pattern sees some losses and `se`
// shrinks cleanly like 1/sqrt(n). `upsetEvery = 5` (an 80% win rate for the
// stronger deck) combined with `n = 20` gives a comfortable, verified margin
// that holds stably for n in [12, 40] — `upsetEvery = 3` (67% win rate) has
// the right parity but too small an effect size to separate at n = 20 (it
// needs n ≳ 26), so don't assume any odd value works at any n.
function makeMatches(n, upsetEvery = 5) {
  return Array.from({ length: n }, (_, i) => {
    const aUsesX = i % 2 === 0;
    const isUpset = i % upsetEvery === upsetEvery - 1;
    const xPilotWins = !isUpset;
    const winner = xPilotWins === aUsesX ? 'A' : 'B';
    return {
      player1: 'A', deck1: aUsesX ? 'x' : 'y',
      player2: 'B', deck2: aUsesX ? 'y' : 'x',
      winner,
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    };
  });
}

// Deck y loses most matches (regardless of pilot) and has enough matches
// (well over the minMatches=8 threshold) -> should be flagged.
const enoughData = makeMatches(20);
const fitEnough = fitBradleyTerry(enoughData, ['A', 'B'], ['x', 'y']);
const flaggedEnough = flagWeakDecks(fitEnough, ['x', 'y'], enoughData, 8);
assert.deepEqual(flaggedEnough, ['y']);

// Same pattern but too few matches (under the threshold) -> should not be
// flagged yet, regardless of how bad deck y's point estimate looks.
const notEnoughData = makeMatches(5);
const fitNotEnough = fitBradleyTerry(notEnoughData, ['A', 'B'], ['x', 'y']);
const flaggedNotEnough = flagWeakDecks(fitNotEnough, ['x', 'y'], notEnoughData, 8);
assert.deepEqual(flaggedNotEnough, []);

assert.equal(countMatchesByDeck(enoughData).get('x'), enoughData.length);
assert.equal(countMatchesByDeck(enoughData).get('y'), enoughData.length);

// Player C and its decks have zero data -> suggestions should prioritize C.
const players = ['A', 'B', 'C'];
const decks = ['x', 'y'];
const sparseMatches = makeMatches(10);
const sparseFit = fitBradleyTerry(sparseMatches, players, decks);
const suggestions = suggestMatchups(sparseFit, players, decks, 3);
assert.ok(suggestions.length > 0);
assert.ok(
  suggestions[0].playerA === 'C' || suggestions[0].playerB === 'C',
  `expected top suggestion to involve under-sampled player C, got ${JSON.stringify(suggestions[0])}`
);

console.log('OK: recommendations.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/recommendations.test.js`
Expected: FAIL — `Cannot find module '../src/recommendations.js'`.

- [ ] **Step 3: Write `src/recommendations.js`**

```js
import { meanCenteredRatings, buildDesignRow, predictWinProbability } from './bradley-terry.js';
import { shermanMorrisonGain } from './linalg.js';

export function countMatchesByDeck(matches) {
  const counts = new Map();
  for (const m of matches) {
    counts.set(m.deck1, (counts.get(m.deck1) || 0) + 1);
    counts.set(m.deck2, (counts.get(m.deck2) || 0) + 1);
  }
  return counts;
}

export function flagWeakDecks(fit, activeDeckIds, matches, minMatches = 8) {
  if (activeDeckIds.length < 2) return [];

  const ratings = meanCenteredRatings(fit, 'deck', activeDeckIds);
  const counts = countMatchesByDeck(matches);
  const flagged = [];

  for (const deckId of activeDeckIds) {
    if ((counts.get(deckId) || 0) < minMatches) continue;
    const upper = ratings[deckId].value + 1.96 * ratings[deckId].se;
    const isBehindAll = activeDeckIds
      .filter((other) => other !== deckId)
      .every((other) => upper < ratings[other].value - 1.96 * ratings[other].se);
    if (isBehindAll) flagged.push(deckId);
  }

  return flagged;
}

export function suggestMatchups(fit, activePlayerIds, activeDeckIds, topN = 3) {
  const candidates = [];

  for (let i = 0; i < activePlayerIds.length; i++) {
    for (let j = i + 1; j < activePlayerIds.length; j++) {
      const playerA = activePlayerIds[i];
      const playerB = activePlayerIds[j];
      for (const deckA of activeDeckIds) {
        for (const deckB of activeDeckIds) {
          const x = buildDesignRow(playerA, deckA, playerB, deckB, fit.playerIndex, fit.deckIndex, fit.numFree);
          const p = predictWinProbability(fit, playerA, deckA, playerB, deckB);
          const w = p * (1 - p);
          const gain = shermanMorrisonGain(fit.cov, x, w);
          candidates.push({ playerA, deckA, playerB, deckB, predictedWinProbA: p, gain });
        }
      }
    }
  }

  candidates.sort((a, b) => b.gain - a.gain);
  return candidates.slice(0, topN);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/recommendations.test.js`
Expected: PASS — prints `OK: recommendations.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/recommendations.js tests/recommendations.test.js
git commit -m "Add weak-deck flagging and information-gain matchup suggestions"
```

---

### Task 7: Data loading

**Files:**
- Create: `src/data.js`

**Interfaces:**
- Produces: `loadLeagueData(baseUrl = 'data/'): Promise<{ players: Array, decks: Array, matches: Array }>`. Consumed by Task 9 (`main.js`). Browser-only (`fetch`); verified manually in Task 9, not unit tested here.

- [ ] **Step 1: Write `src/data.js`**

```js
export async function loadLeagueData(baseUrl = 'data/') {
  const [players, decks, matches] = await Promise.all([
    fetch(`${baseUrl}players.json`).then((r) => r.json()),
    fetch(`${baseUrl}decks.json`).then((r) => r.json()),
    fetch(`${baseUrl}matches.json`).then((r) => r.json()),
  ]);
  return { players, decks, matches };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data.js
git commit -m "Add league data loading"
```

---

### Task 8: HTML rendering

**Files:**
- Create: `src/render.js`
- Test: `tests/render.test.js`
- Modify: `tailwind.config.js` (add a `tv` breakpoint for large-screen/10-foot viewing)
- Modify: `index.html` (apply base Tailwind styling plus `tv:` variants to the structural elements from Task 1, so the page reads well on phone/tablet/PC and scales up on a TV)

**Interfaces:**
- Produces:
  - `renderLeaderboardHTML(title: string, entries: Array<{id, name, value, se?}>, colorFor?: (id: string) => string|null): string` — when `se` (an already Elo-scaled standard error — the caller, Task 9's `main.js`, is responsible for scaling it) is present on an entry, the rendered row shows a 95% confidence range (`value ± 1.96·se`, rounded) alongside the rating, so a wildly uncertain rating (e.g. a player or deck with almost no data, or with no deck-swapping ever recorded — see the design spec's identifiability caveat) doesn't look as trustworthy as a well-established one. When `se` is omitted, the row renders exactly as before (no range shown) — this keeps the function backward-compatible with any caller that doesn't have an `se` to give it.
  - `renderHeadToHeadHTML(title: string, ids: string[], namesById: {[id]: string}, matches: Array, field: 'player'|'deck'): string`
  - `renderMatchHistoryHTML(matches: Array, playersById: {[id]: string}, decksById: {[id]: string}): string`
  - `renderWeakDeckBannersHTML(flaggedDeckIds: string[], decksById: {[id]: string}): string`
  - `renderSuggestionsPanelHTML(suggestions: Array, playersById: {[id]: string}, decksById: {[id]: string}): string`
  - `getTypeColor(deckId: string): string|null` — looks up a fixed type-color accent (fire/water/grass/electric) for the spec's "type-color accents" visual style; returns `null` for unrecognized ids (e.g. future non-elemental deck names), which `renderLeaderboardHTML` treats as "no accent."

  All pure functions returning HTML strings (no DOM access), so they're testable with plain string assertions in Node. Consumed by Task 9 (`main.js`), which assigns the returned strings to `element.innerHTML` and passes `getTypeColor` as the deck leaderboard's `colorFor`.

- [ ] **Step 1: Add a `tv` breakpoint and apply responsive classes to `index.html`**

Add a custom large-screen breakpoint to `tailwind.config.js` (`min-width: 1920px`), layered on top of Tailwind's default breakpoints via `extend` so `sm`/`md`/`lg`/`xl`/`2xl` are untouched:

```js
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: { display: ['"Baloo 2"', 'cursive'] },
      colors: {
        typeFire: '#f87171',
        typeWater: '#60a5fa',
        typeGrass: '#4ade80',
        typeElectric: '#facc15',
      },
      screens: {
        tv: '1920px',
      },
    },
  },
  plugins: [],
};
```

Update `index.html`'s `<body>`, `<h1>`, and the two chart `<canvas>` elements to scale up at the `tv` breakpoint (the mobile/tablet/PC layout is unchanged — `tv:` classes only take effect above 1920px):

```html
<body class="bg-slate-50 text-slate-900 font-display p-6 max-w-4xl mx-auto space-y-8 tv:max-w-7xl tv:p-12 tv:space-y-12 tv:text-2xl">
  <h1 class="text-3xl font-bold tv:text-6xl">Pokémon TCG Family League</h1>

  <div id="weak-deck-banners"></div>
  <div id="suggestions-panel"></div>

  <div id="player-leaderboard"></div>
  <canvas id="player-rating-chart" class="bg-white rounded p-2 tv:p-4"></canvas>
  <div id="player-head-to-head"></div>

  <div id="deck-leaderboard"></div>
  <canvas id="deck-rating-chart" class="bg-white rounded p-2 tv:p-4"></canvas>
  <div id="deck-head-to-head"></div>

  <div id="match-history"></div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script type="module" src="src/main.js"></script>
</body>
```

Only the `<body>` and `<h1>` opening tags and the two `<canvas>` tags change — leave `<head>` and the rest of the file from Task 1 as-is.

Rebuild the CSS so the new breakpoint and classes are actually compiled in:

```bash
npm run build:css
```

Expected: `tailwind.css` is regenerated (check `git diff --stat tailwind.css` shows it changed).

- [ ] **Step 2: Write the failing test**

Create `tests/render.test.js`:

```js
import assert from 'node:assert/strict';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderSuggestionsPanelHTML,
  getTypeColor,
} from '../src/render.js';

const leaderboardHTML = renderLeaderboardHTML('Players', [
  { id: 'A', name: 'Alice', value: 1050 },
  { id: 'B', name: 'Bob', value: 950 },
]);
assert.ok(leaderboardHTML.indexOf('Alice') < leaderboardHTML.indexOf('Bob'));
assert.ok(leaderboardHTML.includes('1050'));
assert.ok(!leaderboardHTML.includes('border-left'), 'no colorFor given -> no accent styling');
assert.ok(!leaderboardHTML.includes('±'), 'no se given -> no confidence range shown');

const leaderboardWithSeHTML = renderLeaderboardHTML('Players', [
  { id: 'A', name: 'Alice', value: 1050, se: 60 },
]);
assert.ok(leaderboardWithSeHTML.includes('±118'), 'se=60 -> 95% range is ±round(1.96*60)=±118');

const deckLeaderboardHTML = renderLeaderboardHTML(
  'Decks',
  [{ id: 'fire', name: 'Fire', value: 1010 }],
  getTypeColor
);
assert.ok(deckLeaderboardHTML.includes('border-left'));
assert.equal(getTypeColor('fire'), '#f87171');
assert.equal(getTypeColor('unknown-deck'), null);

const matches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'B', date: '2026-01-02' },
];
const namesById = { A: 'Alice', B: 'Bob', x: 'Fire', y: 'Water' };

const headToHeadHTML = renderHeadToHeadHTML('Player H2H', ['A', 'B'], namesById, matches, 'player');
assert.ok(headToHeadHTML.includes('Alice'));
assert.ok(headToHeadHTML.includes('Bob'));

const deckHeadToHeadHTML = renderHeadToHeadHTML('Deck H2H', ['x', 'y'], namesById, matches, 'deck');
assert.ok(deckHeadToHeadHTML.includes('Fire'));
assert.ok(deckHeadToHeadHTML.includes('Water'));

const historyHTML = renderMatchHistoryHTML(matches, namesById, namesById);
assert.ok(historyHTML.indexOf('2026-01-02') < historyHTML.indexOf('2026-01-01'), 'newest match should appear first');

assert.equal(renderWeakDeckBannersHTML([], namesById), '');
const bannerHTML = renderWeakDeckBannersHTML(['y'], namesById);
assert.ok(bannerHTML.includes('Water'));
assert.ok(bannerHTML.includes('rebuild'));

const suggestionsHTML = renderSuggestionsPanelHTML(
  [{ playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.6, gain: 1 }],
  namesById,
  namesById
);
assert.ok(suggestionsHTML.includes('Alice'));
assert.ok(suggestionsHTML.includes('60%'));

console.log('OK: render.test.js');
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node tests/render.test.js`
Expected: FAIL — `Cannot find module '../src/render.js'`.

- [ ] **Step 4: Write `src/render.js`**

Shared Tailwind class fragments keep every section visually consistent and
responsive (base mobile/tablet/PC classes plus `tv:` variants for large
screens, per the breakpoint added in Step 1):

```js
const TYPE_COLORS = {
  fire: '#f87171',
  electric: '#facc15',
  fighting: '#ea580c',
  darkness: '#44403c',
};

const SECTION_CLASS = 'mb-6 tv:mb-10';
const HEADING_CLASS = 'text-xl font-semibold mb-2 tv:text-4xl tv:mb-4';
const TABLE_CLASS = 'w-full text-left border-collapse tv:text-2xl';
const CELL_CLASS = 'p-2 border-b border-slate-200 tv:p-4';

export function getTypeColor(deckId) {
  return TYPE_COLORS[deckId] || null;
}

export function renderLeaderboardHTML(title, entries, colorFor = () => null) {
  const rows = entries
    .map((e, i) => {
      const color = colorFor(e.id);
      const style = color ? ` style="border-left: 4px solid ${color}"` : '';
      const range = e.se !== undefined ? ` <span class="text-slate-500 text-sm tv:text-xl">(±${Math.round(1.96 * e.se)})</span>` : '';
      return `<tr${style}><td class="${CELL_CLASS}">${i + 1}</td><td class="${CELL_CLASS}">${e.name}</td><td class="${CELL_CLASS}">${Math.round(e.value)}${range}</td></tr>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">${title}</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">#</th><th class="${CELL_CLASS}">Name</th><th class="${CELL_CLASS}">Rating</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderHeadToHeadHTML(title, ids, namesById, matches, field) {
  const wins = new Map();
  const key = (a, b) => `${a}|${b}`;

  for (const m of matches) {
    if (field === 'player') {
      const winnerId = m.winner;
      const loserId = winnerId === m.player1 ? m.player2 : m.player1;
      wins.set(key(winnerId, loserId), (wins.get(key(winnerId, loserId)) || 0) + 1);
    } else {
      const winningDeck = m.winner === m.player1 ? m.deck1 : m.deck2;
      const losingDeck = winningDeck === m.deck1 ? m.deck2 : m.deck1;
      wins.set(key(winningDeck, losingDeck), (wins.get(key(winningDeck, losingDeck)) || 0) + 1);
    }
  }

  const header = `<tr><th class="${CELL_CLASS}"></th>${ids.map((id) => `<th class="${CELL_CLASS}">${namesById[id]}</th>`).join('')}</tr>`;
  const rows = ids
    .map((rowId) => {
      const cells = ids
        .map((colId) => (rowId === colId ? '—' : String(wins.get(key(rowId, colId)) || 0)))
        .map((v) => `<td class="${CELL_CLASS}">${v}</td>`)
        .join('');
      return `<tr><th class="${CELL_CLASS}">${namesById[rowId]}</th>${cells}</tr>`;
    })
    .join('');

  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">${title}</h2><table class="${TABLE_CLASS}"><thead>${header}</thead><tbody>${rows}</tbody></table></section>`;
}

export function renderMatchHistoryHTML(matches, playersById, decksById) {
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted
    .map((m) => {
      const p1 = `${playersById[m.player1]} (${decksById[m.deck1]})`;
      const p2 = `${playersById[m.player2]} (${decksById[m.deck2]})`;
      return `<tr><td class="${CELL_CLASS}">${m.date}</td><td class="${CELL_CLASS}">${p1}</td><td class="${CELL_CLASS}">${p2}</td><td class="${CELL_CLASS}">${playersById[m.winner]}</td></tr>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Match History</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">Date</th><th class="${CELL_CLASS}">Player 1</th><th class="${CELL_CLASS}">Player 2</th><th class="${CELL_CLASS}">Winner</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderWeakDeckBannersHTML(flaggedDeckIds, decksById) {
  if (flaggedDeckIds.length === 0) return '';
  const items = flaggedDeckIds
    .map((id) => `<li class="p-2 tv:p-4 tv:text-2xl">⚠️ ${decksById[id]} — significantly behind, consider a rebuild</li>`)
    .join('');
  return `<ul class="weak-deck-banners bg-amber-100 rounded mb-4 tv:mb-8">${items}</ul>`;
}

export function renderSuggestionsPanelHTML(suggestions, playersById, decksById) {
  const items = suggestions
    .map((s) => {
      const pct = Math.round(s.predictedWinProbA * 100);
      return `<li class="${CELL_CLASS}">${playersById[s.playerA]} (${decksById[s.deckA]}) vs ${playersById[s.playerB]} (${decksById[s.deckB]}) — predicted ${pct}% / ${100 - pct}%</li>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Try This Next</h2><ol class="${TABLE_CLASS}">${items}</ol></section>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/render.test.js`
Expected: PASS — prints `OK: render.test.js`.

- [ ] **Step 6: Commit**

```bash
git add src/render.js tests/render.test.js tailwind.config.js index.html tailwind.css
git commit -m "Add HTML rendering with responsive/TV styling for leaderboards, head-to-head, and recommendations"
```

---

### Task 9: Rating charts, main wiring, manual verification

**Files:**
- Create: `src/charts.js`
- Test: `tests/charts.test.js`
- Create: `src/main.js`
- Modify: `src/bradley-terry.js` (export the Elo scale factor, `ELO_SCALE`, so `main.js` can scale standard errors into the same units as `toEloScale`'s ratings, for the leaderboard confidence range)

**Interfaces:**
- Consumes: everything from Tasks 4–8 (`loadLeagueData`, `fitBradleyTerry`, `meanCenteredRatings`, `toEloScale`, `ELO_SCALE`, `computeRatingHistory`, `flagWeakDecks`, `suggestMatchups`, all `render*HTML` functions), and the DOM element ids from Task 1's `index.html`.
- Produces: `buildChartDatasets(history, ids, namesById, family): { labels: string[], datasets: Array<{label, data}> }` (pure, tested); `renderRatingChart(canvas, chartData)` (thin `Chart.js` wrapper, browser-only, not unit tested); the page's `main()` entry point wired to `DOMContentLoaded`.

- [ ] **Step 1: Write the failing test for the pure chart-data transform**

Create `tests/charts.test.js`:

```js
import assert from 'node:assert/strict';
import { buildChartDatasets } from '../src/charts.js';

const history = [
  { date: '2026-01-01', playerRatings: { A: 1010, B: 990 }, deckRatings: { x: 1005, y: 995 } },
  { date: '2026-01-02', playerRatings: { A: 1020, B: 980 }, deckRatings: { x: 1010, y: 990 } },
];

const playerData = buildChartDatasets(history, ['A', 'B'], { A: 'Alice', B: 'Bob' }, 'player');
assert.deepEqual(playerData.labels, ['2026-01-01', '2026-01-02']);
assert.equal(playerData.datasets.length, 2);
assert.equal(playerData.datasets[0].label, 'Alice');
assert.deepEqual(playerData.datasets[0].data, [1010, 1020]);

const deckData = buildChartDatasets(history, ['x', 'y'], { x: 'Fire', y: 'Water' }, 'deck');
assert.equal(deckData.datasets[1].label, 'Water');
assert.deepEqual(deckData.datasets[1].data, [995, 990]);

console.log('OK: charts.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/charts.test.js`
Expected: FAIL — `Cannot find module '../src/charts.js'`.

- [ ] **Step 3: Write `src/charts.js`**

```js
export function buildChartDatasets(history, ids, namesById, family) {
  const labels = history.map((snapshot) => snapshot.date);
  const datasets = ids.map((id) => ({
    label: namesById[id],
    data: history.map((snapshot) => (family === 'player' ? snapshot.playerRatings[id] : snapshot.deckRatings[id])),
  }));
  return { labels, datasets };
}

export function renderRatingChart(canvas, chartData) {
  return new Chart(canvas, {
    type: 'line',
    data: chartData,
    options: { responsive: true },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/charts.test.js`
Expected: PASS — prints `OK: charts.test.js`. (`renderRatingChart` is not covered — it needs the `Chart` global and a real `<canvas>`, verified manually in Step 7 below.)

- [ ] **Step 5: Export `ELO_SCALE` from `src/bradley-terry.js`**

`toEloScale` already embeds the scale factor inline. Pull it out to a named
constant and reuse it, without changing `toEloScale`'s existing behavior or
signature:

```js
export const ELO_SCALE = 400 / Math.LN10;

export function toEloScale(value) {
  return 1000 + value * ELO_SCALE;
}
```

This replaces the existing `toEloScale` function body in `src/bradley-terry.js` (from Task 4) — every other export in that file is untouched. Run `node tests/bradley-terry.test.js` to confirm the existing `toEloScale(0) === 1000` assertion still passes.

- [ ] **Step 6: Write `src/main.js`**

```js
import { loadLeagueData } from './data.js';
import { fitBradleyTerry, meanCenteredRatings, toEloScale, ELO_SCALE } from './bradley-terry.js';
import { computeRatingHistory } from './history.js';
import { flagWeakDecks, suggestMatchups } from './recommendations.js';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderSuggestionsPanelHTML,
  getTypeColor,
} from './render.js';
import { buildChartDatasets, renderRatingChart } from './charts.js';

async function main() {
  const { players, decks, matches } = await loadLeagueData();
  const playerIds = players.map((p) => p.id);
  const activeDecks = decks.filter((d) => !d.retired);
  const deckIds = activeDecks.map((d) => d.id);
  const namesById = {
    ...Object.fromEntries(players.map((p) => [p.id, p.name])),
    ...Object.fromEntries(decks.map((d) => [d.id, d.name])),
  };

  const fit = fitBradleyTerry(matches, playerIds, deckIds);
  const playerRatings = meanCenteredRatings(fit, 'player', playerIds);
  const deckRatings = meanCenteredRatings(fit, 'deck', deckIds);

  const playerEntries = playerIds
    .map((id) => ({
      id,
      name: namesById[id],
      value: toEloScale(playerRatings[id].value),
      se: playerRatings[id].se * ELO_SCALE,
    }))
    .sort((a, b) => b.value - a.value);
  const deckEntries = deckIds
    .map((id) => ({
      id,
      name: namesById[id],
      value: toEloScale(deckRatings[id].value),
      se: deckRatings[id].se * ELO_SCALE,
    }))
    .sort((a, b) => b.value - a.value);

  document.getElementById('player-leaderboard').innerHTML = renderLeaderboardHTML('Players', playerEntries);
  document.getElementById('deck-leaderboard').innerHTML = renderLeaderboardHTML('Decks', deckEntries, getTypeColor);
  document.getElementById('player-head-to-head').innerHTML =
    renderHeadToHeadHTML('Player Head-to-Head', playerIds, namesById, matches, 'player');
  document.getElementById('deck-head-to-head').innerHTML =
    renderHeadToHeadHTML('Deck Head-to-Head', deckIds, namesById, matches, 'deck');
  document.getElementById('match-history').innerHTML = renderMatchHistoryHTML(matches, namesById, namesById);

  const flagged = flagWeakDecks(fit, deckIds, matches);
  document.getElementById('weak-deck-banners').innerHTML = renderWeakDeckBannersHTML(flagged, namesById);

  const suggestions = suggestMatchups(fit, playerIds, deckIds);
  document.getElementById('suggestions-panel').innerHTML =
    renderSuggestionsPanelHTML(suggestions, namesById, namesById);

  const history = computeRatingHistory(matches, playerIds, deckIds);
  renderRatingChart(document.getElementById('player-rating-chart'), buildChartDatasets(history, playerIds, namesById, 'player'));
  renderRatingChart(document.getElementById('deck-rating-chart'), buildChartDatasets(history, deckIds, namesById, 'deck'));
}

document.addEventListener('DOMContentLoaded', main);
```

- [ ] **Step 7: Commit**

```bash
git add src/bradley-terry.js src/charts.js tests/charts.test.js src/main.js
git commit -m "Wire up rating charts and page bootstrap"
```

- [ ] **Step 8: Manually verify the full page with sample data**

Temporarily replace the contents of `data/matches.json` with sample data (do **not** commit this — it's for local verification only). Deck ids must match `data/decks.json` (Task 2): `fire` (J's default), `electric` (M's default), `fighting` (T's default), `darkness` (C's default):

```json
[
  { "player1": "M", "deck1": "electric", "player2": "T", "deck2": "fighting", "winner": "M", "date": "2026-09-01" },
  { "player1": "C", "deck1": "darkness", "player2": "J", "deck2": "fire", "winner": "J", "date": "2026-09-02" },
  { "player1": "M", "deck1": "electric", "player2": "C", "deck2": "darkness", "winner": "M", "date": "2026-09-03" },
  { "player1": "T", "deck1": "fighting", "player2": "J", "deck2": "fire", "winner": "T", "date": "2026-09-04" }
]
```

Then serve the directory and open it in a browser:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` and confirm:
- No errors in the browser console.
- Player and deck leaderboards render with 4 rows each, each rating showing a `(±...)` confidence range next to it.
- Both rating-history line charts render with visible lines.
- Both head-to-head grids render.
- The match history table lists all 4 sample matches, newest first.
- The suggestions panel shows 3 candidate matchups.
- Resize the browser window (or use dev tools device emulation) to a phone width (~375px) and confirm the layout stays usable (no horizontal overflow, text readable).
- Use dev tools to emulate a viewport ≥1920px wide (the `tv` breakpoint) and confirm the heading, body text, and table text visibly scale up.

Then revert `data/matches.json` back to `[]`:

```bash
git checkout -- data/matches.json
```

Expected: `git status` shows no pending changes to `data/matches.json` (it's back to the committed empty array — the site ships with a genuinely fresh start, per the spec).

---

### Task 10: Deploy to GitHub Pages

**Files:**
- No new files — this task pushes the existing commits and configures GitHub Pages.

**Interfaces:** none (deployment task).

- [ ] **Step 1: Run the full test suite one more time**

```bash
npm test
```

Expected: all six test files print their `OK:` line, exit code 0.

- [ ] **Step 2: Confirm with the user before pushing**

This is the point where local commits become visible on the shared GitHub repo and GitHub Pages goes live at a public URL. Confirm with the user before proceeding, per the pushing-to-shared-state guidance — do not push automatically as part of running this plan.

- [ ] **Step 3: Push to the remote**

```bash
git push -u origin main
```

Expected: `main` branch now visible at `https://github.com/JonasHelming/pokemom-league`.

- [ ] **Step 4: Enable GitHub Pages from the `main` branch root**

```bash
gh api -X POST repos/JonasHelming/pokemom-league/pages -f "source[branch]=main" -f "source[path]=/"
```

If this fails (e.g. insufficient token scope), fall back to the manual path: on GitHub, go to **Settings → Pages**, set **Source** to **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.

- [ ] **Step 5: Verify the live site**

```bash
gh api repos/JonasHelming/pokemom-league/pages --jq .html_url
```

Open the returned URL and confirm the page loads with an empty match history (fresh start) and all four players/decks listed on the leaderboards with a neutral 1000 rating.

---

## Post-launch revision: recommendation tuning (2026-09-20)

After deploying with real match data, two changes were made to
`src/recommendations.js`, based on actual observed behavior and family
feedback. The code in this file, not the Task 6 section above, is the
source of truth for its current behavior — Task 6's TDD narrative above
reflects what was originally built, not the current tuning.

**1. `flagWeakDecks` defaults loosened.** Originally `minMatches = 8` and a
95% confidence level (`1.96·SE`). Live data showed this is appropriately
conservative but too slow to ever suggest a rebuild for a fun family
signal — the family chose `minMatches = 5` and ~80% confidence
(`confidenceZ = 1.28`, now a named parameter instead of a hardcoded `1.96`)
as a "not bullshit, but responsive enough to be useful" balance. Verified
numerically: at n=10 this fixture's required gap sits between the two
thresholds (flags at 1.28, would not flag at 1.96) — a real, load-bearing
distinction, not a coincidence of the fixture's small-n fragility (the
match-count floor and the confidence-level change are tested separately,
each isolated by varying only the one parameter under test against the
same fit; see `tests/recommendations.test.js`). The weak-deck banner text
now says "significantly behind by the family's own confidence threshold"
(deliberately not citing a specific percentage — the true joint confidence
of "beats every other deck" isn't simply 80% even though each pairwise
comparison uses an 80% interval) so it doesn't visually contradict the
leaderboard's separate, unrelated 95% display range.

**2. `suggestMatchups` redesigned from "top-3 by pure information gain" to
"one suggestion per unique player pair, preferring a competitive option."**
Two problems prompted this: (a) a flat top-N list could show multiple
suggestions for the same pair while never mentioning another pair at all,
useless for "two specific people want to play, what should they use"; (b)
pure information-gain suggestions from live data turned out to strongly
favor matchups involving whichever player/deck has the least data, and
those often *look* like confident blowouts even though the prediction
itself is unreliable precisely because there's so little data — not fun
matches to actually sit down and play.

A first attempt tried blending information-gain with a closeness-to-50%
factor multiplicatively (`log1p(gain) * (0.15 + 0.85 * closeness(p))`).
Code review caught that this doesn't actually work: gain spans many orders
of magnitude (0.36 to 166,000+ on live data), which any multiplicative
closeness factor in a bounded [0.15, 1] range is too weak to overcome — on
live data, a genuinely close 66.7%-predicted rematch (T vs J, already
played several times) still lost to a 0.9%-predicted near-blowout (same
pair, a far less-tested deck), the exact symptom the redesign was meant to
fix. The actual fix, `selectBestCandidate` in `src/recommendations.js`: per
pair, filter candidates to those within 35 points of 50/50 (a predicted win
probability between 15% and 85%, i.e. `closeness(p) >= COMPETITIVE_CLOSENESS_THRESHOLD = 0.3`
— note the threshold is a *closeness* value, not directly a probability
distance, and an earlier version of this comment and the spec incorrectly
described the resulting band as "30 points"/35%-65%, since fixed and pinned
with a boundary test); if any exist, pick the highest-gain one among
*those*; only if none exist does it fall back to the single highest-gain
candidate overall. Verified this threshold isn't a fragile knife-edge (0.2
through 0.5 all produce identical picks on live data), and verified the fix
directly resolves the T-vs-J case (now correctly recommends the 66.7%
option). `selectBestCandidate` is exported and unit-tested directly with
fabricated `{predictedWinProbA, gain}` objects — deliberately not through
another hand-tuned Bradley-Terry fixture, given this file's history of
fixture-fragility bugs — including a test pinning the exact 15%/85%
boundary, and throws on an empty candidate list rather than silently
returning a garbage object (`suggestMatchups` guards every call site so
this is unreachable in production). Mirror matchups (`deckA === deckB`)
are now excluded from candidates entirely, and each pair's chosen
suggestion carries a `competitiveMatchAvailable` boolean. The final list
still returns one entry per pair — for n active players, n·(n−1)/2
suggestions (6 for the family's 4 players) — sorted with pairs that had a
genuinely competitive option first, then by information gain within each
group (not by information gain alone, and not truncated to a top-3), so
the panel leads with fun games to actually play.

`renderSuggestionsPanelHTML`'s heading was updated from "Try This Next" to
"Best Deck Matchup For Each Pair" to match.
