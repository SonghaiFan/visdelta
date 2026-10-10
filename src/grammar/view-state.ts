export interface ViewStateOptions {
  /** Capture this declaration as the baseline used by reset(), if none exists yet. */
  captureResetBaseline?: boolean;
}

const resetBaselines = new WeakMap<object, object>();

export class ViewState<S extends object = Record<string, unknown>> {
  readonly state: Readonly<S>;

  constructor(state: S = {} as S) {
    this.state = deepFreeze(cloneState(state)) as Readonly<S>;
  }

  with(patch: Partial<S>, options?: ViewStateOptions | null): this {
    const next = mergeState(this.state as S, patch) as S;
    return this.derive(next, options);
  }

  /** Return a new state equal to the declaration before its first semantic operation. */
  reset(): this {
    const initial = cloneState((resetBaselines.get(this) ?? this.state) as S);
    return this.derive(initial);
  }

  /** Replace one semantic state family instead of leaking fields from its previous mode. */
  protected replaceState<K extends keyof S>(key: K, value: S[K], options?: ViewStateOptions): this {
    const next = cloneState(this.state) as S;
    (next as Record<string, unknown>)[key as string] = cloneState(value);
    return this.derive(next as S, options);
  }

  /** A new instance of this exact subclass holding `state`, so derived states keep their builder type. */
  protected derive(state: S, options?: ViewStateOptions | null): this {
    const Ctor = this.constructor as new (s: S) => this;
    const next = new Ctor(state);
    const baseline = options?.captureResetBaseline && !resetBaselines.has(this)
      ? cloneState(this.state as S)
      : resetBaselines.get(this);
    if (baseline) resetBaselines.set(next, baseline);
    return next;
  }

  toSpec(): S {
    return cloneState(this.state) as S;
  }
}

export function cloneState<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(cloneState) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cloneState(v)])
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function mergeState<T extends object>(base: T, patch: Partial<T>): T {
  const next = cloneState(base);
  for (const [key, value] of Object.entries(patch) as Array<[keyof T, unknown]>) {
    const existing = (next as Record<keyof T, unknown>)[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      (next as Record<keyof T, unknown>)[key] = mergeState(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      (next as Record<keyof T, unknown>)[key] = cloneState(value);
    }
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
