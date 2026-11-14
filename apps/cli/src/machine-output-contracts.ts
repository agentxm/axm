/**
 * CLI human and machine output contract register.
 *
 * This is deliberately indexed by every command path exposed by the real
 * Effect CLI command tree. `machine-output-contracts.test.ts` compares these
 * rows with that tree using exact equality, so adding, removing, or aliasing a
 * command requires explicit result family and liveness decisions. Subcommands
 * every extension type's command group shares are derived from the extension
 * type table that also builds those groups; every other path is named here.
 *
 * The schema names refer to the named Effect Schema used at the renderer call
 * boundary. Ordinary envelopes add `ok`, `mode`, `outcome`, and optional
 * `summary` / `suggestions`; promoted payload fields are removed once at that
 * boundary. Formatter documents, schema exports, credential delivery, and
 * external-standard exports retain their discriminated output policies.
 */

import {
  extensionTypeToPlural,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions";

type HumanOutputKind = "orientation" | "query" | "mutation" | "mixed";
type LivenessClass = "immediate" | "progress";

/** Navigation to existing evidence owners, not a second acceptance authority. */
type AssessmentAllocation =
  | { readonly kind: "query" | "exempt"; readonly reason: string }
  | { readonly kind: "standalone"; readonly evidence: string }
  | {
      readonly kind: "operation";
      readonly preflight: string;
      readonly postcondition: string;
      readonly evidence: string;
      readonly modes: string;
    };

const queryAssessment = {
  kind: "query",
  reason:
    "Report the requested observation through the family schema; no mutation postflight or implicit remote/native currency assessment. Explicit remote modes keep their declared access boundary.",
} satisfies AssessmentAllocation;
const discoveryAssessment = {
  kind: "exempt",
  reason:
    "Passive discovery or external-format delivery keeps its existing prerequisites and exact output; no workspace assessment wrapper.",
} satisfies AssessmentAllocation;

interface MachineOutputFamilyBase {
  readonly assessment: AssessmentAllocation;
  readonly modes: ReadonlyArray<"query" | "preview" | "apply">;
  readonly effects: string;
  readonly completionOwner: string;
  readonly id: string;
  readonly humanOutputKind: HumanOutputKind;
  readonly liveness: LivenessClass;
  readonly requiredEnvelopeKeys: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys: ReadonlyArray<string>;
  readonly rationale: string;
}

type StructuredResultFamily = MachineOutputFamilyBase & {
  readonly outputClass: "structured-result";
  readonly schemaNames: ReadonlyArray<string>;
  readonly promotedResultFields: ReadonlyArray<"mode" | "outcome">;
  readonly externalSchema?: never;
};

/** Output policy makes raw delivery and ordinary result projection mutually exclusive. */
type MachineOutputFamily =
  | StructuredResultFamily
  | (MachineOutputFamilyBase & {
      readonly promotedResultFields: readonly [];
    } & (
        | {
            readonly outputClass: "formatter-help";
            readonly schemaNames: ReadonlyArray<"JsonHelpDocSchema" | "JsonVersionDocSchema">;
            readonly externalSchema?: never;
          }
        | {
            readonly outputClass: "json-refused";
            readonly schemaNames: readonly ["JsonErrorEnvelopeSchema"];
            readonly externalSchema?: never;
          }
        | {
            readonly outputClass: "external-document";
            readonly schemaNames: readonly [];
            readonly externalSchema: string;
          }
        | {
            readonly outputClass: "json-schema-document";
            readonly schemaNames: readonly ["JsonSchemaDocumentSchema"];
            readonly externalSchema?: never;
          }
      ));

export interface MachineOutputContractRow {
  readonly path: string;
  readonly family: MachineOutputFamily;
  readonly helpSchemaName: "JsonHelpDocSchema";
}

const helpFamily = {
  id: "formatter-help",
  assessment: discoveryAssessment,
  modes: ["query"],
  effects: "No persistent changes; passive command discovery.",
  completionOwner: "formatter",
  promotedResultFields: [],
  outputClass: "formatter-help",
  humanOutputKind: "orientation",
  liveness: "immediate",
  schemaNames: ["JsonHelpDocSchema"],
  requiredEnvelopeKeys: ["type", "description", "usage", "flags"],
  requiredTopLevelKeys: ["type", "description", "usage", "flags"],
  optionalTopLevelKeys: [
    "globalFlags",
    "inheritedFlags",
    "args",
    "subcommands",
    "examples",
    "learnMore",
    "output",
  ],
  rationale: "Effect CLI owns built-in help rendering before a command handler runs.",
} satisfies MachineOutputFamily;

const lockExportFamily = {
  id: "accepted-resolutions-cyclonedx",
  assessment: discoveryAssessment,
  modes: ["query"],
  effects: "Read accepted resolutions; emit a standard document.",
  completionOwner: "lock-export",
  promotedResultFields: [],
  outputClass: "external-document",
  humanOutputKind: "query",
  liveness: "immediate",
  schemaNames: [],
  externalSchema: "https://cyclonedx.org/schema/bom-1.6.schema.json",
  requiredEnvelopeKeys: [],
  requiredTopLevelKeys: ["bomFormat", "specVersion", "version"],
  optionalTopLevelKeys: ["$schema", "metadata", "components", "dependencies", "compositions"],
  rationale:
    "Lock export writes the standard CycloneDX document directly in both human and machine modes.",
} satisfies MachineOutputFamily;

const planFamily = {
  id: "plan-resolution",
  assessment: {
    kind: "operation",
    preflight:
      "Feature step readiness, source authority, ownership, risk and exact-candidate revalidation.",
    postcondition:
      "Feature-owned transactional postconditions and fresh configured-target observations; retain independently committed units on verification failure.",
    evidence:
      "OperationResolution preconditions, riskConditions, units, agentOutcomes, footprint and failure.",
    modes:
      "Preview exposes a candidate without applying; apply validates and settles each declared semantic closure. Authoring steps verify authored effects without requiring unrelated convergence.",
  },
  modes: ["preview", "apply"],
  effects: "Preview a candidate or apply its declared workspace or authored-source transition.",
  completionOwner: "operation-resolution",
  promotedResultFields: ["mode", "outcome"],
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  schemaNames: ["PlanResolutionDocumentSchema"],
  requiredEnvelopeKeys: ["ok", "mode", "outcome", "result"],
  requiredTopLevelKeys: ["ok", "result"],
  optionalTopLevelKeys: ["summary", "suggestions"],
  rationale: "Mutations expose one durable plan-resolution result across all execution outcomes.",
} satisfies MachineOutputFamily;

const publishFamily = {
  id: "publish",
  assessment: {
    kind: "operation",
    preflight:
      "Publishing selection, authorship, eligibility, fresh Registry access, package validation and prepared-distribution revalidation.",
    postcondition:
      "Authoritative per-version upload settlement; unknown remote settlement remains indeterminate.",
    evidence: "PublishResult publicationSet, execution outcomes and recovery.",
    modes:
      "Preview performs permitted preparation without upload; apply preserves selection-wide preflight and per-upload settlement.",
  },
  modes: ["preview", "apply"],
  effects: "Preview publication or upload selected packages to the Registry.",
  completionOwner: "publish",
  promotedResultFields: ["mode"],
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  schemaNames: ["PublishResultSchema"],
  requiredEnvelopeKeys: ["ok", "mode", "outcome", "result"],
  requiredTopLevelKeys: [
    "ok",
    "contract",
    "mode",
    "selection",
    "publicationSet",
    "execution",
    "counts",
  ],
  optionalTopLevelKeys: ["recovery", "summary", "suggestions"],
  rationale:
    "Publish reconciliation has a purpose-built multi-item result whose actions differ from file plans.",
} satisfies MachineOutputFamily;

const defineResultFamily = (input: {
  readonly assessment: AssessmentAllocation;
  readonly id: string;
  readonly schemaNames: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys?: ReadonlyArray<string>;
  readonly rationale: string;
  readonly humanOutputKind?: HumanOutputKind;
  readonly modes?: ReadonlyArray<"query" | "preview" | "apply">;
  readonly effects?: string;
  readonly promotedResultFields?: ReadonlyArray<"mode" | "outcome">;
  readonly liveness: LivenessClass;
}): StructuredResultFamily => ({
  id: input.id,
  assessment: input.assessment,
  modes: input.modes ?? [input.humanOutputKind === "mutation" ? "apply" : "query"],
  effects:
    input.effects ??
    (input.humanOutputKind === "mutation"
      ? "Apply the command’s declared persistent transition."
      : "Read and report; no persistent domain changes."),
  completionOwner: input.id,
  promotedResultFields: input.promotedResultFields ?? [],
  outputClass: "structured-result",
  humanOutputKind: input.humanOutputKind ?? "query",
  liveness: input.liveness,
  schemaNames: input.schemaNames,
  requiredEnvelopeKeys: ["ok", "mode", "outcome", "result"],
  requiredTopLevelKeys: ["ok", ...input.requiredTopLevelKeys],
  optionalTopLevelKeys: ["summary", "suggestions", ...(input.optionalTopLevelKeys ?? [])],
  rationale: input.rationale,
});

const diagnosticReviewFamily = defineResultFamily({
  id: "diagnostic-review",
  assessment: queryAssessment,
  liveness: "immediate",
  humanOutputKind: "query",
  schemaNames: ["DiagnosticReviewDocumentSchema"],
  requiredTopLevelKeys: ["diagnosticId", "sha256", "record"],
  rationale: "Review returns the retained local record and the hash required for export.",
});

const diagnosticExportFamily = defineResultFamily({
  id: "diagnostic-export",
  assessment: {
    kind: "operation",
    preflight:
      "Diagnostic owner resolves and sanitizes the selected record and validates the output destination.",
    postcondition: "Export owner writes the selected bytes and reports the destination and digest.",
    evidence: "DiagnosticExportDocument diagnosticId, output and sha256.",
    modes: "File-output apply only; no workspace construction or extension checks.",
  },
  liveness: "immediate",
  humanOutputKind: "mutation",
  schemaNames: ["DiagnosticExportDocumentSchema"],
  requiredTopLevelKeys: ["diagnosticId", "sha256", "output"],
  rationale: "Export writes exactly the reviewed record to a new restricted local file.",
});

const hookTestFamily = defineResultFamily({
  id: "hook-fixture-execution",
  assessment: {
    kind: "operation",
    preflight:
      "Hook-test owner validates the explicitly selected hook fixture and runtime request.",
    postcondition:
      "Report fixture execution and protocol outcomes; never infer native runtime health.",
    evidence: "Hook fixture execution document and evidence.",
    modes: "Explicit execution only; never invoked by passive local check.",
  },
  liveness: "progress",
  humanOutputKind: "mutation",
  schemaNames: ["HookTestResultSchema"],
  requiredTopLevelKeys: [
    "kind",
    "package",
    "version",
    "contentHash",
    "configurationHash",
    "startedAt",
    "completedAt",
    "cwd",
    "scope",
    "platform",
    "environment",
    "environmentFreshness",
    "nativeInvocation",
    "sandboxed",
    "fixtures",
    "passed",
    "receiptPath",
  ],
  rationale:
    "Explicit package execution records historical fixture evidence without claiming native host invocation.",
});

const agentsListFamily = defineResultFamily({
  id: "agents-list",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["AgentsListOutputSchema"],
  requiredTopLevelKeys: ["items", "configured", "detected", "available", "count"],
  rationale: "Agent discovery returns inventory and source counts rather than a mutation plan.",
});

const agentCapabilitiesFamily = defineResultFamily({
  id: "agent-capabilities",
  assessment: queryAssessment,
  liveness: "immediate",
  schemaNames: ["AgentCapabilitiesOutputSchema"],
  requiredTopLevelKeys: ["agent", "name", "lifecycle", "supported", "items", "count"],
  rationale: "Capability inspection is a read query.",
});

const loginFamily = defineResultFamily({
  id: "login",
  assessment: {
    kind: "operation",
    preflight: "Authentication owner validates target and persistence policy.",
    postcondition:
      "Report issued session, identity availability or pending-human/expired/denied settlement.",
    evidence: "Login and device-flow result variants.",
    modes: "Apply may await a person; no fabricated session or workspace postflight.",
  },
  liveness: "progress",
  schemaNames: [
    "LoginDocumentSchema",
    "LoginNoOpDocumentSchema",
    "DeviceLoginPendingDocumentSchema",
  ],
  requiredTopLevelKeys: ["result"],
  rationale: "Login reports the authoritative registry authentication transition.",
  humanOutputKind: "mutation",
});

const logoutFamily = defineResultFamily({
  id: "logout",
  assessment: {
    kind: "operation",
    preflight: "Credential owner resolves the explicit authentication context.",
    postcondition:
      "Credential-store owner removes the selected stored credentials and reports status.",
    evidence: "LogoutDocument result.",
    modes: "Apply only; do not construct a workspace or refresh unrelated credentials.",
  },
  liveness: "progress",
  schemaNames: ["LogoutDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Logout reports the durable credential operation and its status.",
  humanOutputKind: "mutation",
});

/**
 * Credential export writes only a raw token to stdout. `--json` is refused
 * before any credential is resolved or created, so the only machine document
 * these paths produce is the usage error.
 */
const credentialExportFamily = (
  id: string,
  humanOutputKind: HumanOutputKind,
  liveness: LivenessClass,
) =>
  ({
    id,
    assessment:
      humanOutputKind === "mutation"
        ? {
            kind: "operation",
            preflight:
              "Token owner validates explicit raw delivery, token parameters and fresh authorization.",
            postcondition:
              "Use the authoritative token creation response; output failure does not erase a created token.",
            evidence:
              "Credential creation settlement; raw secret delivery is never wrapped in JSON.",
            modes:
              "Apply with explicit --plain; JSON refusal happens before dispatch. No workspace postflight.",
          }
        : queryAssessment,
    modes: [humanOutputKind === "mutation" ? "apply" : "query"],
    effects: "Credential export requires --plain; JSON is refused before credential access.",
    completionOwner: id,
    promotedResultFields: [],
    outputClass: "json-refused",
    humanOutputKind,
    liveness,
    schemaNames: ["JsonErrorEnvelopeSchema"],
    requiredEnvelopeKeys: ["ok", "code", "title", "detail"],
    requiredTopLevelKeys: ["ok", "code", "title", "detail"],
    optionalTopLevelKeys: ["suggestions"],
    rationale:
      "No JSON success document may carry a secret; `--plain` is the explicit export channel.",
  }) satisfies MachineOutputFamily;

const tokenListFamily = defineResultFamily({
  id: "token-list",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["TokenListDocumentSchema"],
  requiredTopLevelKeys: ["items", "count", "hasMore", "cursor"],
  rationale: "Token listing is a paginated read query.",
});

const tokenRevokeFamily = defineResultFamily({
  id: "token-revoke",
  assessment: {
    kind: "operation",
    preflight: "Token owner validates the selected identifier and fresh authorization.",
    postcondition:
      "Use authoritative revocation response; preserve protocol failure and uncertainty.",
    evidence: "TokenRevokeDocument result.",
    modes: "Apply only; no workspace postflight.",
  },
  liveness: "progress",
  schemaNames: ["RevokeTokenDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Revocation reports one durable credential operation.",
  humanOutputKind: "mutation",
});

const whoamiFamily = defineResultFamily({
  id: "whoami",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["WhoamiDocumentSchema"],
  requiredTopLevelKeys: [
    "user",
    "registry",
    "credentialType",
    "authority",
    "permissions",
    "resourceRestrictions",
    "expiresAt",
    "approvedAt",
    "trustedPublisher",
  ],
  rationale: "Identity inspection is a read query.",
});

const cacheStatusFamily = defineResultFamily({
  id: "cache-status",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["CacheStatusOutputSchema"],
  requiredTopLevelKeys: ["entries", "bytes", "maxBytes", "maxAgeDays"],
  rationale: "Cache status is a read query.",
});

const cacheVerifyFamily = defineResultFamily({
  id: "cache-verify",
  assessment: {
    kind: "operation",
    preflight: "Archive-cache owner enumerates the selected cache and verifies integrity.",
    postcondition: "Remove only corrupt archives and report examined, valid and removed outcomes.",
    evidence: "CacheVerifyOutputSchema result.",
    modes: "Mutating verification is explicit; standalone check never invokes it.",
  },
  humanOutputKind: "mutation",
  effects: "Verify cached archives and remove corrupt entries.",
  liveness: "progress",
  schemaNames: ["CacheVerifyOutputSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Cache verification returns a purpose-built verification result.",
});

const cachePruneFamily = defineResultFamily({
  id: "cache-prune",
  assessment: {
    kind: "operation",
    preflight: "Archive-cache owner resolves retention policy and candidate entries.",
    postcondition: "Report actual retention removals and remaining cache accounting.",
    evidence: "CachePruneOutputSchema result.",
    modes:
      "Apply only; the cache owner performs retention removal without workspace reconciliation.",
  },
  liveness: "progress",
  schemaNames: ["CachePruneOutputSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Cache pruning reports cache-specific byte and entry counts.",
  humanOutputKind: "mutation",
});

const discoverFamily = defineResultFamily({
  id: "discover",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["DiscoverOutputSchema"],
  requiredTopLevelKeys: ["items", "count", "totalDetected", "registryAvailable"],
  rationale: "Discovery is a read query with registry availability metadata.",
});

const inventoryFamily = defineResultFamily({
  id: "extension-inventory",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["ExtensionInventoryDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts"],
  rationale: "Per-type list commands share the workspace inventory query contract.",
});

const localCheckFamily = defineResultFamily({
  id: "local-check",
  assessment: {
    kind: "standalone",
    evidence:
      "LocalCheckDocument selected assessments, coverage, owner findings, compatibility, projection evidence, reconciliation and verdict.",
  },
  liveness: "progress",
  schemaNames: ["LocalCheckDocumentSchema"],
  requiredTopLevelKeys: [
    "checks",
    "strict",
    "selection",
    "inspection",
    "scope",
    "assessments",
    "findings",
    "verdict",
    "compatibility",
    "projections",
    "reconciliation",
    "failedOwners",
  ],
  optionalTopLevelKeys: ["officialSkillCompatibility"],
  rationale:
    "Selected local assessments report bounded coverage and a verdict without mutation, acquisition, or runtime execution.",
});

const extensionShowFamily = defineResultFamily({
  id: "local-inspection",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["LocalInspectionDocumentSchema"],
  requiredTopLevelKeys: [
    "scope",
    "requests",
    "items",
    "supportingSubjects",
    "nativeLocations",
    "nativeReaderDeclarations",
    "observationDiagnostics",
    "coverage",
  ],
  rationale:
    "Local inspection answers ownership, editing authority, desired reachability, retention, and observation coverage.",
});

const mcpInventoryFamily: StructuredResultFamily = {
  ...inventoryFamily,
  id: "mcp-inventory",
  assessment: queryAssessment,
  schemaNames: ["McpServerListQueryResultSchema"],
};

const subagentShowFamily: StructuredResultFamily = {
  ...extensionShowFamily,
  id: "subagent-show",
  assessment: queryAssessment,
  schemaNames: ["LocalInspectionDocumentSchema", "SubagentRenderResultSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: [
    "item",
    "agentOutcomes",
    "name",
    "fqn",
    "type",
    "version",
    "enabled",
    "locked",
    "source",
    "scope",
    "agentId",
    "status",
    "mode",
    "nativeName",
    "reasonCode",
    "reason",
    "sourceDependencies",
    "artifacts",
    "qualifications",
  ],
  rationale:
    "Subagent show reports installed state, or a read-only compiled runtime implementation when --render is selected.",
};

const registryTransitionFamily = defineResultFamily({
  id: "registry-transition",
  assessment: {
    kind: "operation",
    preflight:
      "Registry-management owner validates selection, eligibility, fresh access and observed revision.",
    postcondition:
      "Use authoritative transition settlement; a timeout after dispatch is not proof of no change.",
    evidence: "RegistryTransitionResult selection, outcomes and recovery.",
    modes:
      "Preview does not dispatch mutations; apply preserves per-action atomicity and indeterminate effects.",
  },
  liveness: "progress",
  humanOutputKind: "mutation",
  schemaNames: ["RegistryTransitionSchema"],
  requiredTopLevelKeys: [
    "contract",
    "action",
    "registry",
    "fqn",
    "before",
    "after",
    "revision",
    "disposition",
    "restorable",
    "message",
  ],
  optionalTopLevelKeys: ["version", "affectedVersions"],
  rationale:
    "All published-extension Registry mutations report an acknowledged, non-restorable transition with action-specific before/after state and revision.",
});

const helpTopicFamily = defineResultFamily({
  id: "help-topic",
  assessment: queryAssessment,
  schemaNames: ["HelpIndexResultSchema", "HelpTopicResultSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["usage", "topics", "topic", "kind", "content", "schema"],
  rationale:
    "Topic results discriminate Markdown text from structured JSON Schema objects; command paths delegate to the same formatter-owned document as --help, without an envelope.",
  humanOutputKind: "orientation",
  liveness: "immediate",
});

const knowledgeLintFamily = defineResultFamily({
  id: "knowledge-lint",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["KnowledgeLintQueryResultSchema"],
  requiredTopLevelKeys: ["valid", "diagnostics"],
  rationale: "Knowledge linting returns a bundle-validation query result.",
});

const knowledgeListFamily = defineResultFamily({
  id: "knowledge-list",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["KnowledgeListQueryResultSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts"],
  rationale: "Knowledge bundle listing is a read query.",
});

const knowledgeConceptGetFamily = defineResultFamily({
  id: "knowledge-concept-get",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["KnowledgeConceptGetOutputSchema", "KnowledgeConceptCorpusChangingFailureSchema"],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["concept", "reason", "ref", "expectedRevision", "currentRevision"],
  rationale:
    "Concept get returns exact source and resolved revision identity; --raw adds concept.raw to JSON and shows authored source in human output.",
});

const knowledgeConceptQueryFamily = defineResultFamily({
  id: "knowledge-concept-query",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: [
    "KnowledgeConceptQueryPageSchema",
    "KnowledgeConceptCursorFailureSchema",
    "KnowledgeConceptCorpusChangingFailureSchema",
  ],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: [
    "query",
    "corpusFingerprint",
    "items",
    "count",
    "hasMore",
    "cursor",
    "outcome",
    "reason",
  ],
  rationale: "Concept search and query share a canonical paginated query result.",
});

const knowledgeConceptResolveFamily = defineResultFamily({
  id: "knowledge-concept-resolve",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: [
    "KnowledgeConceptResolveOutputSchema",
    "KnowledgeConceptCorpusChangingFailureSchema",
  ],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["candidate", "candidates", "reason"],
  rationale: "Concept resolution returns one identity or bounded candidates.",
});

const knowledgeConceptRelatedFamily = defineResultFamily({
  id: "knowledge-concept-related",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: [
    "KnowledgeConceptRelatedOutputSchema",
    "KnowledgeConceptCorpusChangingFailureSchema",
  ],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: [
    "ref",
    "maximumDepth",
    "includesIndexBacklinks",
    "items",
    "count",
    "corpusFingerprint",
    "outcome",
    "reason",
  ],
  rationale: "Related traversal returns bounded graph results and corpus identity.",
});

const knowledgeConceptCapabilitiesFamily = defineResultFamily({
  id: "knowledge-concept-capabilities",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["KnowledgeConceptCapabilitiesOutputSchema"],
  requiredTopLevelKeys: [
    "capabilities",
    "corpusFingerprint",
    "bundleCount",
    "conceptCount",
    "scopeCollisions",
  ],
  rationale:
    "Discovery capabilities expose the canonical capabilities and selected corpus identity.",
});

const lintFamily = defineResultFamily({
  id: "workspace-lint",
  assessment: {
    kind: "operation",
    preflight:
      "Lint owner chooses filesystem or staged view and effective rule policy; fix selects bounded instruction-alias normalization.",
    postcondition:
      "Plain lint reports findings; fix delegates normalization and observes remaining findings.",
    evidence: "Lint result findings and normalization evidence.",
    modes:
      "Staged is read-only; fix-preview proposes changes without applying; fix verifies only its declared normalization.",
  },
  modes: ["query", "preview", "apply"],
  effects: "Report findings; --fix --preview assesses normalization; --fix applies it.",
  liveness: "progress",
  schemaNames: ["LintResultDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Lint query and normalized fix modes share one fact-report contract.",
  humanOutputKind: "mixed",
});

const extensionListFamily = defineResultFamily({
  id: "extension-list",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["ExtensionListDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts", "coverage"],
  rationale: "Root list is a local inventory query with optional remote filters.",
});

const instructionsFamily = defineResultFamily({
  id: "instructions-status",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["InstructionsStatusOutputSchema"],
  requiredTopLevelKeys: ["enabled", "sourceFileName", "gitignoreAliases", "roots", "items"],
  rationale: "Instructions status is a read query; enable and disable remain plan mutations.",
  humanOutputKind: "mixed",
});

const setupFamily = defineResultFamily({
  id: "setup",
  assessment: {
    kind: "operation",
    preflight:
      "Setup owner validates absent-scope initialization or the remaining explicit instruction choice.",
    postcondition:
      "Verify declared settings and initial owned output; existing agent membership is not rewritten.",
    evidence: "Setup result and nested operation resolution.",
    modes: "Preview is read-only; apply uses the setup transaction, never general repair.",
  },
  modes: ["preview", "apply"],
  promotedResultFields: ["outcome"],
  effects: "Preview initialization or configure workspace projections and the bundled skill.",
  liveness: "progress",
  schemaNames: ["SetupDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Setup has additional discovery data nested in its purpose-built operation result.",
  humanOutputKind: "mutation",
});

const shareFamily = defineResultFamily({
  id: "workspace-share",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["ShareWorkspaceDocumentSchema"],
  requiredTopLevelKeys: [
    "command",
    "origin",
    "locator",
    "availability",
    "extensions",
    "installCommand",
  ],
  rationale:
    "Share is a read-only repository query that reports the live origin and exact typed install selection.",
});

const upgradeFamily = defineResultFamily({
  id: "upgrade",
  assessment: {
    kind: "operation",
    preflight: "Upgrade owner verifies release identity, trust and installer ownership.",
    postcondition:
      "Installer owner verifies the selected executable or reports failure and recovery.",
    evidence: "Upgrade result and installation evidence.",
    modes:
      "Preview does not replace the executable; apply preserves installer-specific verification, without a workspace.",
  },
  modes: ["preview", "apply"],
  promotedResultFields: ["outcome"],
  effects: "Preview release selection or change the installed AXM executable.",
  liveness: "progress",
  schemaNames: ["UpgradeDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "CLI upgrade reports the package-manager command and verification outcome.",
  humanOutputKind: "mutation",
});

const viewFamily = defineResultFamily({
  id: "registry-view",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["ViewDocumentSchema", "ViewFieldValueSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: [
    "fqn",
    "owner",
    "type",
    "name",
    "description",
    "latest",
    "versions",
    "install",
    "visibility",
    "lifecycleState",
    "archival",
    "deprecation",
    "hook",
  ],
  rationale: "Registry view returns either the full extension document or one selected field.",
});

const visibilityEvaluationFamily = defineResultFamily({
  id: "visibility-evaluation",
  assessment: queryAssessment,
  liveness: "progress",
  schemaNames: ["VisibilityEvaluationSchema"],
  requiredTopLevelKeys: ["target", "intent", "actual", "comparison", "findings"],
  rationale:
    "Visibility status reports repository intent and authoritative Registry state without mutation.",
});

const schemaFamily = {
  id: "schema-document",
  assessment: discoveryAssessment,
  outputClass: "json-schema-document",
  humanOutputKind: "orientation",
  liveness: "immediate",
  modes: ["query"],
  effects: "Passive offline schema discovery; no command handler is invoked.",
  completionOwner: "schema-discovery",
  promotedResultFields: [],
  schemaNames: ["JsonSchemaDocumentSchema"],
  requiredEnvelopeKeys: [],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["$schema", "$defs", "$ref", "anyOf", "type"],
  rationale:
    "JSON emits a standalone schema; human output is a bounded outline or selected field description.",
} satisfies MachineOutputFamily;

/** Each extension type's command group, as the command tree registers it. */
const typeRoutes = extensionTypes.map((type) => `axm ${extensionTypeToPlural[type]}`);

/** The same subcommands under every extension type's command group. */
const perTypePaths = (verbs: ReadonlyArray<string>): ReadonlyArray<string> =>
  typeRoutes.flatMap((route) => verbs.map((verb) => `${route} ${verb}`));

const formatterPaths = [
  "axm",
  "axm agents",
  "axm cache",
  "axm diagnostics",
  "axm instructions",
  "axm lock",
  "axm token",
  ...typeRoutes,
];

const planPaths = [
  ...perTypePaths(["install", "update", "uninstall", "enable", "disable", "new"]),
  "axm enable",
  "axm disable",
  "axm adopt",
  "axm agents add",
  "axm agents remove",
  "axm demote",
  "axm fork",
  "axm hooks configure",
  "axm hooks import",
  "axm hooks export",
  "axm install",
  "axm mcps add",
  "axm mcps adopt",
  "axm mcps import",
  "axm migrate",
  "axm packs add",
  "axm packs remove",
  "axm packs unpack",
  "axm instructions adopt",
  "axm instructions disable",
  "axm instructions enable",
  "axm skills handoff",
  "axm skills import",
  "axm subagents import",
  "axm sync",
  "axm uninstall",
  "axm update",
  "axm version",
];

const publishPaths = ["axm publish", ...perTypePaths(["publish"])];

const rowsFor = (
  family: MachineOutputFamily,
  paths: ReadonlyArray<string>,
): ReadonlyArray<MachineOutputContractRow> =>
  paths.map((path) => ({ path, family, helpSchemaName: "JsonHelpDocSchema" }));

export const MACHINE_OUTPUT_CONTRACT_ROWS: ReadonlyArray<MachineOutputContractRow> = [
  ...rowsFor(helpFamily, formatterPaths),
  ...rowsFor(schemaFamily, ["axm schema"]),
  ...rowsFor(lockExportFamily, ["axm lock export"]),
  ...rowsFor(helpFamily, ["axm visibility"]),
  ...rowsFor(helpFamily, ["axm knowledge concepts"]),
  ...rowsFor(planFamily, planPaths),
  ...rowsFor(hookTestFamily, ["axm hooks test"]),
  ...rowsFor(registryTransitionFamily, [
    "axm yank",
    "axm unyank",
    "axm deprecate",
    "axm undeprecate",
    "axm archive",
    "axm unarchive",
    "axm visibility set",
    "axm visibility reconcile",
  ]),
  ...rowsFor(publishFamily, publishPaths),
  ...rowsFor(agentsListFamily, ["axm agents list"]),
  ...rowsFor(agentCapabilitiesFamily, ["axm agents capabilities"]),
  ...rowsFor(loginFamily, ["axm login"]),
  ...rowsFor(logoutFamily, ["axm logout"]),
  ...rowsFor(credentialExportFamily("token-read", "query", "immediate"), ["axm token show"]),
  ...rowsFor(credentialExportFamily("token-create", "mutation", "progress"), ["axm token create"]),
  ...rowsFor(tokenListFamily, ["axm token list"]),
  ...rowsFor(tokenRevokeFamily, ["axm token revoke"]),
  ...rowsFor(whoamiFamily, ["axm whoami"]),
  ...rowsFor(diagnosticReviewFamily, ["axm diagnostics show"]),
  ...rowsFor(diagnosticExportFamily, ["axm diagnostics export"]),
  ...rowsFor(cacheStatusFamily, ["axm cache status"]),
  ...rowsFor(cacheVerifyFamily, ["axm cache verify"]),
  ...rowsFor(cachePruneFamily, ["axm cache prune"]),
  ...rowsFor(discoverFamily, ["axm discover"]),
  ...rowsFor(inventoryFamily, [
    "axm hooks list",
    "axm packs list",
    "axm rules list",
    "axm skills list",
    "axm subagents list",
  ]),
  ...rowsFor(mcpInventoryFamily, ["axm mcps list"]),
  ...rowsFor(extensionShowFamily, [
    "axm hooks show",
    "axm knowledge show",
    "axm mcps show",
    "axm rules show",
    "axm skills show",
  ]),
  ...rowsFor(subagentShowFamily, ["axm subagents show"]),
  ...rowsFor(extensionShowFamily, ["axm show", "axm packs show"]),
  ...rowsFor(localCheckFamily, [
    "axm check",
    ...extensionTypes.map((type) => `axm ${extensionTypeToPlural[type]} check`),
  ]),
  ...rowsFor(helpTopicFamily, ["axm help"]),
  ...rowsFor(knowledgeLintFamily, ["axm knowledge lint"]),
  ...rowsFor(knowledgeListFamily, ["axm knowledge list"]),
  ...rowsFor(knowledgeConceptResolveFamily, ["axm knowledge concepts resolve"]),
  ...rowsFor(knowledgeConceptQueryFamily, ["axm knowledge concepts query"]),
  ...rowsFor(knowledgeConceptGetFamily, ["axm knowledge concepts get"]),
  ...rowsFor(knowledgeConceptRelatedFamily, ["axm knowledge concepts related"]),
  ...rowsFor(knowledgeConceptCapabilitiesFamily, ["axm knowledge concepts capabilities"]),
  ...rowsFor(lintFamily, ["axm lint"]),
  ...rowsFor(extensionListFamily, ["axm list"]),
  ...rowsFor(instructionsFamily, ["axm instructions status"]),
  ...rowsFor(setupFamily, ["axm setup"]),
  ...rowsFor(shareFamily, ["axm share"]),
  ...rowsFor(upgradeFamily, ["axm upgrade"]),
  ...rowsFor(viewFamily, ["axm view"]),
  ...rowsFor(visibilityEvaluationFamily, ["axm visibility status"]),
];

export const FORMATTER_VERSION_CONTRACT = {
  path: "axm --version",
  family: {
    id: "formatter-version",
    assessment: discoveryAssessment,
    modes: ["query"],
    effects: "No persistent changes.",
    completionOwner: "formatter",
    promotedResultFields: [],
    outputClass: "formatter-help",
    humanOutputKind: "orientation",
    liveness: "immediate",
    schemaNames: ["JsonVersionDocSchema"],
    requiredEnvelopeKeys: ["type", "name", "version"],
    requiredTopLevelKeys: ["type", "name", "version"],
    optionalTopLevelKeys: [],
    rationale: "Effect CLI owns built-in version rendering before a command handler runs.",
  },
  helpSchemaName: "JsonHelpDocSchema",
} satisfies MachineOutputContractRow;
