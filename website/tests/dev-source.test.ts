// Unit tests for the dev-only inline editor's file access (lib/dev-source.ts).
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { encodeScalar, readSource, SourceError, writeSource } from '../lib/dev-source.ts';

const page = `---
title: Progress
description: 'A transition is a function of one number.'
---

A transition has one input: \`progress\`.

## Play

- one
- two
`;

let root: string;
const file = 'content/docs/page.mdx';
const contents = () => readFile(join(root, file), 'utf8');

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'vd-dev-source-'));
  await mkdir(join(root, 'content/docs'), { recursive: true });
});
after(() => rm(root, { recursive: true, force: true }));

test('reads a block by its 1-based line and column range', async () => {
  await writeFile(join(root, file), page);
  assert.equal(await readSource(root, `${file}#6:1-6:40`), 'A transition has one input: `progress`.');
  assert.equal(await readSource(root, `${file}#8:1-8:8`), '## Play');
  assert.equal(await readSource(root, `${file}#10:3-10:6`), 'one');
});

test('reads frontmatter fields, unquoting them', async () => {
  await writeFile(join(root, file), page);
  assert.equal(await readSource(root, `${file}#title`), 'Progress');
  assert.equal(await readSource(root, `${file}#description`), 'A transition is a function of one number.');
});

test('writes a block in place and leaves the rest of the file untouched', async () => {
  await writeFile(join(root, file), page);
  const original = 'A transition has one input: `progress`.';
  assert.equal(await writeSource(root, `${file}#6:1-6:40`, original, 'A transition has **one** input.\nIt is a number.'), true);
  assert.equal(await contents(), page.replace(original, 'A transition has **one** input.\nIt is a number.'));
});

test('writes frontmatter as a valid YAML scalar', async () => {
  await writeFile(join(root, file), page);
  await writeSource(root, `${file}#title`, 'Progress', 'Progress: one number');
  assert.match(await contents(), /^title: "Progress: one number"$/m);
  assert.equal(await readSource(root, `${file}#title`), 'Progress: one number');
  await writeSource(root, `${file}#description`, 'A transition is a function of one number.', 'Plain words.');
  assert.match(await contents(), /^description: Plain words\.$/m);
  await assert.rejects(writeSource(root, `${file}#title`, 'Progress: one number', 'two\nlines'), (error: SourceError) => error.status === 422);
});

test('refuses to overwrite text that changed on disk', async () => {
  await writeFile(join(root, file), page);
  await assert.rejects(writeSource(root, `${file}#6:1-6:40`, 'stale text', 'new'), (error: SourceError) => error.status === 409);
  await assert.rejects(writeSource(root, `${file}#title`, 'Old title', 'new'), (error: SourceError) => error.status === 409);
  assert.equal(await contents(), page);
});

test('only pages under content/ can be read or written', async () => {
  for (const ref of ['content/../outside.mdx#title', '../outside.mdx#title', 'app/layout.tsx#1:1-1:2', 'content/docs/page.mdx#1:1', 'content/docs/page.mdx']) {
    await assert.rejects(readSource(root, ref), (error: SourceError) => error.status === 400, ref);
  }
});

test('YAML scalars stay plain only when unambiguous', () => {
  for (const value of ['Plain words.', "It's a number."]) assert.equal(encodeScalar(value), value);
  for (const value of ['Has: colon', '# heading', 'true', '42', '- dash', ' padded', '[list]', 'a #comment']) {
    assert.equal(encodeScalar(value), JSON.stringify(value), value);
  }
});
