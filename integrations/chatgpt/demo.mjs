export const TOOL_NAME = "render_visdelta_transition";
export const RESOURCE_URI = "ui://visdelta/transition-demo-v1.html";

const rows = [
  { category: "A", revenue: 12, profit: 5 },
  { category: "B", revenue: 18, profit: 11 },
  { category: "C", revenue: 9, profit: 7 }
];

const x = { field: "category", type: "nominal", title: "Category" };

export const DEMO_PAYLOAD = Object.freeze({
  id: "revenue-to-profit",
  title: "Revenue → Profit",
  description: "A seekable VisDelta bar transition using JSON-safe view specs.",
  from: {
    mark: "bar",
    data: { values: rows },
    key: "category",
    encoding: {
      x,
      y: { field: "revenue", type: "quantitative", title: "Revenue" }
    }
  },
  to: {
    mark: "bar",
    data: { values: rows },
    key: "category",
    encoding: {
      x,
      y: { field: "profit", type: "quantitative", title: "Profit" }
    }
  }
});

export function createDemoResult() {
  return {
    content: [
      {
        type: "text",
        text: "Rendered the VisDelta Revenue → Profit transition demo."
      }
    ],
    structuredContent: JSON.parse(JSON.stringify(DEMO_PAYLOAD))
  };
}
