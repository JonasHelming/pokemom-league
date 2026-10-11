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
1b. Reports often use first names rather than player ids. **Never write a
   real name into this repo** — not here, not in `data/`, not in a commit
   message. The repo is public and GitHub Pages serves every file in it,
   including this one, so anything committed here is published. Player
   identity stays as the ids `M`, `T`, `C`, `J`; the name-to-id mapping
   lives only outside the repo. A name you can't resolve may be a guest
   rather than a typo, so ask rather than assume — and adding a guest
   means a new `data/players.json` entry using an initial, not a name.
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
8. Rewrite `data/report.json` in the same commit — see below. A match
   almost always invalidates a number the ticker is currently claiming,
   and a stale ticker publishes a falsehood.

## The Liga-Ticker (`data/report.json`)

A short German news report shown at the top of the site, written fresh
from the current standings. It is prose, not a template — there is
deliberately no fixed schema.

- **Rewrite it on every new match**, as part of the same commit. The
  previous text will usually contain a number the new result just broke
  (a streak, a win count, a rating).
- **Rethink the structure each time, don't just swap numbers.** The
  sections exist to carry whatever the story currently is. When the story
  changes, the sections change: a broken streak earns a new lead item, a
  topic that has gone quiet gets dropped, a new rivalry earns its own
  heading. Reusing last week's outline out of habit is the failure mode
  to avoid.
- **Verify every figure against the data before writing it.** Recompute
  records, ratings, head-to-head and streaks rather than carrying numbers
  over from the previous version.
- **Tone:** funny, a little tabloid. Warm and genuinely positive toward
  the two boys (`M` and `T`) — find the angle that makes them look good,
  it's usually in the data. Honest rather than artificially flattering
  about the adults; a light roast is fine and welcome.
- **Never name the rating model** or use jargon from it. Say what
  happened, not how it was computed.
- **Letters only** (`M`, `T`, `C`, `J`) — see rule 1b. The boys' ages (7
  and 5) may be mentioned; adults' ages may not.
- Formatting available in the body text: `**fett**` and `*kursiv*`.
  Anything else is escaped and shows up literally.
