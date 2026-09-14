const FIELD_TITLE_OVERRIDES: Record<string, string> = {
  tmin: 'Min temperature',
  tmax: 'Max temperature'
};

export function titleize(value: unknown): string {
  const raw = String(value ?? '');
  if (FIELD_TITLE_OVERRIDES[raw]) return FIELD_TITLE_OVERRIDES[raw];

  const words = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word: string, index: number) => {
      if (/^[A-Z0-9]+$/.test(word)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

export function labelFromValue(value: unknown): string {
  const text = String(value ?? '');
  return text.includes('_') || text.includes('-') ? titleize(text) : text;
}

export function aggregateTitle(op: unknown, valueTitle: unknown): string {
  const operation = titleize(op);
  const rawValue = String(valueTitle ?? '').trim();
  const value = rawValue.includes('_') || rawValue.includes('-')
    ? titleize(rawValue)
    : rawValue.replace(/^\w/, (letter) => letter.toUpperCase());
  if (!operation) return value;
  if (!value || operation.toLowerCase() === value.toLowerCase()) return operation;
  if (new RegExp(`^${escapeRegExp(operation)}(?:\\s+of)?\\s+`, 'i').test(value)) return value;
  return `${operation} of ${value}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
