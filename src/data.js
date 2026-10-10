export async function loadLeagueData(baseUrl = 'data/') {
  const [players, decks, matches, report] = await Promise.all([
    fetch(`${baseUrl}players.json`).then((r) => r.json()),
    fetch(`${baseUrl}decks.json`).then((r) => r.json()),
    fetch(`${baseUrl}matches.json`).then((r) => r.json()),
    // The ticker is editorial rather than load-bearing: if it's missing or
    // malformed the standings must still render, so it fails to null
    // instead of rejecting the whole page load.
    fetch(`${baseUrl}report.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  return { players, decks, matches, report };
}
