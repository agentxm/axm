/**
 * Exhaustive restoring-transition contracts for shipped lint errors and
 * operation blockers. The registry is deliberately test-only: product code
 * owns the executable identifier inventories, while this suite owns recovery
 * evidence.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allCatalogErrorRuleIds } from "@agentxm/workspace-lint";
import {
  aggregateOwnershipUnits,
  INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
  type AggregateOwnershipUnitId,
} from "@agentxm/workspace-projection";
import { syncRecoveryIdentifiers } from "@agentxm/workspace-sync";
import { packUninstallRecoveryIdentifiers } from "@agentxm/extension-lifecycle";

type RecoveryOwner = "sync" | "intent-command" | "direct-correction" | "manual-preservation";
type StateField =
  "authoredIntent" | "lockAuthority" | "canonicalContent" | "ownedProjection" | "unownedContent";

interface RecoveryState {
  readonly revisions: Readonly<Record<StateField, number>>;
  readonly diagnostics: ReadonlyArray<string>;
  readonly suppressedDiagnostics: ReadonlyArray<string>;
}

interface RecoveryConformanceEntry {
  readonly id: string;
  readonly authoritativeInputs: ReadonlyArray<StateField>;
  readonly validBaseState: RecoveryState;
  readonly perturbationField: StateField;
  readonly expectedDiagnostics: ReadonlyArray<string>;
  readonly suppressedDiagnostics: ReadonlyArray<string>;
  readonly recoveryOwner: RecoveryOwner;
  readonly permittedStateDelta: ReadonlyArray<StateField>;
  readonly forbiddenEffects: ReadonlyArray<StateField>;
  readonly postRecoveryDiagnostics: ReadonlyArray<string>;
  readonly postRecoveryState: RecoveryState;
  readonly evidence: ReadonlyArray<string>;
  readonly aggregateCoverage?: Readonly<
    Partial<Record<AggregateOwnershipUnitId, ReadonlyArray<string>>>
  >;
}

interface RecoveryEntryOptions {
  readonly owner: RecoveryOwner;
  readonly field: StateField;
  readonly evidence: ReadonlyArray<string>;
  readonly suppressed?: ReadonlyArray<string>;
  readonly aggregateCoverage?: RecoveryConformanceEntry["aggregateCoverage"];
}

const stateFields: ReadonlyArray<StateField> = [
  "authoredIntent",
  "lockAuthority",
  "canonicalContent",
  "ownedProjection",
  "unownedContent",
];

const validBaseState = (): RecoveryState => ({
  revisions: {
    authoredIntent: 0,
    lockAuthority: 0,
    canonicalContent: 0,
    ownedProjection: 0,
    unownedContent: 0,
  },
  diagnostics: [],
  suppressedDiagnostics: [],
});

const makeEntry = (id: string, options: RecoveryEntryOptions): RecoveryConformanceEntry => ({
  id,
  authoritativeInputs: stateFields,
  validBaseState: validBaseState(),
  perturbationField: options.field,
  expectedDiagnostics: [id],
  suppressedDiagnostics: options.suppressed ?? [],
  recoveryOwner: options.owner,
  permittedStateDelta: [options.field],
  forbiddenEffects: stateFields.filter((field) => field !== options.field),
  postRecoveryDiagnostics: [],
  postRecoveryState: validBaseState(),
  evidence: options.evidence,
  ...(options.aggregateCoverage === undefined
    ? {}
    : { aggregateCoverage: options.aggregateCoverage }),
});

const packageLintEvidence = (id: string): ReadonlyArray<string> => {
  if (id.startsWith("skill/")) {
    return ["packages/core/workspace-lint/src/catalog/skill.fixtures.test.ts"];
  }
  if (id.startsWith("pack/")) {
    return ["packages/core/workspace-lint/src/catalog/pack.fixtures.test.ts"];
  }
  if (id.startsWith("knowledge/")) {
    return ["packages/core/workspace-lint/src/catalog/knowledge.test.ts"];
  }
  return ["tools/extension-type-parity/src/parity.test.ts"];
};

const packageLintErrorIds = [
  "skill/skill-md-present",
  "skill/manifest-present",
  "skill/frontmatter-parseable",
  "skill/frontmatter-standard-valid",
  "skill/manifest-schema-valid",
  "skill/manifest-keys-recognized",
  "pack/manifest-present",
  "pack/manifest-schema-valid",
  "pack/manifest-keys-recognized",
  "subagent/manifest-present",
  "subagent/manifest-schema-valid",
  "subagent/manifest-keys-recognized",
  "mcp-server/manifest-present",
  "mcp-server/manifest-schema-valid",
  "mcp-server/manifest-keys-recognized",
  "hook/manifest-present",
  "hook/manifest-schema-valid",
  "hook/manifest-keys-recognized",
  "hook/entrypoint-exists",
  "rule/manifest-present",
  "rule/manifest-schema-valid",
  "rule/manifest-keys-recognized",
  "knowledge/manifest-present",
  "knowledge/manifest-schema-valid",
  "knowledge/manifest-keys-recognized",
  "knowledge/bundle-too-large",
  "knowledge/file-too-large",
  "knowledge/invalid-tags",
  "knowledge/missing-root-index",
  "knowledge/missing-okf-version",
  "knowledge/symbolic-link",
  "knowledge/too-many-files",
  "knowledge/unsupported-okf-version",
  "knowledge/missing-type",
  "knowledge/invalid-frontmatter",
  "knowledge/case-collision",
  "knowledge/dangerous-uri",
  "knowledge/detected-secret",
  "knowledge/unsafe-path",
  "knowledge/invalid-index",
  "knowledge/invalid-log",
  "knowledge/invalid-resource",
  "knowledge/escaping-resource",
  "knowledge/invalid-sources",
  "knowledge/invalid-generated",
  "knowledge/invalid-verified",
  "knowledge/invalid-status",
  "knowledge/invalid-stale-after",
  "knowledge/invalid-attestation",
] as const;

const packageLintEntries = packageLintErrorIds.map((id) =>
  makeEntry(id, {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: packageLintEvidence(id),
  }),
);

const workspaceEvidence = [
  "packages/core/workspace-lint/src/catalog/workspace/workspace-rule-conformance.test.ts",
  "apps/cli/src/root/lint/handler.test.ts",
] as const;

const aggregateCoverage = {
  "rule:instructions-region": [
    "packages/core/extension-materialization/src/rules/manager.graph-projection.test.ts",
  ],
  "hook:agent-hook-entries": [
    "packages/core/extension-materialization/src/hooks/manager.graph-projection.test.ts",
  ],
  "hook:fallback-region": [
    "packages/core/extension-materialization/src/hooks/manager.graph-projection.test.ts",
  ],
  "knowledge:discovery-region": [
    "packages/core/extension-materialization/src/knowledge/manager.graph-projection.test.ts",
  ],
} as const satisfies Readonly<Partial<Record<AggregateOwnershipUnitId, ReadonlyArray<string>>>>;

const workspaceLintEntries: ReadonlyArray<RecoveryConformanceEntry> = [
  makeEntry("workspace/initialized", {
    owner: "intent-command",
    field: "authoredIntent",
    evidence: workspaceEvidence,
    suppressed: ["workspace/settings-schema-valid", "workspace/lockfile-valid"],
  }),
  makeEntry("workspace/settings-schema-valid", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
    suppressed: ["workspace/settings-keys-recognized", "workspace/desired-state-reconcilable"],
  }),
  makeEntry("workspace/settings-keys-recognized", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/lockfile-valid", {
    owner: "sync",
    field: "lockAuthority",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/desired-state-reconcilable", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/axm-skill-compatible", {
    owner: "sync",
    field: "canonicalContent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/agents-recognized", {
    owner: "intent-command",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/instructions-source-present", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/projection-ownership-valid", {
    owner: "direct-correction",
    field: "ownedProjection",
    evidence: [
      "apps/cli/src/root/sync/handler.test.ts",
      "packages/core/workspace-projection/src/invariant-facts.test.ts",
    ],
  }),
  makeEntry("workspace/skills-declarations-valid", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/packs-declarations-valid", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/configured-but-not-installed", {
    owner: "sync",
    field: "canonicalContent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/knowledge-state-valid", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/skills-lockfile-aligned", {
    owner: "sync",
    field: "lockAuthority",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/source-endpoints-aligned", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: [
      "packages/core/workspace-lint/src/catalog/workspace/conformance/reconciliation/test-helpers.ts",
    ],
  }),
  makeEntry("workspace/skills-integrity-valid", {
    owner: "sync",
    field: "canonicalContent",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/skills-artifacts-correct", {
    owner: "sync",
    field: "ownedProjection",
    evidence: workspaceEvidence,
  }),
  makeEntry("workspace/packs-dependencies-resolved", {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: workspaceEvidence,
  }),
];

const syncEvidence = ["apps/cli/src/root/sync/handler.test.ts"] as const;
const syncEntries: ReadonlyArray<RecoveryConformanceEntry> = [
  makeEntry("pack:manifest-divergence", {
    owner: "sync",
    field: "canonicalContent",
    evidence: ["apps/cli/src/root/sync/handler.test.ts"],
  }),
  makeEntry("extension:constraint-mismatch", {
    owner: "sync",
    field: "lockAuthority",
    evidence: [
      "packages/core/workspace-projection/src/constraint-invariant-fact.test.ts",
      "apps/cli/src/root/sync/handler.test.ts",
    ],
  }),
  makeEntry(INCOMPLETE_DESIRED_STATE_BLOCKER_ID, {
    owner: "direct-correction",
    field: "authoredIntent",
    evidence: [
      "packages/core/workspace-projection/src/planning.test.ts",
      "apps/cli/src/root/sync/handler.test.ts",
    ],
  }),
  makeEntry("mcp-server:inline", {
    owner: "manual-preservation",
    field: "unownedContent",
    evidence: syncEvidence,
  }),
  makeEntry("hook:projections", {
    owner: "sync",
    field: "ownedProjection",
    evidence: syncEvidence,
  }),
  makeEntry("instruction:reconcile", {
    owner: "sync",
    field: "ownedProjection",
    evidence: syncEvidence,
  }),
];

const packUninstallEntries: ReadonlyArray<RecoveryConformanceEntry> =
  packUninstallRecoveryIdentifiers.map((id) =>
    makeEntry(id, {
      owner: "direct-correction",
      field: "canonicalContent",
      // The blocker and its recovery now live with the uninstall use case:
      // that specification blocks on an incomplete graph, retires the
      // unreadable pack when every other pack is intact, and reaches the same
      // decision in preview and apply.
      evidence: [
        "packages/core/extension-lifecycle/src/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts",
      ],
    }),
  );

const recoveryRegistry: ReadonlyArray<RecoveryConformanceEntry> = [
  ...packageLintEntries,
  ...workspaceLintEntries,
  ...syncEntries,
  ...packUninstallEntries,
];

const adversarialContracts = [
  ["handled-failure-leaves-no-partial-closure", "apps/cli/src/root/sync/handler.test.ts"],
  ["unrelated-invalid-closure-allows-progress", "apps/cli/src/root/sync/handler.test.ts"],
  [
    "authored-and-unowned-content-preserved",
    "packages/core/workspace-transactions/src/transaction.test.ts",
  ],
  [
    "aggregate-contributors-survive-lifecycle",
    "packages/core/extension-materialization/src/rules/manager.graph-projection.test.ts",
  ],
  ["sync-preserves-intent-and-satisfying-lock", "apps/cli/src/root/sync/handler.test.ts"],
  ["lint-fix-does-no-lifecycle-work", "apps/cli/src/root/lint/handler.test.ts"],
  [
    "stale-and-concurrent-plans-do-not-interleave",
    "packages/core/workspace-projection/src/planning.test.ts",
  ],
  [
    "publication-interruption-converges",
    "packages/core/extension-materialization/src/extensions/canonical-directory.test.ts",
  ],
  [
    "formatter-drift-remains-projectable",
    "packages/core/extension-materialization/src/knowledge/manager.test.ts",
  ],
  // A Registry that rebinds an accepted extension to a different publisher is
  // the divergent external replacement; the acceptance path both install and
  // update take reports it as an interactive-only risk before writing.
  [
    "divergent-external-replacement-is-disclosed",
    "packages/core/extension-lifecycle/src/install/preview-is-pure.spec.ts",
  ],
  ["global-sync-reports-local-outcomes", "apps/cli/src/root/sync/handler.test.ts"],
  [
    "lock-only-pack-members-do-not-create-reachability",
    "packages/core/workspace-state/src/workspace/desired-state-graph.test.ts",
  ],
  [
    "invalid-lock-authority-is-not-reconstructed",
    "packages/core/workspace-state/src/lockfile/authority-schema.test.ts",
  ],
  [
    "older-lockfile-gate-names-reacceptance",
    "packages/core/workspace-sync/src/lockfile-rejections-name-recovery-routes.spec.ts",
  ],
  [
    "newer-lockfile-gate-names-upgrade",
    "packages/core/workspace-state/src/workspace/invalid-workspace-state-gates-operations.spec.ts",
  ],
  // A local source is mutable: that specification installs one, changes its
  // content, restores it, and shows the recorded identity return to its
  // original value rather than drifting.
  [
    "mutable-source-identity-is-stable",
    "packages/core/extension-lifecycle/src/install/records-accepted-resolution.spec.ts",
  ],
  ["unsupported-state-is-rejected", "packages/core/workspace-state/src/settings/schema.test.ts"],
  [
    "pack-uninstall-readiness-agrees-with-apply",
    "packages/core/extension-lifecycle/src/uninstall/retires-a-desired-pack-whose-package-is-unreadable.spec.ts",
  ],
] as const;

const perturb = (entry: RecoveryConformanceEntry, state: RecoveryState): RecoveryState => ({
  ...state,
  revisions: {
    ...state.revisions,
    [entry.perturbationField]: state.revisions[entry.perturbationField] + 1,
  },
  diagnostics: entry.expectedDiagnostics,
  suppressedDiagnostics: entry.suppressedDiagnostics,
});

const diagnose = (entry: RecoveryConformanceEntry, state: RecoveryState): ReadonlyArray<string> =>
  state.revisions[entry.perturbationField] === 0 ? [] : entry.expectedDiagnostics;

const recover = (entry: RecoveryConformanceEntry, state: RecoveryState): RecoveryState => {
  if (diagnose(entry, state).length === 0) return state;
  return {
    ...state,
    revisions: { ...state.revisions, [entry.perturbationField]: 0 },
    diagnostics: entry.postRecoveryDiagnostics,
    suppressedDiagnostics: [],
  };
};

const changedFields = (before: RecoveryState, after: RecoveryState): ReadonlyArray<StateField> =>
  stateFields.filter((field) => before.revisions[field] !== after.revisions[field]);

const missingRecoveryIds = (
  lintErrorIds: ReadonlyArray<string>,
  syncIds: ReadonlyArray<string>,
  uninstallIds: ReadonlyArray<string>,
  registry: ReadonlyArray<RecoveryConformanceEntry>,
): ReadonlyArray<string> => {
  const registered = new Set(registry.map(({ id }) => id));
  return [...lintErrorIds, INCOMPLETE_DESIRED_STATE_BLOCKER_ID, ...syncIds, ...uninstallIds].filter(
    (id) => !registered.has(id),
  );
};

const repositoryRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);

describe("recovery-conformance registry", () => {
  it("registers every shipped lint error and operation blocker exactly once", () => {
    expect(
      missingRecoveryIds(
        allCatalogErrorRuleIds,
        syncRecoveryIdentifiers,
        packUninstallRecoveryIdentifiers,
        recoveryRegistry,
      ),
    ).toEqual([]);
    const ids = recoveryRegistry.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const shipped = new Set([
      ...allCatalogErrorRuleIds,
      INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
      ...syncRecoveryIdentifiers,
      ...packUninstallRecoveryIdentifiers,
    ]);
    expect(ids.filter((id) => !shipped.has(id))).toEqual([]);
  });

  it("fails completeness for a test-only injected error rule", () => {
    expect(
      missingRecoveryIds(
        [...allCatalogErrorRuleIds, "workspace/test-only-injected-error"],
        syncRecoveryIdentifiers,
        packUninstallRecoveryIdentifiers,
        recoveryRegistry,
      ),
    ).toEqual(["workspace/test-only-injected-error"]);
  });

  it.each(recoveryRegistry)("executes the restoring transition for $id", (entry) => {
    const invalid = perturb(entry, entry.validBaseState);
    expect(diagnose(entry, invalid)).toEqual(entry.expectedDiagnostics);
    expect(invalid.suppressedDiagnostics).toEqual(entry.suppressedDiagnostics);

    const restored = recover(entry, invalid);
    expect(changedFields(invalid, restored)).toEqual(entry.permittedStateDelta);
    for (const forbidden of entry.forbiddenEffects) {
      expect(restored.revisions[forbidden]).toBe(invalid.revisions[forbidden]);
    }
    expect(diagnose(entry, restored)).toEqual(entry.postRecoveryDiagnostics);
    expect(restored.diagnostics).toEqual(entry.postRecoveryDiagnostics);
    expect(restored).toEqual(entry.postRecoveryState);
    expect(recover(entry, restored)).toEqual(restored);
  });

  it("binds every recovery contract to executable behavior evidence", () => {
    for (const entry of recoveryRegistry) {
      expect(entry.authoritativeInputs.length, entry.id).toBeGreaterThan(0);
      expect(entry.evidence.length, entry.id).toBeGreaterThan(0);
      for (const relativePath of entry.evidence) {
        expect(nodeFs.existsSync(nodePath.join(repositoryRoot, relativePath)), relativePath).toBe(
          true,
        );
      }
    }
  });

  it("binds every aggregate projection to multi-route executable coverage", () => {
    const coverage = aggregateCoverage;
    for (const unit of aggregateOwnershipUnits) {
      const paths = coverage[unit.unitId];
      expect(paths, unit.unitId).toBeDefined();
      for (const relativePath of paths ?? []) {
        const absolutePath = nodePath.join(repositoryRoot, relativePath);
        expect(nodeFs.existsSync(absolutePath), relativePath).toBe(true);
        const source = nodeFs.readFileSync(absolutePath, "utf8");
        expect(source.includes("pack-a") && source.includes("pack-b"), relativePath).toBe(true);
      }
    }
    const declared: ReadonlySet<string> = new Set(
      aggregateOwnershipUnits.map(({ unitId }) => unitId),
    );
    for (const unitId of Object.keys(coverage)) {
      expect(declared.has(unitId), unitId).toBe(true);
    }
  });

  it("registers every cross-cutting adversarial property with executable evidence", () => {
    const ids = adversarialContracts.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, relativePath] of adversarialContracts) {
      expect(id.length).toBeGreaterThan(0);
      expect(nodeFs.existsSync(nodePath.join(repositoryRoot, relativePath)), relativePath).toBe(
        true,
      );
    }
  });
});
