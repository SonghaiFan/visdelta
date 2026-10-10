import { test, expect } from '@playwright/test';

test('bar tooltip exposes datum identity and the rendered mark key', async ({ page }) => {
  await page.goto('/tests/fixtures/runtime.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.evaluate(async () => {
    const target = document.createElement('div');
    target.id = 'inspection';
    document.body.append(target);
    const state = window.VisDelta.bar([{ id: 'record-1', category: 'A', value: 10 }])
      .datumKey('id').key('category').x('category').y('value');
    await window.VisDelta.transition(state, state, { target, width: 800, height: 400 });
  });
  await page.locator('#inspection rect.vd-bar').hover();
  const tooltip = page.locator('.vd-tooltip').filter({ hasText: 'datumKey' });
  await expect(tooltip).toHaveCSS('opacity', '1');
  await expect(tooltip).toContainText('datumKey (id): "record-1"');
  await expect(tooltip).toContainText('key (category): A');
});

for (const kind of ['point', 'unit']) {
  test(`${kind} tooltip exposes the rendered mark key`, async ({ page }) => {
    await page.goto('/tests/fixtures/runtime.html');
    await expect(page.locator('#status')).toHaveText('Ready');
    await page.evaluate(async kind => {
      const target = document.createElement('div');
      target.id = 'inspection';
      document.body.append(target);
      const data = [{ flowerId: 'record-1', x: 1, y: 3 }];
      const state = kind === 'point'
        ? window.VisDelta.point(data).key('flowerId').x('x').y('y')
        : window.VisDelta.unit(data).key('flowerId').layout('grid');
      await window.VisDelta.transition(state, state, { target, width: 800, height: 400 });
    }, kind);
    await page.locator(`#inspection .vd-${kind}`).first().hover();
    const tooltip = page.locator('.vd-tooltip').filter({ hasText: 'key' });
    await expect(tooltip).toHaveCSS('opacity', '1');
    await expect(tooltip).toContainText('datumKey (flowerId): "record-1"');
    await expect(tooltip).toContainText('key (flowerId): record-1');
  });
}

for (const kind of ['line', 'area']) {
  test(`${kind} uses the common HTML tooltip without SVG scaling`, async ({ page }) => {
    await page.goto('/tests/fixtures/runtime.html');
    await expect(page.locator('#status')).toHaveText('Ready');
    await page.evaluate(async kind => {
      const { [kind]: builder, transition } = window.VisDelta;
      const target = document.createElement('div');
      target.id = 'inspection';
      document.body.append(target);
      const state = builder([{ x: 1, y: 3 }, { x: 2, y: 6 }, { x: 3, y: 4 }]).x('x').y('y');
      await transition(state, state, { target, width: 800, height: 400 });
    }, kind);
    const hitbox = page.locator(`#inspection .vd-${kind}-tooltip-hitbox`);
    const inspect = async () => {
      const bounds = await hitbox.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      const tooltip = page.locator('.vd-tooltip').filter({ hasText: 'Y:' });
      await expect(tooltip).toHaveCSS('opacity', '1');
      await expect(tooltip).toContainText('datumKey (auto index): 1');
      await expect(tooltip).toContainText('key (x): 2');
      return tooltip.evaluate(node => ({
        font: getComputedStyle(node).fontSize,
        padding: getComputedStyle(node).padding,
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height
      }));
    };
    const normal = await inspect();
    await page.locator('#inspection svg').evaluate(node => { node.style.width = '320px'; });
    const small = await inspect();
    expect(small).toEqual(normal);
    await expect(page.locator(`#inspection .vd-${kind}-tooltip-box`)).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(page.locator('.vd-tooltip').filter({ hasText: 'Y:' })).toHaveCSS('opacity', '0');
  });
}
