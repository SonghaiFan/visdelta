import { test, expect } from '@playwright/test';

test('hero publishes code and its first visual change in the same paint', async ({ page }) => {
  await page.goto('/');

  const timing = await page.evaluate(() => new Promise((resolve) => {
    const started = performance.now();
    let frame = 0;
    let baseline = '';
    let codeFrame = null;
    let chartFrame = null;
    let codeObserver = null;
    let chartObserver = null;

    const signature = () => [...(document.querySelector('.hero-demo-chart')
      ?.querySelectorAll(':scope > .vd-chart-root .vd-bar') ?? [])]
      .map((bar) => [
        bar.getAttribute('x'),
        bar.getAttribute('y'),
        bar.getAttribute('width'),
        bar.getAttribute('height'),
        getComputedStyle(bar).fill
      ].join('|'))
      .join(';');

    const finish = () => {
      if (codeFrame === null || chartFrame === null) return false;
      codeObserver?.disconnect();
      chartObserver?.disconnect();
      resolve({ codeFrame, chartFrame, frameGap: codeFrame - chartFrame });
      return true;
    };

    const countFrames = () => {
      frame += 1;
      if (performance.now() - started > 4000) {
        codeObserver?.disconnect();
        chartObserver?.disconnect();
        resolve({ codeFrame, chartFrame, frameGap: null });
        return;
      }
      requestAnimationFrame(countFrames);
    };

    const watch = () => {
      const code = document.querySelector('.hero-demo-code code');
      const chart = document.querySelector('.hero-demo-chart');
      baseline = signature();
      if (!code || !chart || !baseline) {
        requestAnimationFrame(watch);
        return;
      }

      codeObserver = new MutationObserver(() => {
        if (codeFrame === null && code.textContent.includes('.color("country")')) {
          codeFrame = frame;
          finish();
        }
      });
      chartObserver = new MutationObserver(() => {
        if (chartFrame === null && signature() !== baseline) {
          chartFrame = frame;
          finish();
        }
      });
      codeObserver.observe(code, { childList: true, subtree: true, characterData: true });
      chartObserver.observe(chart, { attributes: true, childList: true, subtree: true });
    };

    requestAnimationFrame(countFrames);
    requestAnimationFrame(watch);
  }));

  expect(timing.frameGap).not.toBeNull();
  expect(Math.abs(timing.frameGap)).toBeLessThanOrEqual(1);
});
