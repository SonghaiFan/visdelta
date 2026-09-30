/** Build the two-cell authoring contract used by every transition lab. */
export function transitionScenario({ id, category, label, description, setup, from, to }) {
  const dataUrl = setup.match(/const DATA_URL = ["']([^"']+)["'];/)?.[1] ?? null;
  const visibleSetup = setup
    .replace(/^const DATA_URL = ["'][^"']+["'];\s*/m, '')
    .replace(/^const rows = await d3\.csv\(DATA_URL, d3\.autoType\);\s*/m, '')
    .replaceAll('{ url: DATA_URL }', 'rows')
    .trim();
  return {
    id, category, label, description, dataUrl,
    code: `${visibleSetup}${visibleSetup ? '\n\n' : ''}const from = ${from};`,
    toCode: `const to = ${to};`
  };
}
