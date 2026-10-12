'use client';
/**
 * The playground's rows and share links. Rows are kept as the source text the
 * reader can edit (CSV or JSON) together with the records parsed from it.
 */
import { dataHref, loadD3, type ChartName, type Rows } from '@/components/interactive/runtime';

export type RowsFormat = 'csv' | 'json';

export interface Dataset {
  name: string;
  format: RowsFormat;
  /** Source text; empty for a chart that declares its data inline. */
  text: string;
  rows: Rows;
  /** Repository CSV this came from, while its text is unchanged. */
  source?: string;
}

export const inlineData: Dataset = { name: 'inline data', format: 'csv', text: '', rows: [] };

const textCache = new Map<string, Promise<string>>();
/** The text of a repository data file such as "./data/x.csv". */
export function loadText(url: string): Promise<string> {
  const href = dataHref(url);
  let pending = textCache.get(href);
  if (!pending) {
    pending = fetch(href).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
      return response.text();
    });
    pending.catch(() => textCache.delete(href));
    textCache.set(href, pending);
  }
  return pending;
}

/** Parse rows the way the rest of the site does: d3.csvParse with autoType, or a JSON array. */
export async function parseRows(text: string, format: RowsFormat): Promise<Rows> {
  if (format === 'json') {
    const rows: unknown = JSON.parse(text);
    if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) {
      throw new Error('JSON rows must be an array of objects.');
    }
    return rows as Rows;
  }
  const d3 = await loadD3();
  return d3.csvParse(text, d3.autoType) as unknown as Rows;
}

export const formatOf = (name: string): RowsFormat => (/\.json$/i.test(name) ? 'json' : 'csv');
export const datasetName = (url: string) => url.split('/').at(-1)!;

/** What a share link carries: the code and where its rows come from. */
export interface SharedCode {
  code: string;
  chart?: ChartName;
  /** A repository CSV ("./data/x.csv"). */
  data?: string;
  /** Rows the reader edited or uploaded. */
  rows?: { name: string; format: RowsFormat; text: string };
}

/** Longest share hash written; beyond it the reader's own rows are left out. */
const MAX_HASH = 24_000;
const REPOSITORY_DATA = /^\.\/data\/[\w.-]+\.csv$/;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}
const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));

async function pack(value: SharedCode) {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('deflate-raw')));
}

/** A `share=` hash for the code and rows, and whether the rows had to be left out. */
export async function encodeShare(value: SharedCode): Promise<{ hash: string; rowsOmitted: boolean }> {
  const hash = `share=${await pack(value)}`;
  if (hash.length <= MAX_HASH || !value.rows) return { hash, rowsOmitted: false };
  const { rows: _omitted, ...rest } = value;
  return { hash: `share=${await pack(rest)}`, rowsOmitted: true };
}

export async function decodeShare(payload: string): Promise<SharedCode> {
  let value: Partial<SharedCode>;
  try {
    value = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'))));
  } catch {
    throw new Error('This share link is damaged or incomplete.');
  }
  if (typeof value?.code !== 'string') throw new Error('This share link has no code.');
  const rows = value.rows;
  return {
    code: value.code,
    chart: typeof value.chart === 'string' ? (value.chart as ChartName) : undefined,
    // Only the site's own data files are fetched for a link.
    data: typeof value.data === 'string' && REPOSITORY_DATA.test(value.data) ? value.data : undefined,
    rows:
      rows && typeof rows.text === 'string' && (rows.format === 'csv' || rows.format === 'json')
        ? { name: String(rows.name || `rows.${rows.format}`), format: rows.format, text: rows.text }
        : undefined,
  };
}
