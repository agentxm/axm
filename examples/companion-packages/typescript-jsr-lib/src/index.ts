/**
 * TinyFlags — tiny feature flag library used by AXM companion package examples.
 *
 * @module
 */

/** Boolean feature flag with optional percentage rollout. */
export interface BooleanFlag {
  readonly kind: "boolean";
  readonly default: boolean;
  readonly rollout?: number;
}

/** Variant feature flag with allowed values and optional percentage allocations. */
export interface VariantFlag {
  readonly kind: "variant";
  readonly variants: readonly string[];
  readonly default: string;
  readonly rollout?: Readonly<Record<string, number>>;
}

/** A boolean or variant flag definition. */
export type Flag = BooleanFlag | VariantFlag;

/** Evaluation context — supply at least one stable identifier for per-caller bucketing. */
export interface EvaluationContext {
  readonly userId?: string;
  readonly accountId?: string;
  readonly sessionId?: string;
}

/** Options for {@link booleanFlag}. */
export interface BooleanFlagOptions {
  readonly default?: boolean;
  readonly rollout?: number;
}

/** Options for {@link variantFlag}. */
export interface VariantFlagOptions {
  readonly default?: string;
  readonly rollout?: Readonly<Record<string, number>>;
}

/** Define a boolean flag with a default value and an optional rollout percentage. */
export function booleanFlag(options: BooleanFlagOptions = {}): BooleanFlag {
  const defaultValue = options.default ?? false;
  if (typeof defaultValue !== "boolean") {
    throw new TypeError("booleanFlag default must be a boolean");
  }

  const rollout = normalizePercentage(options.rollout, "booleanFlag rollout");

  return Object.freeze<BooleanFlag>({
    kind: "boolean",
    default: defaultValue,
    ...(rollout !== undefined ? { rollout } : {}),
  });
}

/** Define a variant flag with a list of allowed variants and an optional rollout allocation. */
export function variantFlag(
  variants: readonly string[],
  options: VariantFlagOptions = {},
): VariantFlag {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new TypeError("variantFlag requires at least one variant");
  }

  const uniqueVariants = [...new Set(variants)];
  if (
    uniqueVariants.length !== variants.length ||
    uniqueVariants.some((value) => value === "")
  ) {
    throw new TypeError("variantFlag variants must be unique non-empty strings");
  }

  const defaultValue = options.default ?? uniqueVariants[0];
  if (!uniqueVariants.includes(defaultValue)) {
    throw new TypeError("variantFlag default must be one of the variants");
  }

  const rollout = normalizeVariantRollout(options.rollout, uniqueVariants);

  return Object.freeze<VariantFlag>({
    kind: "variant",
    variants: Object.freeze(uniqueVariants),
    default: defaultValue,
    ...(rollout !== undefined ? { rollout } : {}),
  });
}

/** A configured TinyFlags client. */
export interface TinyFlagsClient {
  readonly definitions: Readonly<Record<string, Flag>>;
  enabled(name: string, context?: EvaluationContext): boolean;
  variant(name: string, context?: EvaluationContext): string;
  evaluate(name: string, context?: EvaluationContext): boolean | string;
}

/** Build a TinyFlags client from a map of flag definitions. */
export function tinyFlags(definitions: Readonly<Record<string, Flag>>): TinyFlagsClient {
  if (
    definitions === null ||
    typeof definitions !== "object" ||
    Array.isArray(definitions)
  ) {
    throw new TypeError("tinyFlags requires a flag definition object");
  }

  const table = new Map<string, Flag>(Object.entries(definitions));

  const client: TinyFlagsClient = {
    definitions: Object.freeze(Object.fromEntries(table)),

    enabled(name, context = {}) {
      const flag = requireFlag(table, name);
      if (flag.kind !== "boolean") {
        throw new TypeError(`TinyFlags flag '${name}' is not a boolean flag`);
      }
      if (flag.rollout === undefined) return flag.default;
      return bucketFor(name, context) < flag.rollout;
    },

    variant(name, context = {}) {
      const flag = requireFlag(table, name);
      if (flag.kind !== "variant") {
        throw new TypeError(`TinyFlags flag '${name}' is not a variant flag`);
      }
      if (flag.rollout === undefined) return flag.default;

      const bucket = bucketFor(name, context);
      let upperBound = 0;
      for (const [variant, percentage] of Object.entries(flag.rollout)) {
        upperBound += percentage;
        if (bucket < upperBound) return variant;
      }
      return flag.default;
    },

    evaluate(name, context = {}) {
      const flag = requireFlag(table, name);
      return flag.kind === "boolean"
        ? client.enabled(name, context)
        : client.variant(name, context);
    },
  };

  return Object.freeze(client);
}

function requireFlag(table: Map<string, Flag>, name: string): Flag {
  const flag = table.get(name);
  if (flag === undefined) {
    throw new ReferenceError(`Unknown TinyFlags flag: ${name}`);
  }
  return flag;
}

function requirePercentage(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be an integer from 0 to 100`);
  }
  return value;
}

function normalizePercentage(value: number | undefined, label: string): number | undefined {
  return value === undefined ? undefined : requirePercentage(value, label);
}

function normalizeVariantRollout(
  rollout: Readonly<Record<string, number>> | undefined,
  variants: readonly string[],
): Readonly<Record<string, number>> | undefined {
  if (rollout === undefined) return undefined;
  if (rollout === null || typeof rollout !== "object" || Array.isArray(rollout)) {
    throw new TypeError("variantFlag rollout must be an object");
  }

  const normalized: Record<string, number> = {};
  let total = 0;

  for (const [variant, percentage] of Object.entries(rollout)) {
    if (!variants.includes(variant)) {
      throw new TypeError(`variantFlag rollout references unknown variant: ${variant}`);
    }
    normalized[variant] = requirePercentage(percentage, `rollout for '${variant}'`);
    total += normalized[variant];
  }

  if (total > 100) {
    throw new RangeError("variantFlag rollout percentages cannot exceed 100");
  }

  return Object.freeze(normalized);
}

// Callers without any identifier share a single "anonymous" bucket, so they
// either all see the rollout variant or none do. Pass a stable identifier
// (userId/accountId/sessionId) to get per-caller bucketing.
function bucketFor(name: string, context: EvaluationContext): number {
  const key = context.userId ?? context.accountId ?? context.sessionId ?? "anonymous";
  return hashString(`${name}:${key}`) % 100;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
