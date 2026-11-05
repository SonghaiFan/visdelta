import { bar } from 'visdelta';

// Synthetic survey. All five responses are present for every question.
const rows = [
  {
    "question": "Transit n=100",
    "response": "Strongly disagree",
    "count": 10
  },
  {
    "question": "Transit n=100",
    "response": "Disagree",
    "count": 20
  },
  {
    "question": "Transit n=100",
    "response": "Neutral",
    "count": 30
  },
  {
    "question": "Transit n=100",
    "response": "Agree",
    "count": 25
  },
  {
    "question": "Transit n=100",
    "response": "Strongly agree",
    "count": 15
  },
  {
    "question": "Parks n=200",
    "response": "Strongly disagree",
    "count": 10
  },
  {
    "question": "Parks n=200",
    "response": "Disagree",
    "count": 30
  },
  {
    "question": "Parks n=200",
    "response": "Neutral",
    "count": 40
  },
  {
    "question": "Parks n=200",
    "response": "Agree",
    "count": 70
  },
  {
    "question": "Parks n=200",
    "response": "Strongly agree",
    "count": 50
  },
  {
    "question": "Services n=80",
    "response": "Strongly disagree",
    "count": 16
  },
  {
    "question": "Services n=80",
    "response": "Disagree",
    "count": 24
  },
  {
    "question": "Services n=80",
    "response": "Neutral",
    "count": 8
  },
  {
    "question": "Services n=80",
    "response": "Agree",
    "count": 20
  },
  {
    "question": "Services n=80",
    "response": "Strongly agree",
    "count": 12
  }
];

const base = bar(rows)
  .x("question", { label: "Synthetic survey · valid responses shown in n" })
  .y("count")
  .breakdown("response")
  .color("response", {
    domain: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
    range: ["#a6611a", "#dfc27d", "#bdbdbd", "#80cdc1", "#018571"]
  })
  .flip();

export const from = base.layout('stacked', {
  normalize: 'percent',
  segments: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']
});
export const to = base.layout('diverging', {
  normalize: 'percent',
  negative: ['Strongly disagree', 'Disagree'],
  neutral: 'Neutral',
  positive: ['Agree', 'Strongly agree']
});
