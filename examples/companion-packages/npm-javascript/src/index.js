// @ts-check

/**
 * @typedef {object} BooleanFlag
 * @property {"boolean"} kind
 * @property {boolean} default
 * @property {number} [rollout] Integer percentage in [0, 100].
 */

/**
 * @typedef {object} VariantFlag
 * @property {"variant"} kind
 * @property {readonly string[]} variants
 * @property {string} default
 * @property {Readonly<Record<string, number>>} [rollout]
 */

/** @typedef {BooleanFlag | VariantFlag} Flag */

/**
 * @typedef {object} EvaluationContext
 * @property {string} [userId]
 * @property {string} [accountId]
 * @property {string} [sessionId]
 */

/**
 * @param {{ default?: boolean, rollout?: number }} [options]
 * @returns {BooleanFlag}
 */
export function booleanFlag(options = {}) {
  const defaultValue = options.default ?? false;
  if (typeof defaultValue !== "boolean") {
    throw new TypeError("booleanFlag default must be a boolean");
  }

  return Object.freeze({
    kind: /** @type {const} */ ("boolean"),
    default: defaultValue,
    rollout: normalizePercentage(options.rollout, "booleanFlag rollout"),
  });
}

/**
 * @param {readonly string[]} variants
 * @param {{ default?: string, rollout?: Record<string, number> }} [options]
 * @returns {VariantFlag}
 */
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
    kind: /** @type {const} */ ("variant"),
    variants: Object.freeze(uniqueVariants),
    default: defaultValue,
    rollout,
  });
}

/**
 * @param {Record<string, Flag>} definitions
 */
export function createFlags(definitions) {
  if (definitions == null || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new TypeError("createFlags requires a flag definition object");
  }

  const table = new Map(Object.entries(definitions));

  return Object.freeze({
    /**
     * @param {string} name
     * @param {EvaluationContext} [context]
     * @returns {boolean}
     */
    enabled(name, context = {}) {
      const flag = requireFlag(table, name);
      if (flag.kind !== "boolean") {
        throw new TypeError(`TinyFlags flag '${name}' is not a boolean flag`);
      }
      if (flag.rollout === undefined) return flag.default;
      return bucketFor(name, context) < flag.rollout;
    },

    /**
     * @param {string} name
     * @param {EvaluationContext} [context]
     * @returns {string}
     */
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

    /**
     * @param {string} name
     * @param {EvaluationContext} [context]
     * @returns {boolean | string}
     */
    evaluate(name, context = {}) {
      const flag = requireFlag(table, name);
      return flag.kind === "boolean" ? this.enabled(name, context) : this.variant(name, context);
    },

    definitions: Object.freeze(Object.fromEntries(table)),
  });
}

/**
 * @param {Map<string, Flag>} table
 * @param {string} name
 * @returns {Flag}
 */
function requireFlag(table, name) {
  const flag = table.get(name);
  if (flag === undefined) {
    throw new ReferenceError(`Unknown TinyFlags flag: ${name}`);
  }
  return flag;
}

/**
 * @param {number} value
 * @param {string} label
 * @returns {number}
 */
function requirePercentage(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be an integer from 0 to 100`);
  }
  return value;
}

/**
 * @param {number | undefined} value
 * @param {string} label
 * @returns {number | undefined}
 */
function normalizePercentage(value, label) {
  return value === undefined ? undefined : requirePercentage(value, label);
}

/**
 * @param {Record<string, number> | undefined} rollout
 * @param {readonly string[]} variants
 * @returns {Readonly<Record<string, number>> | undefined}
 */
function normalizeVariantRollout(rollout, variants) {
  if (rollout === undefined) return undefined;
  if (rollout == null || typeof rollout !== "object" || Array.isArray(rollout)) {
    throw new TypeError("variantFlag rollout must be an object");
  }

  /** @type {Record<string, number>} */
  const normalized = {};
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
/**
 * @param {string} name
 * @param {EvaluationContext} context
 * @returns {number}
 */
function bucketFor(name, context) {
  const key = context.userId ?? context.accountId ?? context.sessionId ?? "anonymous";
  return hashString(`${name}:${key}`) % 100;
}

/**
 * @param {string} value
 * @returns {number}
 */
function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
