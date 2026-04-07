/**
 * Lossy rendering warning types and collector utility.
 *
 * When rendering a portable command to an agent-native format, some features
 * may not be supported. Warnings are accumulated during a render pass and
 * reported to the user at install time.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * A warning emitted when a portable feature cannot be faithfully represented
 * in an agent's native command format.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LossyRenderingWarning {
  /** Agent identifier that triggered the warning. */
  readonly agent: string;
  /** Feature that could not be rendered (e.g., "model", "allowedTools"). */
  readonly feature: string;
  /** Human-readable explanation. */
  readonly message: string;
}

/**
 * Collector for accumulating lossy rendering warnings during a render pass.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WarningCollector {
  /** Add a warning to the collection. */
  readonly add: (warning: LossyRenderingWarning) => void;
  /** Get all accumulated warnings. */
  readonly getWarnings: () => ReadonlyArray<LossyRenderingWarning>;
  /** Return deduplicated warnings (same agent + feature = single entry). */
  readonly deduplicate: () => ReadonlyArray<LossyRenderingWarning>;
}

/**
 * Create a new warning collector for a render pass.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createWarningCollector = (): WarningCollector => {
  const warnings: Array<LossyRenderingWarning> = [];

  return {
    add: (warning) => {
      warnings.push(warning);
    },
    getWarnings: () => [...warnings],
    deduplicate: () => {
      const seen = new Set<string>();
      const result: Array<LossyRenderingWarning> = [];
      for (const w of warnings) {
        const key = `${w.agent}:${w.feature}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(w);
        }
      }
      return result;
    },
  };
};
