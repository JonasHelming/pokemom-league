# Pokémon TCG Family League — Design

## Overview

A static website, hosted on GitHub Pages, tracking an informal Pokémon TCG
league played within the family (4 players, ad-hoc pairings, no fixed
schedule). The site shows player and deck rankings computed from a plain-text
match log.

Players: **M**, **T**, **C**, **J**.

## Architecture

- Single static page: `index.html` + `app.js` + a compiled `tailwind.css`
  (Tailwind CLI run once during development, output committed to the repo —
  same approach as the user's existing `lebenimfasanenpark-website` site).
  No runtime build step; GitHub Pages serves the files as-is.
- Chart.js via CDN for rating-history charts.
- No backend, no npm runtime dependency, no server-side code.

## Data model

Plain JSON files under `data/`:

- `data/players.json` — `[{ id, name, defaultDeck }]`
- `data/decks.json` — `[{ id, name, owner, predecessor?, retired? }]`
  (owner = player id who normally plays it; decks can still be borrowed by
  others in a match). `predecessor` links a rebuilt deck to the version it
  replaced (e.g. `fire-1`'s predecessor is `fire`); `retired: true` marks a
  version as no longer in active play. Ratings are always computed per
  version — a rebuild does not carry over its predecessor's rating, since
  the whole point is to collect fresh data on the new build.
- `data/matches.json` — `[{ player1, deck1, player2, deck2, winner, date }]`
  Every match entry is fully explicit — deck fields are always filled in,
  even when a player used their own default deck. No inference happens in
  this file.
- `data/README.md` — documents the convention that when a match is reported
  by player names only ("M beat T"), the deck fields should be filled from
  each player's `defaultDeck` in `players.json` before the entry is
  committed. This lets a person or an AI agent append a correct, fully
  explicit entry from a casual one-line report.

## Rating model

Ratings are **not** two blind, independent Elo pools. Each match outcome is
explained by a joint model:

```
P(side A wins) = sigmoid((playerSkill_A + deckStrength_A) − (playerSkill_B + deckStrength_B))
```

This is a two-factor Bradley-Terry model, fit by gradient descent over the
full match history entirely client-side (cheap at this data scale — a few
hundred matches at most). It separates "is this player good" from "is this
deck good" — the more players borrow each other's decks, the sharper that
separation becomes. With zero deck-swapping the two signals are
statistically unidentifiable (collinear) and the model behaves close to
naive independent per-entity win rates; this is a property of the data, not
a limitation of the method.

Fitted skill/strength values are rescaled to an Elo-like display range
(starting around 1000, using the standard `400 / ln(10)` logistic scale
factor) purely for readability.

For rating-history charts, the model is refit on each successive
chronological prefix of matches, producing a rating snapshot per player/deck
at each point in the timeline.

## Deck strength recommendations & versioning

The joint model gives each deck a fitted strength *and* a standard error, not
just a point estimate — which is what makes a principled "this deck needs a
rebuild" recommendation possible instead of a gut call:

- **Confidence estimate**: standard errors come from the observed Fisher
  information (inverse Hessian of the joint log-likelihood at the fitted
  values), giving a 95% confidence interval per deck (`strength ± 1.96·SE`).
- **Flagging rule**: an active (non-retired) deck is flagged as
  "significantly behind" only when both hold:
  1. it has at least a minimum number of recorded matches (default: 8), and
  2. its 95% CI upper bound is below the 95% CI lower bound of *every other*
     active deck.
  Requiring separation from the entire field, not just the nearest
  competitor, keeps this conservative and avoids flagging decks on thin,
  noisy data.
- **Versioning on rebuild**: when a flagged deck is boosted/rebuilt, it gets
  a new id (e.g. `fire` → `fire-1`) with `predecessor: "fire"` and the old
  entry is marked `retired: true`. The new version starts with no match
  history and is rated independently, so it collects clean data on the
  rebuilt list rather than inheriting the old build's rating. The site can
  still show a deck's full lineage (e.g. `fire → fire-1 → fire-2`) by
  following `predecessor` links, purely as a historical view.
- **Surfacing**: purely informational — a small banner/callout next to a
  flagged deck on the deck leaderboard (e.g. "significantly behind — consider
  a rebuild"). No workflow, approval step, or state beyond what's already in
  `decks.json`.

## "Try this next" matchup suggestions

Beyond flagging weak decks, the site suggests which *untried or under-tried*
player+deck vs player+deck matchups would most improve confidence in the
ratings — reusing the same Fisher information matrix computed for the
confidence-interval feature above, so this is additive machinery, not a
separate system:

- For every plausible candidate matchup (a pair of players, each assigned
  any active deck — not necessarily their own default), estimate the
  information-gain it would contribute: the Fisher information contribution
  of a hypothetical match is proportional to `p·(1−p)` (using the model's
  current predicted win probability for that matchup) times the outer
  product of the two sides' parameter vectors. Matchups closest to a 50/50
  predicted outcome, and/or involving entities with the widest current
  confidence intervals, contribute the most information.
- This naturally favors exactly the matchups you'd intuitively want more
  data on: pairings that have never happened, and deck swaps in particular
  (since those are what separate player skill from deck strength — see
  Rating model above).
- Candidate matchups are enumerated over active decks only (retired
  versions excluded) — at family scale (4 players × a handful of decks)
  this is a few dozen combinations at most, trivial to rank client-side.
- **Surfacing**: a small "try this next" panel (top 3 suggested matchups,
  e.g. "J with C's deck vs T with T's deck") shown on the homepage,
  recomputed every time ratings are refit. Purely a suggestion — no
  tracking of whether it was acted on.

## Views

Full parity between players and decks:

- **Player leaderboard** — ranked by fitted player skill
- **Player rating history chart** — skill over time, one line per player
- **Player head-to-head grid** — win/loss record for each pair
- **Deck leaderboard** — ranked by fitted deck strength, with a "consider a
  rebuild" banner on any deck flagged per the recommendation rule below
- **Deck rating history chart** — strength over time, one line per deck
- **Deck head-to-head grid** — win/loss record for each deck pair
- **Match history table** — shared, chronological, shows both
  player+deck pairs and the winner
- **"Try this next" panel** — top 3 suggested matchups per the section above

## Visual style

Pokémon-themed: Tailwind CSS utility classes, pokeball/type-color accents,
playful fonts. Only free, non-Nintendo-owned assets are used, since the repo
is public.

## Data entry workflow

Matches are added by editing `data/matches.json` directly — either via a PR,
a direct commit, or (informally) by telling an AI agent the result in plain
language and having it look up defaults and commit the entry. No form, no
GitHub Action, no external service.

## Testing

No test framework, consistent with the no-build-step setup. Validation is a
handful of `console.assert` sanity checks on the rating fit (e.g. equal
skills and equal decks must yield a 50/50 expected outcome; a lopsided
synthetic match history must recover a clear skill ordering) and on the
confidence-interval flagging rule (e.g. a deck with few matches must never
be flagged regardless of how bad its point estimate looks; a deck with a
long, consistent losing record and a wide match count must be flagged) and
on the matchup-suggestion ranking (e.g. a never-played player/deck
combination must always outrank a heavily-played one, all else equal), run
in the browser console during development.
