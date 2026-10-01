<script setup>
const snippet = `const from = bar(rows)
  .x("category")
  .y("revenue");

const to = from
  .y("profit")
  .sort("profit", "descending");

const change = await transition(from, to, {
  target: "#chart"
});

change.play();
change.progress(0.42);
change.play({ from: 1, to: 0 });`;
</script>

<template>
  <DocsCodeBlock :code="snippet" language="js" />
</template>
