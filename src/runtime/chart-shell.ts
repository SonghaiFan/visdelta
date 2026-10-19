export function renderChartShell(target: Element, viewId = "main") {
  target.className = ["vd-chart-root", target.className].filter(Boolean).join(" ");

  const figure = document.createElement("figure");
  figure.className = "vd-figure vd-chart-figure";

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
    views: { [viewId]: view },
    tooltip
  };
}
