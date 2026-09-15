export function resolveTarget(target: string | Element | undefined): Element {
  if (target == null) throw new Error('VisDelta needs a target: pass { target: "#chart" } or an element.');
  if (typeof target !== "string") return target;
  const node = document.querySelector(target);
  if (!node) throw new Error(`VisDelta target not found: ${target}`);
  return node;
}
