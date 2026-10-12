/**
 * File access for the dev-only inline docs editor. A reference names a page
 * under `content/` and either a source range (`#line:column-line:column`,
 * 1-based, end exclusive) or a frontmatter field (`#title`, `#description`).
 * Writes are compare-and-swap: they fail if the text on disk is no longer
 * what the editor opened, so an edit never overwrites a newer change.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export class SourceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIELDS = ['title', 'description'] as const;
type Field = (typeof FIELDS)[number];
type Position = [line: number, column: number];
type Target = { field: Field } | { start: Position; end: Position };

function parseRef(root: string, ref: string): { path: string; target: Target } {
  const hash = ref.lastIndexOf('#');
  const file = ref.slice(0, hash);
  const at = ref.slice(hash + 1);
  if (hash < 0 || !/^content\/[\w./-]+\.mdx?$/.test(file) || file.split('/').includes('..')) {
    throw new SourceError(400, `Not an editable page: ${file || ref}`);
  }
  const content = resolve(root, 'content');
  const path = resolve(root, file);
  if (!path.startsWith(content + sep)) throw new SourceError(400, `Not an editable page: ${file}`);
  if ((FIELDS as readonly string[]).includes(at)) return { path, target: { field: at as Field } };
  const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(at);
  if (!match) throw new SourceError(400, `Malformed source position: ${at}`);
  const [startLine, startColumn, endLine, endColumn] = match.slice(1).map(Number);
  return { path, target: { start: [startLine, startColumn], end: [endLine, endColumn] } };
}

function offsetOf(text: string, [line, column]: Position) {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf('\n', offset);
    if (next < 0) throw new SourceError(409, 'The file is shorter than the page you are editing. Reload the page.');
    offset = next + 1;
  }
  return offset + column - 1;
}

/** The raw value of a one-line frontmatter field and where it sits in the file. */
function fieldSpan(text: string, field: Field) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!block) throw new SourceError(422, 'This page has no frontmatter.');
  const line = new RegExp(`^${field}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(block[1]);
  if (!line) throw new SourceError(422, `This page has no ${field}.`);
  const from = block.index + block[0].indexOf(block[1]) + line.index + line[0].indexOf(line[1], field.length + 1);
  return { from, to: from + line[1].length, raw: line[1] };
}

function decodeScalar(raw: string) {
  if (/^[>|][-+]?$/.test(raw)) throw new SourceError(422, 'Multi-line frontmatter values are edited in the file.');
  if (raw.startsWith('"')) return JSON.parse(raw) as string;
  if (raw.startsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  return raw;
}

/** A YAML scalar for `value`: plain when that is unambiguous, otherwise double-quoted. */
export function encodeScalar(value: string) {
  const plain =
    /^[^\s"'#&*!|>%@`{}[\],?:-][^#\n]*$/.test(value) &&
    !/:\s|\s$/.test(value) &&
    !/^(?:true|false|yes|no|on|off|null|~|[-+.\d][\d._eE+-]*)$/i.test(value);
  return plain ? value : JSON.stringify(value);
}

/** The text a reference names: a block's Markdown, or a field's value. */
export async function readSource(root: string, ref: string) {
  const { path, target } = parseRef(root, ref);
  const text = await readFile(path, 'utf8');
  if ('field' in target) return decodeScalar(fieldSpan(text, target.field).raw);
  return text.slice(offsetOf(text, target.start), offsetOf(text, target.end));
}

/** Replace what a reference names, if it still reads `original`. */
export async function writeSource(root: string, ref: string, original: string, replacement: string) {
  const { path, target } = parseRef(root, ref);
  const text = await readFile(path, 'utf8');
  let from: number;
  let to: number;
  let insert = replacement;
  if ('field' in target) {
    if (/[\r\n]/.test(replacement)) throw new SourceError(422, `A ${target.field} is one line.`);
    const span = fieldSpan(text, target.field);
    if (decodeScalar(span.raw) !== original) throw new SourceError(409, 'This page changed on disk. Reload it, then edit again.');
    ({ from, to } = span);
    insert = encodeScalar(replacement);
  } else {
    from = offsetOf(text, target.start);
    to = offsetOf(text, target.end);
    if (text.slice(from, to) !== original) throw new SourceError(409, 'This page changed on disk. Reload it, then edit again.');
  }
  if (text.slice(from, to) === insert) return false;
  await writeFile(path, text.slice(0, from) + insert + text.slice(to));
  return true;
}
