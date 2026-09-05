/** Controlled receipts and requirements for verdict verification. */
import type { SpecificationMetadata } from "@agentxm/extension-model/unstable/specifications";
import { digestContent, type EvidenceFile, type EvidenceRun } from "./specification-evidence.js";
import type { VerdictEvidence, VerdictSource } from "./specification-verdict-lib.js";

export const fixtureSource = (
  content = "specification source",
  overrides: Partial<SpecificationMetadata> = {},
): VerdictSource => ({
  specification: {
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
    source: "specifications/cli/install/installs-selected-extension.spec.ts",
  },
  contentDigest: digestContent(content),
});
export const fixtureInputs = {
  sourceDigest: "source-inputs",
  runtimeDigest: "built-inputs",
  revision: "recorded-revision",
};
export const fixtureRun = (
  file: Partial<EvidenceFile> = {},
  overrides: Partial<EvidenceRun> = {},
): EvidenceRun => {
  const source = fixtureSource();
  const result = {
    source: source.specification.source,
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
    format: 1,
    suite: "specifications",
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
  runs: [fixtureRun()],
  executionBindings: [],
  sourceDigests: new Map(),
  implementationChanges: [],
  issues: [],
  ...overrides,
});
