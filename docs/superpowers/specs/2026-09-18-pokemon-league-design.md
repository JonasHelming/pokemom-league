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
- `data/decks.json` — `[{ id, name, owner }]` (owner = player id who
  normally plays it; decks can still be borrowed by others in a match)
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

## Views

Full parity between players and decks:

- **Player leaderboard** — ranked by fitted player skill
- **Player rating history chart** — skill over time, one line per player
- **Player head-to-head grid** — win/loss record for each pair
- **Deck leaderboard** — ranked by fitted deck strength
- **Deck rating history chart** — strength over time, one line per deck
- **Deck head-to-head grid** — win/loss record for each deck pair
- **Match history table** — shared, chronological, shows both
  player+deck pairs and the winner

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
synthetic match history must recover a clear skill ordering), run in the
browser console during development.
