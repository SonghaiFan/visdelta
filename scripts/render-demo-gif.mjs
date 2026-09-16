// Renders docs/public/demo.gif from the real library: Playwright scrubs the
// demo page frame by frame, ffmpeg encodes with a two-pass palette.
// Usage: node scripts/serve-tests.mjs &  then  node scripts/render-demo-gif.mjs
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const out = mkdtempSync(join(tmpdir(), 'visdelta-gif-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 412 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${process.env.VISDELTA_TEST_PORT || 5511}/tests/fixtures/demo.html`);
await page.waitForFunction(() => window.ready === true);
// Timeline: hold, scrub forward 0→2 with ease, hold, scrub back to 0 faster, hold.
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const frames = [];
const push = (t, n = 1) => { for (let i = 0; i < n; i++) frames.push(t); };
push(0, 14);
for (let i = 1; i <= 60; i++) push(2 * ease(i / 60));
push(2, 16);
for (let i = 1; i <= 42; i++) push(2 * (1 - ease(i / 42)));
push(0, 10);
let n = 0;
for (const t of frames) {
  await page.evaluate((v) => window.seek(v), t);
  await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png` });
}
await browser.close();
const target = new URL('../docs/public/demo.gif', import.meta.url).pathname;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '14', '-i', `${out}/f%04d.png`, '-vf', 'scale=760:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', `${out}/palette.png`]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '14', '-i', `${out}/f%04d.png`, '-i', `${out}/palette.png`, '-lavfi', 'scale=760:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', target]);
rmSync(out, { recursive: true, force: true });
console.log(`${n} frames -> ${target}`);
