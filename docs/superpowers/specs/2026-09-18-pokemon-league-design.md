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

This is a two-factor Bradley-Terry model, fit via Newton-Raphson (iteratively
reweighted least squares) over the full match history entirely client-side
(cheap at this data scale — a few hundred matches at most, converging in a
handful of iterations). Newton-Raphson is used instead of plain gradient
descent because it converges quickly for this kind of concave likelihood and
produces the Hessian as a byproduct — which is exactly the Fisher information
matrix the confidence-interval and matchup-suggestion features below need
anyway. It separates "is this player good" from "is this
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
  values), giving a confidence interval per deck (`strength ± z·SE`). Both
  the confidence level and the minimum match count are deliberately tuned
  looser than a "textbook" 95%/large-n threshold, since this is a fun family
  signal for deciding when to order new cards, not a scientific claim — the
  family chose **80% confidence** (`z ≈ 1.28`) and a **minimum of 5 matches**
  as a good "not bullshit, but responsive enough to actually be useful"
  balance. Both are named constants in `src/recommendations.js`, easy to
  retune later if they turn out too trigger-happy or too quiet.
- **Flagging rule**: an active (non-retired) deck is flagged as
  "significantly behind" only when both hold:
  1. it has at least the minimum number of recorded matches, and
  2. its CI upper bound is below the CI lower bound of *every other*
     active deck.
  Requiring separation from the entire field, not just the nearest
  competitor, keeps this reasonably conservative even at a lower confidence
  level, avoiding flagging decks on truly thin, noisy data.
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

## "Best matchup per pair" suggestions

Beyond flagging weak decks, the site suggests which deck each player should
use, for every possible pairing of two players — reusing the same Fisher
information matrix computed for the confidence-interval feature above, so
this is additive machinery, not a separate system.

Two people deciding to play already know *who* is playing; what they don't
know is which decks make for the most worthwhile game. So rather than a
flat top-N list (which could repeat one pair's suggestion three times while
never mentioning another pair at all), the site guarantees exactly one
recommendation per unique player pair with at least 2 active decks to
choose from — for 4 players and 4 decks, that's 6 suggestions, covering
every possible pairing. (With fewer than 2 active decks there are no
non-mirror deck combinations to recommend, so the panel would have nothing
to say — not a realistic case at family scale.)

- For each player pair, compute statistical information-gain (the Fisher
  information contribution of that hypothetical match, an exact
  Sherman-Morrison variance-reduction calculation) and predicted win
  probability for every active-deck combination that pair could play
  (mirror matchups, the same deck on both sides, are excluded — not
  practically meaningful advice). Pure information-gain alone tends to
  surface lopsided-looking matchups involving whichever player/deck has the
  least data — a nearly-untested entity's point estimate is unreliable and
  often looks like a near-certain blowout even though it isn't really
  predictable, so a **genuinely competitive candidate (within 35 points of
  a 50/50 predicted outcome, i.e. a predicted win probability between 15%
  and 85%) is preferred over a merely informative one**; information gain
  still breaks ties among competitive candidates, and only when *no*
  competitive option exists for that pair does it fall back to the most
  informative (possibly lopsided) one. Verified on live match data: this
  fixed a real case where a genuinely close 66.7%-predicted rematch lost to
  a 0.9%-predicted blowout under a pure info-gain or naively-blended score,
  purely because the blowout involved a far less-tested deck.
- The chosen deck combination for each pair is kept; the six (or
  n·(n−1)/2, for n active players) results are all shown — not truncated to
  a top-3 — sorted with pairs that had a genuinely competitive option first,
  then by information gain within each group, so the panel leads with fun
  games to actually play rather than a high-information but predictable one.
- Candidate matchups are enumerated over active decks only (retired
  versions excluded) — at family scale this is a small, trivial-to-rank
  client-side computation.
- **Surfacing**: a panel ("Best Deck Matchup For Each Pair") shown on the
  homepage, recomputed every time ratings are refit. Purely a suggestion —
  no tracking of whether it was acted on.

## Practical fairness: deck + default owner

A deck's own isolated strength (the rating model above) is deliberately
skill-controlled — the whole point of the joint model is to answer "is this
deck inherently weak" independent of who's holding it. But most games are
actually played with default decks, so there's a second, genuinely
different question worth answering: "is the league fair *in practice*,
given who normally plays what?" A deck's isolated rating can look
perfectly fine while its usual owner still consistently over- or
under-performs everyone else once their own skill is folded back in.

- **Combined rating**: for a given player and deck, the two mean-centered
  effects (player skill + deck strength, each centered against its own
  family's average) are summed to give "this specific player+deck combo,
  relative to an average player playing an average deck." This is not
  claimed to always have a tighter confidence interval than the deck's
  isolated rating — whether it does depends on the covariance between the
  player and deck estimates, which isn't fixed once there's any
  deck-swapping in the data (verified: on live data, some decks' combined
  ranges come out *wider* than their isolated ranges).
- **Display**: on the deck leaderboard, each deck's "as played by its
  default owner" combined rating is shown as the prominent number, with the
  deck's own isolated strength demoted to a smaller secondary annotation —
  since the combined number is what's actually relevant when everyone
  plays their default deck, which is the common case.
- **Fairness flag**: a player's own "default team" (them playing their own
  usual deck) is flagged — separately from the deck-rebuild banner — when
  it's significantly ahead of or behind *every other* player's default
  team, using the same confidence level and match-count floor as the
  deck-rebuild flag (family-chosen, not a rigorous claim — see Deck
  strength recommendations above). Match-count eligibility is counted per
  player, based only on matches where they actually played their own
  default deck (not a borrowed one) — a different count than the deck
  rebuild flag's per-deck match count. Both directions (a team dominating,
  a team struggling) are reported, since both are informative fairness
  signals.

## Views

Full parity between players and decks:

- **Player leaderboard** — ranked by fitted player skill, each rating shown
  alongside its 95% confidence range (`±1.96·SE`) so a rating backed by
  little data or by fully-confounded player/deck signal (see Rating model
  above) doesn't read as equally trustworthy as a well-established one
- **Player rating history chart** — skill over time, one line per player
- **Player head-to-head grid** — win/loss record for each pair
- **Deck leaderboard** — ranked by fitted deck strength, but the
  prominently-shown number per deck is its "as played by default owner"
  combined rating (see Practical fairness above), with the isolated deck
  strength shown as a smaller secondary annotation; a "consider a rebuild"
  banner appears on any deck flagged per the recommendation rule above, and
  a separate fairness banner appears for any player whose default team is
  a significant outlier in practice
- **Deck rating history chart** — strength over time, one line per deck
- **Deck head-to-head grid** — win/loss record for each deck pair
- **Match history table** — shared, chronological, shows both
  player+deck pairs and the winner
- **"Best Deck Matchup For Each Pair" panel** — one suggestion per unique
  player pair, per the section above

## Visual style

Pokémon-themed: Tailwind CSS utility classes, pokeball/type-color accents,
playful fonts. Only free, non-Nintendo-owned assets are used, since the repo
is public.

Responsive across phone, tablet, PC, and TV: the base layout uses Tailwind's
default breakpoints (works on phone/tablet/PC without any special handling),
plus a custom large-screen breakpoint (`tv`, `min-width: 1920px`) that scales
up font sizes, spacing, and chart sizing for 10-foot/across-the-room viewing,
layered on top of the same layout rather than a separate template.

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
