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
