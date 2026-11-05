import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('installed documentation is generated from the canonical website pages and public types',async()=>{
  const index=JSON.parse(await readFile(new URL('../dist/docs/index.json',import.meta.url),'utf8'));
  const pages=index.documents.filter(document=>document.source);
  assert.ok(pages.length>=35);
  for(const document of index.documents) {
    const text=await readFile(new URL('../dist/docs/'+document.path.replace('visdelta/docs/',''),import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(text).digest('hex'),document.sha256);
    assert.ok(!text.includes('<auto-type-table'));
    if(document.source) {
      const source=await readFile(new URL('../'+document.source,import.meta.url),'utf8');
      assert.equal(createHash('sha256').update(source).digest('hex'),document.sourceSha256);
    }
  }
  const types=await readFile(new URL('../dist/docs/api/types.md',import.meta.url),'utf8');
  assert.match(types,/export type StateChange\s*=/);
  assert.match(types,/export interface ChannelSpec/);
});
