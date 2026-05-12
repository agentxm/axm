const BOOLEAN_FLAG = "boolean";
const VARIANT_FLAG = "variant";

export function booleanFlag(options = {}) {
  const defaultValue = options.default ?? false;
  if (typeof defaultValue !== "boolean") {
    throw new TypeError("booleanFlag default must be a boolean");
  }

  return Object.freeze({
    kind: BOOLEAN_FLAG,
    default: defaultValue,
    rollout: normalizePercentage(options.rollout, "booleanFlag rollout"),
  });
}

export function variantFlag(variants, options = {}) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new TypeError("variantFlag requires at least one variant");
  }

  const uniqueVariants = [...new Set(variants)];
  if (uniqueVariants.length !== variants.length || uniqueVariants.some((value) => value === "")) {
    throw new TypeError("variantFlag variants must be unique non-empty strings");
  }

  const defaultValue = options.default ?? variants[0];
  if (!uniqueVariants.includes(defaultValue)) {
    throw new TypeError("variantFlag default must be one of the variants");
  }

  const rollout = normalizeVariantRollout(options.rollout, uniqueVariants);

  return Object.freeze({
    kind: VARIANT_FLAG,
    variants: Object.freeze(uniqueVariants),
    default: defaultValue,
    rollout,
  });
}

export function createFlags(definitions) {
  if (definitions == null || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new TypeError("createFlags requires a flag definition object");
  }

  const table = new Map(Object.entries(definitions));

  return Object.freeze({
    enabled(name, context = {}) {
      const flag = requireFlag(table, name, BOOLEAN_FLAG);
      if (flag.rollout === undefined) return flag.default;
      return bucketFor(name, context) < flag.rollout;
    },

    variant(name, context = {}) {
      const flag = requireFlag(table, name, VARIANT_FLAG);
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
      return flag.kind === BOOLEAN_FLAG ? this.enabled(name, context) : this.variant(name, context);
    },

    definitions: Object.freeze(Object.fromEntries(table)),
  });
}

function requireFlag(table, name, expectedKind) {
  const flag = table.get(name);
  if (flag === undefined) {
    throw new ReferenceError(`Unknown TinyFlags flag: ${name}`);
  }

  if (expectedKind !== undefined && flag.kind !== expectedKind) {
    throw new TypeError(`TinyFlags flag '${name}' is not a ${expectedKind} flag`);
  }

  return flag;
}

function normalizePercentage(value, label) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be an integer from 0 to 100`);
  }
  return value;
}

function normalizeVariantRollout(rollout, variants) {
  if (rollout === undefined) return undefined;
  if (rollout == null || typeof rollout !== "object" || Array.isArray(rollout)) {
    throw new TypeError("variantFlag rollout must be an object");
  }

  const normalized = {};
  let total = 0;

  for (const [variant, percentage] of Object.entries(rollout)) {
    if (!variants.includes(variant)) {
      throw new TypeError(`variantFlag rollout references unknown variant: ${variant}`);
    }

    normalized[variant] = normalizePercentage(percentage, `rollout for '${variant}'`);
    total += normalized[variant];
  }

  if (total > 100) {
    throw new RangeError("variantFlag rollout percentages cannot exceed 100");
  }

  return Object.freeze(normalized);
}

function bucketFor(name, context) {
  const key = context.userId ?? context.accountId ?? context.sessionId ?? "anonymous";
  return hashString(`${name}:${key}`) % 100;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
