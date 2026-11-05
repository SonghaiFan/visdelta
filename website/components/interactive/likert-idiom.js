export const surveyData = './data/likert-survey.csv';
const base = `const chart = bar(rows)
  .x("question", { label: "Question" })
  .y("count")
  .breakdown("response")
  .color("response", {
    domain: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
    range: ["#a6611a", "#dfc27d", "#bdbdbd", "#80cdc1", "#018571"]
  })
`;
export const stacked = `.layout("stacked", {
    normalize: "percent",
    segments: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
  })`;
export const diverging = `.layout("diverging", {
    normalize: "percent",
    negative: ["Strongly disagree", "Disagree"],
    neutral: "Neutral",
    positive: ["Agree", "Strongly agree"]
  })`;
export const percentCode = `${base}  ${stacked}\n  .flip();`;
export const divergingCode = `${base}  ${diverging}\n  .flip();`;
