/**
 * Divide ordered items into stretches that were neighbours in their lineage.
 * A visible path needs at least two connected observations.
 */
export function connectedStretches<T>(
  items: readonly T[],
  lineage: readonly T[],
  key: (item: T, index: number) => string,
  minimumLength = 2
): T[][] {
  const lineageIndex = new Map(lineage.map((item, index) => [key(item, index), index]));
  const stretches: T[][] = [];
  let stretch: T[] = [];
  let previousIndex: number | null = null;

  items.forEach((item, visibleIndex) => {
    const nextIndex = lineageIndex.get(key(item, visibleIndex)) ?? visibleIndex;
    if (previousIndex != null && nextIndex !== previousIndex + 1) {
      if (stretch.length >= minimumLength) stretches.push(stretch);
      stretch = [];
    }
    stretch.push(item);
    previousIndex = nextIndex;
  });
  if (stretch.length >= minimumLength) stretches.push(stretch);
  return stretches;
}
