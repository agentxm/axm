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
 * boundary. Success envelopes add `ok` and may add `summary` / `suggestions`.
 * Built-in help and version documents are formatter-owned exceptions and do
 * not use the success envelope.
 */

import {
  extensionTypeToPlural,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions";

export type MachineOutputClass = "formatter-help" | "structured-result" | "json-refused";
export type HumanOutputKind = "orientation" | "query" | "mutation" | "mixed";
export type LivenessClass = "immediate" | "progress";

export interface MachineOutputFamily {
  readonly id: string;
  readonly outputClass: MachineOutputClass;
  readonly humanOutputKind: HumanOutputKind;
  readonly liveness: LivenessClass;
  readonly schemaNames: ReadonlyArray<string>;
  readonly requiredEnvelopeKeys: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys: ReadonlyArray<string>;
  readonly rationale: string;
}

export interface MachineOutputContractRow {
  readonly path: string;
  readonly family: MachineOutputFamily;
  readonly helpSchemaName: "JsonHelpDocSchema";
}

const helpFamily = {
  id: "formatter-help",
  outputClass: "formatter-help",
  humanOutputKind: "orientation",
  liveness: "immediate",
  schemaNames: ["JsonHelpDocSchema"],
  requiredEnvelopeKeys: ["type", "description", "usage", "flags"],
  requiredTopLevelKeys: ["type", "description", "usage", "flags"],
  optionalTopLevelKeys: ["globalFlags", "args", "subcommands", "examples", "learnMore"],
  rationale: "Effect CLI owns built-in help rendering before a command handler runs.",
} satisfies MachineOutputFamily;

const planFamily = {
  id: "plan-resolution",
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  schemaNames: ["PlanResolutionDocumentSchema"],
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", "result"],
  optionalTopLevelKeys: ["summary", "suggestions"],
  rationale: "Mutations expose one durable plan-resolution result across all execution outcomes.",
} satisfies MachineOutputFamily;

const publishFamily = {
  id: "publish",
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  schemaNames: ["PublishResultSchema"],
  requiredEnvelopeKeys: ["ok", "result"],
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
  readonly id: string;
  readonly schemaNames: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys?: ReadonlyArray<string>;
  readonly rationale: string;
  readonly humanOutputKind?: HumanOutputKind;
  readonly liveness: LivenessClass;
}): MachineOutputFamily => ({
  id: input.id,
  outputClass: "structured-result",
  humanOutputKind: input.humanOutputKind ?? "query",
  liveness: input.liveness,
  schemaNames: input.schemaNames,
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", ...input.requiredTopLevelKeys],
  optionalTopLevelKeys: ["summary", "suggestions", ...(input.optionalTopLevelKeys ?? [])],
  rationale: input.rationale,
});

const diagnosticReviewFamily = defineResultFamily({
  id: "diagnostic-review",
  liveness: "immediate",
  humanOutputKind: "query",
  schemaNames: ["DiagnosticReviewDocumentSchema"],
  requiredTopLevelKeys: ["diagnosticId", "sha256", "record"],
  rationale: "Review returns the retained local record and the hash required for export.",
});

const diagnosticExportFamily = defineResultFamily({
  id: "diagnostic-export",
  liveness: "immediate",
  humanOutputKind: "mutation",
  schemaNames: ["DiagnosticExportDocumentSchema"],
  requiredTopLevelKeys: ["diagnosticId", "sha256", "output"],
  rationale: "Export writes exactly the reviewed record to a new restricted local file.",
});

const hookTestFamily = defineResultFamily({
  id: "hook-fixture-execution",
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
  liveness: "progress",
  schemaNames: ["AgentsListOutputSchema"],
  requiredTopLevelKeys: ["items", "configured", "detected", "available", "count"],
  rationale: "Agent discovery returns inventory and source counts rather than a mutation plan.",
});

const agentCapabilitiesFamily = defineResultFamily({
  id: "agent-capabilities",
  liveness: "immediate",
  schemaNames: ["AgentCapabilitiesOutputSchema"],
  requiredTopLevelKeys: ["agent", "name", "lifecycle", "supported", "items", "count"],
  rationale: "Capability inspection is a read query.",
});

const loginFamily = defineResultFamily({
  id: "login",
  liveness: "progress",
  schemaNames: ["LoginDocumentSchema", "LoginNoOpDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Login reports the authoritative registry authentication transition.",
  humanOutputKind: "mutation",
});

const logoutFamily = defineResultFamily({
  id: "logout",
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
  liveness: "progress",
  schemaNames: ["TokenListDocumentSchema"],
  requiredTopLevelKeys: ["items", "count", "hasMore", "cursor"],
  rationale: "Token listing is a paginated read query.",
});

const tokenRevokeFamily = defineResultFamily({
  id: "token-revoke",
  liveness: "progress",
  schemaNames: ["RevokeTokenDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Revocation reports one durable credential operation.",
  humanOutputKind: "mutation",
});

const whoamiFamily = defineResultFamily({
  id: "whoami",
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
  liveness: "progress",
  schemaNames: ["CacheStatusOutputSchema"],
  requiredTopLevelKeys: ["entries", "bytes", "maxBytes", "maxAgeDays"],
  rationale: "Cache status is a read query.",
});

const cacheVerifyFamily = defineResultFamily({
  id: "cache-verify",
  liveness: "progress",
  schemaNames: ["CacheVerifyOutputSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Cache verification returns a purpose-built verification result.",
});

const cachePruneFamily = defineResultFamily({
  id: "cache-prune",
  liveness: "progress",
  schemaNames: ["CachePruneOutputSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Cache pruning reports cache-specific byte and entry counts.",
  humanOutputKind: "mutation",
});

const discoverFamily = defineResultFamily({
  id: "discover",
  liveness: "progress",
  schemaNames: ["DiscoverOutputSchema"],
  requiredTopLevelKeys: ["items", "count", "totalDetected", "registryAvailable"],
  rationale: "Discovery is a read query with registry availability metadata.",
});

const inventoryFamily = defineResultFamily({
  id: "extension-inventory",
  liveness: "progress",
  schemaNames: ["ExtensionInventoryDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts"],
  rationale: "Per-type list commands share the workspace inventory query contract.",
});

const extensionShowFamily = defineResultFamily({
  id: "extension-show",
  liveness: "progress",
  schemaNames: ["ExtensionShowResultSchema"],
  requiredTopLevelKeys: ["item", "agentOutcomes"],
  rationale: "Per-type show commands share the extension detail query contract.",
});

const mcpInventoryFamily: MachineOutputFamily = {
  ...inventoryFamily,
  id: "mcp-inventory",
  schemaNames: ["McpServerListQueryResultSchema"],
};

const subagentShowFamily: MachineOutputFamily = {
  ...extensionShowFamily,
  id: "subagent-show",
  schemaNames: ["ExtensionShowResultSchema", "SubagentRenderResultSchema"],
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

const packShowFamily = defineResultFamily({
  id: "pack-show",
  liveness: "progress",
  schemaNames: ["PackShowResultSchema"],
  requiredTopLevelKeys: [
    "pack",
    "agentOutcomes",
    "sourceAuthority",
    "canonicalPath",
    "manifestVersion",
    "acceptedResolution",
    "canonicalStatus",
    "desiredDependencies",
    "problems",
  ],
  rationale: "Pack inspection joins desired, accepted-resolution, and observed state.",
});

const helpTopicFamily = defineResultFamily({
  id: "help-topic",
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
  liveness: "progress",
  schemaNames: ["KnowledgeLintQueryResultSchema"],
  requiredTopLevelKeys: ["valid", "diagnostics"],
  rationale: "Knowledge linting returns a bundle-validation query result.",
});

const knowledgeListFamily = defineResultFamily({
  id: "knowledge-list",
  liveness: "progress",
  schemaNames: ["KnowledgeListQueryResultSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts"],
  rationale: "Knowledge bundle listing is a read query.",
});

const knowledgeConceptGetFamily = defineResultFamily({
  id: "knowledge-concept-get",
  liveness: "progress",
  schemaNames: ["KnowledgeConceptGetOutputSchema", "KnowledgeConceptCorpusChangingFailureSchema"],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["concept", "reason", "ref", "expectedRevision", "currentRevision"],
  rationale: "Concept get returns exact source and resolved revision identity.",
});

const knowledgeConceptQueryFamily = defineResultFamily({
  id: "knowledge-concept-query",
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
  liveness: "progress",
  schemaNames: ["LintResultDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Lint query and normalized fix modes share one fact-report contract.",
  humanOutputKind: "mixed",
});

const extensionListFamily = defineResultFamily({
  id: "extension-list",
  liveness: "progress",
  schemaNames: ["ExtensionListDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount", "managementCounts"],
  optionalTopLevelKeys: ["nativeLocationCounts", "coverage"],
  rationale: "Root list is a local inventory query with optional remote filters.",
});

const instructionsFamily = defineResultFamily({
  id: "instructions-status",
  liveness: "progress",
  schemaNames: ["InstructionsStatusOutputSchema"],
  requiredTopLevelKeys: ["enabled", "sourceFileName", "gitignoreAliases", "roots", "items"],
  rationale: "Instructions status is a read query; enable and disable remain plan mutations.",
  humanOutputKind: "mixed",
});

const setupFamily = defineResultFamily({
  id: "setup",
  liveness: "progress",
  schemaNames: ["SetupDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "Setup has additional discovery data nested in its purpose-built operation result.",
  humanOutputKind: "mutation",
});

const shareFamily = defineResultFamily({
  id: "workspace-share",
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
  liveness: "progress",
  schemaNames: ["UpgradeDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  rationale: "CLI upgrade reports the package-manager command and verification outcome.",
  humanOutputKind: "mutation",
});

const viewFamily = defineResultFamily({
  id: "registry-view",
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
  liveness: "progress",
  schemaNames: ["VisibilityEvaluationSchema"],
  requiredTopLevelKeys: ["target", "intent", "actual", "comparison", "findings"],
  rationale:
    "Visibility status reports repository intent and authoritative Registry state without mutation.",
});

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
  ...rowsFor(packShowFamily, ["axm packs show"]),
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
