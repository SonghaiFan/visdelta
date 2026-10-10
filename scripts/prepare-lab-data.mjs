import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { csvParse, csvFormat, autoType } from 'd3-dsv';
import { utcMonday } from 'd3';

const directory = new URL('../docs/public/data/', import.meta.url);
export async function preparedLabData() {
  const stocks = csvParse(await readFile(new URL('stock.csv', directory), 'utf8'), autoType);
  const lineRows = ['AAPL', 'GOOG'].flatMap(ticker =>
    stocks
      .filter(row => row.ticker === ticker)
      .slice(-20)
      .map(row => ({ ...row, week: utcMonday.floor(row.date) }))
  );
  const unemployment = csvParse(await readFile(new URL('unemployment.csv', directory), 'utf8'), autoType)
    .filter(row => row.date >= new Date('2008-09-01') && row.date <= new Date('2010-02-01'));
  const industries = new Set(['Manufacturing', 'Leisure and hospitality', 'Construction']);
  return {
    'line-lab.csv': lineRows,
    'area-lab.csv': unemployment.filter(row => industries.has(row.industry))
  };
}

export function formatLabData(rows) {
  return csvFormat(rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value instanceof Date ? value.toISOString().slice(0, 10) : value])))) + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  for (const [name, rows] of Object.entries(await preparedLabData())) {
    const expected = formatLabData(rows);
    const path = new URL(name, directory);
    if (check) {
      if (await readFile(path, 'utf8') !== expected) throw new Error(`Stale demo CSV: ${name}`);
    } else await writeFile(path, expected);
    console.log(`${check ? 'Checked' : 'Prepared'} ${name}: ${rows.length} rows`);
  }
}
