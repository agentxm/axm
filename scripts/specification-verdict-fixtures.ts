/** Controlled receipts and requirements for verdict verification. */
import type { SpecificationMetadata } from "@agentxm/specification-metadata";
import { digestSpecificationSource } from "./specification-catalog-lib.js";
import { type EvidenceFile, type EvidenceRun } from "./specification-evidence.js";
import type { VerdictEvidence, VerdictSource } from "./specification-verdict-lib.js";

export const FIXTURE_SOURCE_PATH =
  "packages/core/extension-lifecycle/src/install/installs-selected-extension.spec.ts";

export interface FixtureLocation {
  readonly owner?: string;
  readonly source?: string;
}

/**
 * A specification whose digests are derived from `content` exactly as the
 * verdict derives them: the example surface from `describe`/`it` titles
 * and `each` rows, the body from the comment-free AST.
 */
export const fixtureSource = (
  content = 'describe("Install", () => { it("installs the selected extension", () => {}); });',
  overrides: Partial<SpecificationMetadata> = {},
  location: FixtureLocation = {},
): VerdictSource =>
  digestSpecificationSource(
    {
      metadata: {
        requirement: "cli/install/installs-selected-extension",
        title: "Install installs the selected extension",
        statement: "When a person installs an extension, AXM shall install the selected extension.",
        class: "functional",
        role: "experience",
        goals: ["extension-adoption"],
        methods: ["example"],
        derivedFrom: [],
        supersedes: [],
        assumptions: [],
        openQuestions: [],
        ...overrides,
      },
      boundEvidence: [],
      owner: location.owner ?? "extension-lifecycle",
      source: location.source ?? FIXTURE_SOURCE_PATH,
    },
    content,
  );
export const fixtureInputs = {
  sourceDigest: "source-inputs",
  runtimeDigest: "built-inputs",
  runtimeMode: "built",
  revision: "recorded-revision",
} as const;
export const fixtureSourceInputs = {
  ...fixtureInputs,
  runtimeDigest: fixtureInputs.sourceDigest,
  runtimeMode: "source",
} as const;
export const fixtureRun = (
  file: Partial<EvidenceFile> = {},
  overrides: Partial<EvidenceRun> = {},
): EvidenceRun => {
  const source = fixtureSource();
  const result: EvidenceFile = {
    source: source.specification.source,
    owner: source.specification.owner,
    purpose: "specification",
    contentDigest: source.contentDigest,
    tests: 3,
    passed: 3,
    failed: 0,
    skipped: 0,
    pending: 0,
    moduleFailed: false,
    filtered: false,
    ...file,
  };
  return {
    format: 2,
    suite: "extension-lifecycle",
    startedAt: "2026-09-05T10:00:00Z",
    finishedAt: "2026-09-05T10:01:00Z",
    inputs: fixtureInputs,
    inputsStable: true,
    environment: { node: "v24.0.0", platform: "linux", architecture: "x64" },
    selection: [result.source],
    complete: true,
    unhandledErrors: 0,
    files: [result],
    ...overrides,
  };
};
export const fixtureContext = (overrides: Partial<VerdictEvidence> = {}): VerdictEvidence => ({
  inputs: fixtureInputs,
  sourceInputs: fixtureSourceInputs,
  runs: [fixtureRun()],
  executionBindings: [],
  sourceDigests: new Map(),
  implementationChanges: [],
  issues: [],
  ...overrides,
});
