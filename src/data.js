export async function loadLeagueData(baseUrl = 'data/') {
  const [players, decks, matches] = await Promise.all([
    fetch(`${baseUrl}players.json`).then((r) => r.json()),
    fetch(`${baseUrl}decks.json`).then((r) => r.json()),
    fetch(`${baseUrl}matches.json`).then((r) => r.json()),
  ]);
  return { players, decks, matches };
}
