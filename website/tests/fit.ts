import { expect, type Locator } from '@playwright/test';
export async function expectFit(stage: Locator) {
  await expect.poll(() => stage.evaluate(node => {
    const figure = node.querySelector<HTMLElement>('.pg-layer[data-state="shown"] figure');
    if (!figure) return false;
    const room = node.getBoundingClientRect(), box = figure.getBoundingClientRect();
    const scale = Math.min(node.clientWidth / figure.offsetWidth, node.clientHeight / figure.offsetHeight);
    return Math.abs(box.width - figure.offsetWidth * scale) < 2
      && Math.abs(box.height - figure.offsetHeight * scale) < 2
      && box.left >= room.left - 1 && box.right <= room.right + 1
      && box.top >= room.top - 1 && box.bottom <= room.bottom + 1
      && Math.abs(box.left + box.width / 2 - room.left - node.clientWidth / 2) < 2
      && Math.abs(box.top + box.height / 2 - room.top - node.clientHeight / 2) < 2;
  })).toBe(true);
}
