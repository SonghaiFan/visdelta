// Record the static export prefix for the local server and browser tests.
import {readFile, writeFile } from 'node:fs/promises';

const basePath = (process.env.DOCS_BASE_PATH ?? '').replace(/\/$/, '');
await writeFile(new URL('../.next/export-base-path', import.meta.url), basePath);
await writeFile(new URL('../out/visdelta-build.json',import.meta.url),await readFile(new URL('../lib/visdelta-build.json',import.meta.url)));
