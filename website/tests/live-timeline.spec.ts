import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) test(`the first story animation follows its real clock on a fixed leg at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 860 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('playground/#split');
  await expect(page.locator('.pg-head')).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  const frames = await page.evaluate(async () => {
    const samples = [];
    const started = performance.now();
    while (performance.now() - started < 650) {
      await new Promise(requestAnimationFrame);
      const input = document.querySelector<HTMLInputElement>('[aria-label="Keyframe timeline"]')!;
      const track = document.querySelector('.pg-track')!.getBoundingClientRect();
      const head = document.querySelector('.pg-head')!.getBoundingClientRect();
      samples.push({
        time: performance.now(), value: input.valueAsNumber, total: Number(input.max),
        clips: [...document.querySelectorAll('.pg-clip')].map(clip => clip.getBoundingClientRect().width),
        x: head.left + head.width / 2 - track.left, width: track.width,
        marks: [...document.querySelectorAll('.pg-stage .vd-bar')].map(mark => ['x', 'y', 'width', 'height', 'transform', 'fill', 'style'].map(name => mark.getAttribute(name)).join(',')).join(';'),
      });
    }
    return samples;
  });
  expect(frames.length).toBeGreaterThan(5);
  expect(frames[0].value).toBeLessThan(frames[0].total);
  expect(frames.at(-1)!.value).toBeGreaterThan(frames[0].value + .3);
  for (const frame of frames) {
    expect(frame.total).toBe(frames[0].total);
    expect(frame.clips).toEqual(frames[0].clips);
    expect(Math.abs(frame.x - (7 + 160 * frame.value))).toBeLessThan(5);
  }
  const last = frames.at(-1)!;
  expect(Math.abs(last.value - frames[0].value - (last.time - frames[0].time) / 1000)).toBeLessThan(.12);
  expect(new Set(frames.map(frame => frame.marks)).size).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await page.getByLabel('Keyframe timeline').inputValue();
  await page.waitForTimeout(450);
  await expect(page.getByLabel('Keyframe timeline')).toHaveValue(paused);
  await page.getByRole('button', { name: 'Play keyframes', exact: true }).click();
  await expect.poll(async () => Number(await page.getByLabel('Keyframe timeline').inputValue())).toBeGreaterThan(Number(paused));
  expect(errors).toEqual([]);
});
