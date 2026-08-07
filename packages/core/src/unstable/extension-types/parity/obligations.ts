/**
 * Parity obligations — the per-type surfaces every catalog extension type is
 * expected to carry.
 *
 * An obligation is a statement about one axis of the platform ("a lock entry
 * accepts `sourceHash`", "the CLI registers a renderer entity") that must hold
 * for *every* member of {@link CATALOG_EXTENSION_TYPES}. Each obligation is
 * mechanically verified by a conformance suite; a type that does not meet one
 * yet must carry a matching row in the exemption ledger (`exemptions.ts`).
 *
 * Obligation ids are stable strings: `<area>.<n>-<label>`. They appear in
 * ledger rows, conformance-failure messages, and skipped e2e titles, so
 * renaming one is a breaking change to every reference.
 *
 * @experimental This API is unstable and may change without notice.
 */

/**
 * Suite that mechanically verifies an obligation. Each conformance suite can
 * only observe its own tier, so every suite filters the ledger by this
 * discriminator before comparing against what it observed.
 */
export const OBLIGATION_TIERS = ["core-test", "cli-test", "e2e"] as const;

/** @experimental This API is unstable and may change without notice. */
export type ObligationTier = (typeof OBLIGATION_TIERS)[number];

/** @experimental This API is unstable and may change without notice. */
export const OBLIGATION_IDS = [
  "2.6-source-hash",
  "2.9-read-model-family",
  "2.11-ownership-safe-prune",
  "2.12-workspace-reconciliation",
  "2.13-transactional-postcondition",
  "6.1-e2e-install-row",
  "6.2-lifecycle-postconditions",
  "6.3-preview-apply-equivalence",
  "6.4-idempotent-validity",
  "6.5-scope-isolation",
  "6.6-pack-reachability",
  "7.1-help-topic",
  "8.6-entity-key",
  "8.7-lifecycle-verbs",
  "8.8-lifecycle-flags",
  "8.9-scope-surface",
] as const;

/** @experimental This API is unstable and may change without notice. */
export type ObligationId = (typeof OBLIGATION_IDS)[number];

/** @experimental This API is unstable and may change without notice. */
export interface ObligationDef {
  readonly id: ObligationId;
  /** What the type must provide, phrased so a failure message reads as a gap. */
  readonly description: string;
  readonly verifiedBy: ObligationTier;
}

/** @experimental This API is unstable and may change without notice. */
export const PARITY_OBLIGATIONS = {
  "2.6-source-hash": {
    id: "2.6-source-hash",
    description:
      "The type's lock entry accepts an advisory sourceHash on non-workspace source variants, " +
      "so update reporting can tell changed content from unchanged content.",
    verifiedBy: "core-test",
  },
  "2.9-read-model-family": {
    id: "2.9-read-model-family",
    description:
      "The workspace read model exposes an extensions family for the type, so declared, " +
      "actual, and resolved rows are reconcilable without a bespoke scan.",
    verifiedBy: "core-test",
  },
  "2.11-ownership-safe-prune": {
    id: "2.11-ownership-safe-prune",
    description:
      "The type participates in the uniform read-model inventory consumed by ownership-safe " +
      "root pruning, so unknown artifacts can be reported without being deleted.",
    verifiedBy: "core-test",
  },
  "2.12-workspace-reconciliation": {
    id: "2.12-workspace-reconciliation",
    description:
      "The type has an explicit workspace reconciliation contract covering canonical " +
      "content, projections, and every supported source class.",
    verifiedBy: "core-test",
  },
  "2.13-transactional-postcondition": {
    id: "2.13-transactional-postcondition",
    description:
      "Every lifecycle mutation participates in the shared transaction boundary and validates " +
      "its durable postcondition before receipt history is written.",
    verifiedBy: "core-test",
  },
  "6.1-e2e-install-row": {
    id: "6.1-e2e-install-row",
    description:
      "The cli-e2e install matrix drives a real publish-then-install round trip for the type.",
    verifiedBy: "e2e",
  },
  "6.2-lifecycle-postconditions": {
    id: "6.2-lifecycle-postconditions",
    description:
      "The distribution e2e matrix drives enable, disable, and uninstall through clean " +
      "workspace postconditions for the type.",
    verifiedBy: "e2e",
  },
  "6.3-preview-apply-equivalence": {
    id: "6.3-preview-apply-equivalence",
    description:
      "Lifecycle preview is side-effect free and reports the same plan steps that apply executes.",
    verifiedBy: "e2e",
  },
  "6.4-idempotent-validity": {
    id: "6.4-idempotent-validity",
    description:
      "A successful lifecycle mutation leaves lint and status clean, and its aligned second run " +
      "does not corrupt workspace state.",
    verifiedBy: "e2e",
  },
  "6.5-scope-isolation": {
    id: "6.5-scope-isolation",
    description:
      "Project and user installed-state views are isolated for the type, with unsupported " +
      "materialization refused by the selected agent capability.",
    verifiedBy: "e2e",
  },
  "6.6-pack-reachability": {
    id: "6.6-pack-reachability",
    description:
      "The type remains correct when reached directly, only through a pack, shared by both, " +
      "and disabled while retained.",
    verifiedBy: "e2e",
  },
  "7.1-help-topic": {
    id: "7.1-help-topic",
    description:
      "`axm help <plural>` resolves to a prose topic for the type, not only a generated " +
      "schema topic.",
    verifiedBy: "cli-test",
  },
  "8.6-entity-key": {
    id: "8.6-entity-key",
    description:
      "The CLI renderer registers a list entity keyed by the type id, so table and JSON " +
      "rendering is uniform across types.",
    verifiedBy: "cli-test",
  },
  "8.7-lifecycle-verbs": {
    id: "8.7-lifecycle-verbs",
    description:
      "The CLI type group registers update, enable, and disable lifecycle verbs, with " +
      "container-placement types free to route those verbs through container-specific planners.",
    verifiedBy: "cli-test",
  },
  "8.8-lifecycle-flags": {
    id: "8.8-lifecycle-flags",
    description:
      "Every lifecycle mutation exposes preview and only behavior-specific safety controls; " +
      "removed generic aliases are unreachable.",
    verifiedBy: "cli-test",
  },
  "8.9-scope-surface": {
    id: "8.9-scope-surface",
    description: "Every installed-state lifecycle command exposes the project/user scope selector.",
    verifiedBy: "cli-test",
  },
} as const satisfies Record<ObligationId, ObligationDef>;

/** Obligation ids a given conformance suite is responsible for verifying. */
export const obligationsVerifiedBy = (tier: ObligationTier): ReadonlyArray<ObligationId> =>
  OBLIGATION_IDS.filter((id) => PARITY_OBLIGATIONS[id].verifiedBy === tier);
