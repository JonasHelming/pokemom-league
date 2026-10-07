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
1b. Reports often use first names rather than ids. Known so far:
   **Mattis → `M`**, **Theo → `T`**. `C` and `J` haven't been given by
   name yet — ask the first time one shows up, then add it here. A name
   that matches no id may well be a guest rather than a typo for an
   existing player, so confirm instead of assuming (adding a guest means
   a new entry in `data/players.json` first).
2. If a player's deck isn't mentioned, use their `defaultDeck` from
   `data/players.json` — don't guess a different deck.
2b. Decks get rebuilt, and a rebuilt version gets a new id (`fighting` →
   `fighting-2`) while the old one is marked `retired: true` in
   `data/decks.json`. A deck named without a version suffix — in German or
   English, e.g. "Kampf", "fighting" — always means the **currently active
   version** of that lineage, so "Kampf" means `fighting-2` once the rebuild
   is recorded. Look the current id up in `data/decks.json` rather than
   assuming; see the table in `data/README.md`. Use an older id only when
   the report explicitly backdates to before that rebuild.
3. If a report says a player used a deck other than their default (e.g.
   borrowing another player's deck), use the deck actually stated, not the
   default.
4. Every entry appended to `data/matches.json` must be fully explicit:
   `{ player1, deck1, player2, deck2, winner, date }`, where `winner` is the
   winning player's `id` and `date` is `"YYYY-MM-DD"`.
5. If no date is given, use today's date. Don't ask — this is a standing
   instruction from the user (2026-10-05), who reports results the same day
   they're played. Only use a different date when the report says so
   ("gestern", "am Freitag", an explicit date), and still ask if a report
   names a date you can't resolve to a specific day.
6. If a report is ambiguous (unclear handwriting, an unclear player
   reference, an unclear winner), confirm your reading with the user before
   writing anything — a wrong guess corrupts the rating history for
   everyone, and it's cheap to just ask.
7. Append the new matches to the existing array (don't reorder or rewrite
   existing entries), verify the file still parses as JSON, and commit.
