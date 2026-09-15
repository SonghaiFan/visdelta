/** The join identity of a unit: its matched source key when one exists, else its own key. */
export function unitKey(datum: Record<string, unknown>): string {
  return String(datum['__joinKey'] ?? datum['__unitKey']);
}
