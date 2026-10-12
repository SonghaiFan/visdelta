/** One line of heading text. Both endpoints of a pair are present so it can change by progress. */
export interface HeadingLine {
  element: HTMLElement;
  /** The text at progress 0. */
  from: HTMLElement;
  /** The text at progress 1. */
  to: HTMLElement;
}

export function renderChartShell(target: Element, viewId = "main") {
  target.className = ["vd-chart-root", target.className].filter(Boolean).join(" ");

  const figure = document.createElement("figure");
  figure.className = "vd-figure vd-chart-figure";

  // Title and subtitle sit above the canvas, outside the SVG. Nothing is
  // reserved for them until a state declares one. The figcaption only clips to
  // an interpolated height; padding and border belong to its content, so the
  // height can run all the way down to zero.
  const header = document.createElement("figcaption");
  header.className = "vd-figure-header";
  header.hidden = true;
  const heading = document.createElement("div");
  heading.className = "vd-figure-heading";
  header.append(heading);
  const line = (kind: "title" | "subtitle"): HeadingLine => {
    const element = document.createElement("p");
    element.className = `vd-figure-${kind}`;
    element.hidden = true;
    const from = document.createElement("span");
    const to = document.createElement("span");
    element.append(from, to);
    heading.append(element);
    return { element, from, to };
  };
  const title = line("title");
  const subtitle = line("subtitle");
  figure.append(header);

  const view = document.createElement("div");
  view.className = "vd-view";
  view.dataset.viewId = viewId;
  figure.append(view);
  target.append(figure);

  const tooltip = document.createElement("div");
  tooltip.className = "vd-tooltip";
  target.append(tooltip);

  return {
    root: target,
    figure,
    heading: { header, title, subtitle },
    views: { [viewId]: view },
    tooltip
  };
}
