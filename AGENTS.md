# AGENTS.md — Pokémon TCG Family League

This repo is a static site tracking an informal family Pokémon TCG league
(players: M, T, C, J). See `docs/superpowers/specs/` for the full design and
`docs/superpowers/plans/` for the implementation plan. `data/README.md`
documents the match data schema.

## Handling match data dropped in chat

Family members usually report results casually — a text message, a photo of
handwritten notes, a one-line summary — rather than editing
`data/matches.json` directly. When a match report shows up in conversation:

1. Identify each match: who played (player ids `M`, `T`, `C`, `J`), which
   decks were used, and who won.
2. If a player's deck isn't mentioned, use their `defaultDeck` from
   `data/players.json` — don't guess a different deck.
3. If a report says a player used a deck other than their default (e.g.
   borrowing another player's deck), use the deck actually stated, not the
   default.
4. Every entry appended to `data/matches.json` must be fully explicit:
   `{ player1, deck1, player2, deck2, winner, date }`, where `winner` is the
   winning player's `id` and `date` is `"YYYY-MM-DD"`.
5. If no date is given, ask what date to use rather than silently assuming
   one — unless the user has already said to use a specific date (e.g.
   "today") for the whole batch.
6. If a report is ambiguous (unclear handwriting, an unclear player
   reference, an unclear winner), confirm your reading with the user before
   writing anything — a wrong guess corrupts the rating history for
   everyone, and it's cheap to just ask.
7. Append the new matches to the existing array (don't reorder or rewrite
   existing entries), verify the file still parses as JSON, and commit.
