import * as Schema from "effect/Schema";

import {
  LocalCheckDocumentSchema,
  LocalInspectionDocumentSchema,
  type LocalCheckDocument,
  type LocalInspectionDocument,
} from "@agentxm/workspace-features/inspection";

/**
 * Local inspection and check documents for the gallery, decoded through
 * their published schemas so a sample can never drift from what the commands
 * actually receive.
 */

const complete = { state: "complete", reasons: [] } as const;

const skillItem = (name: string, observed: "present" | "absent") => ({
  id: `subject-${name}`,
  identity: {
    type: "skill",
    name,
    fqn: `@acme/skills/${name}`,
    scope: "project",
    source: {
      authority: "registry",
      sourceName: "agentxm",
      endpoint: "https://registry.agentxm.ai",
    },
  },
  requestRefs: ["request-1"],
  editing: { kind: "unavailable", reason: "Registry content is edited at its source" },
  desired: {
    state: "reached",
    direct: true,
    enabled: true,
    packOrigins: [],
    declarations: [
      {
        kind: "direct",
        address: { path: "axm.json", keys: ["skills", name] },
        enabled: true,
      },
    ],
    coverage: complete,
  },
  accepted: { state: "present", version: "1.4.0", coverage: complete },
  observed: {
    state: observed,
    ...(observed === "present"
      ? {
          path: `agent_extensions/registry.agentxm.ai/@acme/skills/${name}`,
          manifestVersion: "1.4.0",
        }
      : {}),
    drift: observed === "present" ? "not-detected" : "not-checked",
    coverage: complete,
  },
  retention: {
    reasons: [{ kind: "direct-declaration", detail: "Declared directly in axm.json" }],
    coverage: complete,
  },
  nativeLocationRefs: [],
  duplicateDiscoveries: [],
  nativeCoverage: { state: "partial", reasons: ["Native locations were not observed"] },
  agents: { configured: ["claude-code", "codex"], observed: ["claude-code"] },
  agentOutcomes: [],
  runtime: { state: "not-checked" },
});

const inspection = (observed: "present" | "absent") => ({
  scope: "project",
  requests: [
    {
      id: "request-1",
      kind: "identity",
      input: "@acme/skills/code-review",
      resolution: "resolved",
      code: 0,
      subjectRefs: ["subject-code-review"],
      candidateRefs: [],
    },
  ],
  items: [skillItem("code-review", observed)],
  supportingSubjects: [],
  nativeLocations: [],
  nativeReaderDeclarations: [],
  observationDiagnostics: [],
  coverage: complete,
});

export const inspectionSample: LocalInspectionDocument = Schema.decodeUnknownSync(
  LocalInspectionDocumentSchema,
)(inspection("present"));

export const unresolvedInspectionSample: LocalInspectionDocument = Schema.decodeUnknownSync(
  LocalInspectionDocumentSchema,
)({
  ...inspection("present"),
  requests: [
    {
      id: "request-1",
      kind: "identity",
      input: "@acme/skills/code-reveiw",
      resolution: "not-found",
      code: 3,
      subjectRefs: [],
      candidateRefs: [],
      reason: "No installed extension has that name",
      navigation: ["axm skills list"],
    },
  ],
  items: [],
});

const checkOf = (observed: "present" | "absent"): LocalCheckDocument =>
  Schema.decodeUnknownSync(LocalCheckDocumentSchema)({
    checks: ["compatibility", "ownership", "lint", "convergence"],
    strict: false,
    selection: { scope: "project", requests: inspection(observed).requests },
    inspection: inspection(observed),
    scope: {
      subjects: [
        { type: "skill", name: "code-review", requested: true, includedBy: [] },
        {
          type: "skill",
          name: "triage",
          requested: false,
          includedBy: [{ kind: "pack-member", source: "@acme/packs/review-kit" }],
        },
      ],
      units: ["subject-code-review"],
      incomplete: [],
    },
    assessments: [
      {
        kind: "compatibility",
        phase: "observed",
        subjectRefs: ["subject-code-review"],
        coverage: { state: "complete" },
        findingRefs: [],
        conclusion: "satisfied",
      },
      {
        kind: "convergence",
        phase: "planned",
        subjectRefs: ["subject-code-review"],
        coverage:
          observed === "present"
            ? { state: "complete" }
            : { state: "incomplete", reasons: ["The installed content is missing"] },
        findingRefs: [],
        conclusion: observed === "present" ? "satisfied" : "attention-required",
      },
    ],
    findings: [],
    verdict:
      observed === "present"
        ? { ok: true, reasons: [] }
        : {
            ok: false,
            reasons: [
              { kind: "convergence", code: "attention-required", refs: ["subject-code-review"] },
            ],
          },
    compatibility: [],
    projections: [],
    reconciliation:
      observed === "present"
        ? []
        : [
            {
              label: "@acme/skills/code-review",
              readiness: "ready",
              message: "Reinstall the missing content",
              transitions: [],
              nativeLocations: [],
            },
          ],
    failedOwners: [],
  });

export const satisfiedCheckSample = checkOf("present");
export const attentionCheckSample = checkOf("absent");
