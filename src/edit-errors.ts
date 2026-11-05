export interface ChartErrorDetails {
  code: string;
  message: string;
  hint: string;
  chartType?: string;
  method?: string;
  revision?: number;
  editIndex?: number;
  /** JSON Pointer into the edit message. */
  path?: string;
  /** JSON Pointer into the source declaration when a state constraint is known. */
  specPath?: string;
}

/** Structured recovery information without serializing declarations or data. */
export function chartError(code: string, message: string, hint: string,
  details: Partial<Pick<ChartErrorDetails, 'chartType' | 'method' | 'revision' | 'editIndex' | 'path' | 'specPath'>> = {}): Error & ChartErrorDetails {
  return Object.assign(new Error(message), { code, hint, ...details });
}
export function chartFailure(error: unknown, code: string, hint: string, chartType?: string) {
  if (error && typeof error === 'object' && 'code' in error) return error;
  return chartError(code, error instanceof Error ? error.message : String(error), hint, { chartType });
}

export function editFailure(error: unknown, editIndex: number, method: string, chartType?: string) {
  const failure = chartFailure(error, 'INVALID_EDIT_ARGUMENTS', 'Correct the indicated edit arguments; no part of the batch was accepted.', chartType) as Error & ChartErrorDetails;
  return Object.assign(failure, { editIndex, method, chartType,
    path: failure.path?.startsWith('/args') ? `/edits/${editIndex}${failure.path}` : failure.path ?? `/edits/${editIndex}/args` });
}
