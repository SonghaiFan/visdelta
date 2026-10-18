import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** One quick-start source for the repository and the exported agent endpoints. */
export function agentGuide() {
  return readFile(resolve(process.cwd(), '../llms.txt'), 'utf8');
}
