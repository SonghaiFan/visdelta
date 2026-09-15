# Data and transforms

## Input contract

VisDelta expects tidy data: one observation per row and one variable per field.
Clean, join, pivot, and otherwise reshape data before passing it to the library.

Supported sources are:

```js
bar(rows)
bar({ values: rows })
bar({ url: "./data.csv" })                 // type inferred from the extension
bar({ url: "./data.json", type: "json" })
bar({ name: "sales" })                      // resolved from transition(..., { data: { sales: rows } })
```

A bare string is rejected: whether `"sales.csv"` names a file or a dataset is
not something the library guesses. URLs are loaded by `transition()`; the same
source used by both endpoints is loaded once per transition.

## Field types

Core detects `quantitative`, `temporal`, and `nominal` fields from tidy rows.
Detection fills only missing channel types; an authored type always wins.

```js
line(rows)
  .x("date", { type: "temporal" })
  .y("close", { type: "quantitative" });
```

ISO date strings and valid `Date` objects are temporal. Numeric values and
numeric strings are quantitative. Mixed or unknown fields stay nominal.

## Transform contract

Transforms are part of a chart state, not a general data-wrangling API. They
run in declaration order without another runtime dependency.

| Operation | Supported form |
| --- | --- |
| `filter` | One structured field comparison: `{ field, equal | notEqual | oneOf | gt | gte | lt | lte }` |
| `timeUnit` | `month` |
| `fold` | Explicit fields and output names |
| `bin` | Positive `step` or positive integer `maxbins` |
| `aggregate` | `count`, `sum`, `mean`, `min`, `max`, `median` |
| `sort` | One field or an ordered field list |
| `limit` | A non-negative integer |

Each transform entry contains exactly one operation. Unknown properties and
unknown operation names are errors.

```js
const spec = {
  mark: "bar",
  data: { values: rows },
  transform: [
    { filter: { field: "sales", gte: 0 } },
    { aggregate: {
      groupby: ["region"],
      fields: [{ op: "sum", field: "sales", as: "sales" }]
    } },
    { sort: { field: "sales", order: "descending" } }
  ],
  encoding: {
    x: { field: "region", type: "nominal" },
    y: { field: "sales", type: "quantitative" }
  }
};
```

Builder methods such as `.where()`, `.sort()`, `.breakdown()`, and `.rollup()`
produce these strict transforms. They do not silently clean the source table or
invent visual encodings.
