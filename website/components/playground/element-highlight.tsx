'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Resolve against the current mounted chart, never against borrowed inspection nodes. */
export function ElementHighlight({ path, getRoot }: { path: string[]; getRoot: () => HTMLElement | null }) {
  const [boxes, setBoxes] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useEffect(() => {
    let frame = 0;
    let previous = '';
    const selector = path.map(part => {
      const [tag, ...classes] = part.split('.');
      return `${CSS.escape(tag)}${classes.map(name => `.${CSS.escape(name)}`).join('')}`;
    }).join(' > ');
    const update = () => {
      const root = getRoot();
      const next = root ? Array.from(root.querySelectorAll(selector)).filter(node => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
      }).map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left - 2, top: box.top - 2, width: box.width + 4, height: box.height + 4 };
      }).filter(box => box.width > 4 || box.height > 4) : [];
      const signature = JSON.stringify(next);
      if (signature !== previous) { previous = signature; setBoxes(next); }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [path, getRoot]);
  return createPortal(<>{boxes.map((box, index) => <div key={index} className="pg-element-highlight" aria-hidden="true" style={box} />)}</>, document.body);
}
