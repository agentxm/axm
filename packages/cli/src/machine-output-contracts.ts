/**
 * Shipped `--json` contract register.
 *
 * This is deliberately indexed by every command path exposed by the real
 * Effect CLI command tree. `machine-output-contracts.test.ts` compares these
 * rows with that tree using exact equality, so adding, removing, or aliasing a
 * command requires an explicit machine-output decision.
 *
 * The schema names refer to the named Effect Schema used at the renderer call
 * boundary. Success envelopes add `ok` and may add `summary` / `suggestions`.
 * Built-in help and version documents are formatter-owned exceptions and do
 * not use the success envelope.
 */

export type MachineOutputClass = "formatter-help" | "structured-result";
export type HumanOutputKind = "orientation" | "query" | "mutation" | "mixed";
export type LivenessClass = "immediate" | "progress";

export interface MachineOutputFamily {
  readonly id: string;
  readonly outputClass: MachineOutputClass;
  readonly humanOutputKind: HumanOutputKind;
  readonly liveness: LivenessClass;
  readonly livenessCoverage: ReadonlyArray<string>;
  readonly schemaNames: ReadonlyArray<string>;
  readonly requiredEnvelopeKeys: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys: ReadonlyArray<string>;
  readonly scenarios: ReadonlyArray<string>;
  readonly rationale: string;
  readonly centralizedCoverage: ReadonlyArray<string>;
  readonly commandCoverage: ReadonlyArray<string>;
  readonly documentation: ReadonlyArray<string>;
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
  livenessCoverage: ["packages/cli/src/formatter.test.ts"],
  schemaNames: ["JsonHelpDocSchema"],
  requiredEnvelopeKeys: ["type", "name", "usage"],
  requiredTopLevelKeys: ["type", "name", "usage"],
  optionalTopLevelKeys: ["summary", "arguments", "flags", "subcommands", "examples", "learnMore"],
  scenarios: ["group invoked without a subcommand", "explicit --help on every command path"],
  rationale: "Effect CLI owns built-in help rendering before a command handler runs.",
  centralizedCoverage: [
    "packages/cli/src/machine-output-contracts.test.ts",
    "packages/cli/src/formatter.test.ts",
  ],
  commandCoverage: [],
  documentation: ["docs/architecture/commands/output.md"],
} satisfies MachineOutputFamily;

const planFamily = {
  id: "plan-resolution",
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  livenessCoverage: [
    "packages/core/src/unstable/plan/resolve-plan.test.ts",
    "packages/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  schemaNames: ["PlanResolutionDocumentSchema"],
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", "result"],
  optionalTopLevelKeys: ["summary", "suggestions"],
  scenarios: ["applied", "previewed", "cancelled", "no-op", "partial failure"],
  rationale: "Mutations expose one durable plan-resolution result across all execution outcomes.",
  centralizedCoverage: [
    "packages/cli/src/json-output.test.ts",
    "packages/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  commandCoverage: ["command-specific tests cover branches not represented by the shared plan"],
  documentation: ["docs/architecture/commands/output.md"],
} satisfies MachineOutputFamily;

const publishFamily = {
  id: "publish",
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  livenessCoverage: [
    "packages/cli/src/root/publish/command.test.ts",
    "packages/cli-e2e/src/cli-commands/skills/publish/publish.e2e.ts",
  ],
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
  scenarios: ["preview", "apply", "no-op", "partial failure"],
  rationale:
    "Publish reconciliation has a purpose-built multi-item result whose actions differ from file plans.",
  centralizedCoverage: [
    "packages/cli/src/json-output.test.ts",
    "packages/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  commandCoverage: ["packages/cli/src/root/publish/command.test.ts"],
  documentation: ["docs/architecture/commands/output.md"],
} satisfies MachineOutputFamily;

const defineResultFamily = (input: {
  readonly id: string;
  readonly schemaNames: ReadonlyArray<string>;
  readonly requiredTopLevelKeys: ReadonlyArray<string>;
  readonly optionalTopLevelKeys?: ReadonlyArray<string>;
  readonly scenarios: ReadonlyArray<string>;
  readonly rationale: string;
  readonly commandCoverage: ReadonlyArray<string>;
  readonly humanOutputKind?: HumanOutputKind;
  readonly liveness?: LivenessClass;
  readonly livenessCoverage?: ReadonlyArray<string>;
}): MachineOutputFamily => ({
  id: input.id,
  outputClass: "structured-result",
  humanOutputKind: input.humanOutputKind ?? "query",
  liveness: input.liveness ?? "progress",
  livenessCoverage: input.livenessCoverage ?? input.commandCoverage,
  schemaNames: input.schemaNames,
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", ...input.requiredTopLevelKeys],
  optionalTopLevelKeys: ["summary", "suggestions", ...(input.optionalTopLevelKeys ?? [])],
  scenarios: input.scenarios,
  rationale: input.rationale,
  centralizedCoverage: [
    "packages/cli/src/machine-output-contracts.test.ts",
    "packages/core/src/unstable/cli-renderer/cli-renderer-machine.test.ts",
  ],
  commandCoverage: input.commandCoverage,
  documentation: ["docs/architecture/commands/output.md"],
});

const agentsListFamily = defineResultFamily({
  id: "agents-list",
  schemaNames: ["AgentsListOutputSchema"],
  requiredTopLevelKeys: ["items", "configured", "detected", "available", "count"],
  scenarios: ["configured agents", "empty workspace"],
  rationale: "Agent discovery returns inventory and source counts rather than a mutation plan.",
  commandCoverage: ["packages/cli/src/root/agents/list.test.ts"],
});

const agentCapabilitiesFamily = defineResultFamily({
  id: "agent-capabilities",
  schemaNames: ["AgentCapabilitiesOutputSchema"],
  requiredTopLevelKeys: ["agent", "name", "lifecycle", "supported", "items", "count"],
  scenarios: ["known agent", "unknown agent"],
  rationale: "Capability inspection is a read query.",
  commandCoverage: ["packages/cli/src/root/agents/capabilities.test.ts"],
});

const loginFamily = defineResultFamily({
  id: "login",
  schemaNames: ["LoginDocumentSchema", "LoginNoOpDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["logged in", "already logged in", "auth failure"],
  rationale: "Login has applied and already-authenticated operation-plan documents.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "packages/cli/src/root/auth/login.test.ts",
    "packages/core/src/unstable/auth/device-login.test.ts",
    "packages/core/src/unstable/auth/loopback-login.test.ts",
  ],
});

const logoutFamily = defineResultFamily({
  id: "logout",
  schemaNames: ["LogoutDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["logged out", "local-only logout", "not logged in"],
  rationale: "Logout reports the durable credential operation and its status.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/auth/logout.test.ts"],
});

const tokenFamily = defineResultFamily({
  id: "token-read",
  schemaNames: ["TokenDocumentSchema"],
  requiredTopLevelKeys: ["data"],
  scenarios: ["authenticated", "auth failure"],
  rationale:
    "The token is an explicitly requested secret-bearing result and the sole secret exception.",
  liveness: "immediate",
  commandCoverage: ["packages/cli/src/root/auth/token.test.ts"],
});

const tokenCreateFamily = defineResultFamily({
  id: "token-create",
  schemaNames: ["CreatedTokenDocumentSchema"],
  requiredTopLevelKeys: ["result", "data"],
  scenarios: ["created", "step-up authentication", "auth failure"],
  rationale:
    "Token creation intentionally returns the newly created token once alongside its plan.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/auth/token.test.ts"],
});

const tokenListFamily = defineResultFamily({
  id: "token-list",
  schemaNames: ["TokenListDocumentSchema"],
  requiredTopLevelKeys: ["items", "count", "hasMore", "cursor"],
  scenarios: ["tokens present", "empty list", "auth failure"],
  rationale: "Token listing is a paginated read query.",
  commandCoverage: ["packages/cli/src/root/auth/token.test.ts"],
});

const tokenRevokeFamily = defineResultFamily({
  id: "token-revoke",
  schemaNames: ["RevokeTokenDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["revoked", "step-up authentication", "auth failure"],
  rationale: "Revocation reports one durable credential operation.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/auth/token.test.ts"],
});

const whoamiFamily = defineResultFamily({
  id: "whoami",
  schemaNames: ["WhoamiDocumentSchema"],
  requiredTopLevelKeys: ["data"],
  scenarios: ["authenticated", "auth failure"],
  rationale: "Identity inspection is a read query.",
  commandCoverage: ["packages/cli/src/root/auth/whoami.test.ts"],
});

const cacheStatusFamily = defineResultFamily({
  id: "cache-status",
  schemaNames: ["CacheStatusOutputSchema"],
  requiredTopLevelKeys: ["data"],
  scenarios: ["populated cache", "empty cache"],
  rationale: "Cache status is a read query.",
  commandCoverage: ["packages/cli/src/root/cache/command.test.ts"],
});

const cacheVerifyFamily = defineResultFamily({
  id: "cache-verify",
  schemaNames: ["CacheVerifyOutputSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["valid", "invalid entries"],
  rationale: "Cache verification returns a purpose-built verification result.",
  commandCoverage: ["packages/cli/src/root/cache/command.test.ts"],
});

const cachePruneFamily = defineResultFamily({
  id: "cache-prune",
  schemaNames: ["CachePruneOutputSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["pruned", "no-op"],
  rationale: "Cache pruning reports cache-specific byte and entry counts.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/cache/command.test.ts"],
});

const discoverFamily = defineResultFamily({
  id: "discover",
  schemaNames: ["DiscoverOutputSchema"],
  requiredTopLevelKeys: ["items", "count", "totalDetected", "registryAvailable"],
  scenarios: ["matches", "no matches", "registry unavailable"],
  rationale: "Discovery is a read query with registry availability metadata.",
  commandCoverage: ["packages/cli/src/root/discover/handler.test.ts"],
});

const inventoryFamily = defineResultFamily({
  id: "extension-inventory",
  schemaNames: ["ExtensionInventorySchema"],
  requiredTopLevelKeys: [
    "items",
    "count",
    "configuredCount",
    "implicitCount",
    "installedCount",
    "unmanagedCount",
  ],
  scenarios: ["extensions present", "empty inventory", "mixed managed state"],
  rationale: "Per-type list commands share the workspace inventory query contract.",
  commandCoverage: ["packages/cli/src/root/list-empty-output.test.ts", "per-type list tests"],
});

const extensionShowFamily = defineResultFamily({
  id: "extension-show",
  schemaNames: ["ExtensionShowResultSchema"],
  requiredTopLevelKeys: ["item", "agents"],
  scenarios: ["extension found", "not found"],
  rationale: "Per-type show commands share the extension detail query contract.",
  commandCoverage: ["packages/cli/src/root/shared/extension-show.test.ts"],
});

const packShowFamily = defineResultFamily({
  id: "pack-show",
  schemaNames: ["PackShowResultSchema"],
  requiredTopLevelKeys: [
    "pack",
    "sourceAuthority",
    "canonicalPath",
    "manifestVersion",
    "acceptedResolution",
    "canonicalStatus",
    "desiredDependencies",
    "problems",
  ],
  scenarios: ["authored pack", "accepted Registry pack", "unresolved dependencies"],
  rationale: "Pack inspection joins desired, accepted-resolution, and observed state.",
  commandCoverage: ["packages/cli/src/root/packs/show.test.ts"],
});

const helpTopicFamily = defineResultFamily({
  id: "help-topic",
  schemaNames: ["HelpIndexResultSchema", "HelpTopicResultSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["usage", "topics", "topic", "content"],
  scenarios: ["topic index", "topic page", "schema topic", "unknown topic"],
  rationale: "The help command returns raw topic data; built-in --help remains formatter-owned.",
  humanOutputKind: "orientation",
  liveness: "immediate",
  commandCoverage: ["packages/cli/src/root/help/command.test.ts"],
});

const hooksInfoFamily = defineResultFamily({
  id: "hooks-info",
  schemaNames: ["HookPortabilityResultSchema"],
  requiredTopLevelKeys: ["items", "count"],
  scenarios: ["portable hooks", "unsupported hooks", "empty"],
  rationale: "Hook portability inspection is a read query.",
  commandCoverage: ["packages/cli/src/root/hooks/info.test.ts"],
});

const knowledgeLintFamily = defineResultFamily({
  id: "knowledge-lint",
  schemaNames: ["KnowledgeLintQueryResultSchema"],
  requiredTopLevelKeys: ["valid", "diagnostics"],
  scenarios: ["valid bundle", "diagnostics"],
  rationale: "Knowledge linting returns a bundle-validation query result.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeListFamily = defineResultFamily({
  id: "knowledge-list",
  schemaNames: ["KnowledgeListQueryResultSchema"],
  requiredTopLevelKeys: ["items", "count"],
  scenarios: ["bundles present", "empty"],
  rationale: "Knowledge bundle listing is a read query.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptGetFamily = defineResultFamily({
  id: "knowledge-concept-get",
  schemaNames: ["KnowledgeConceptGetOutputSchema", "KnowledgeConceptCorpusChangingFailureSchema"],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["concept", "reason", "ref", "expectedRevision", "currentRevision"],
  scenarios: ["concept found", "revision changed", "not found"],
  rationale: "Concept get returns exact source and resolved revision identity.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptQueryFamily = defineResultFamily({
  id: "knowledge-concept-query",
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
    "explanation",
    "outcome",
    "reason",
  ],
  scenarios: ["matches", "no matches", "next page", "cursor expired", "corpus changing", "explain"],
  rationale: "Concept search and query share a canonical paginated query result.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptResolveFamily = defineResultFamily({
  id: "knowledge-concept-resolve",
  schemaNames: [
    "KnowledgeConceptResolveOutputSchema",
    "KnowledgeConceptCorpusChangingFailureSchema",
  ],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["candidate", "candidates", "reason"],
  scenarios: ["resolved", "ambiguous", "not found", "corpus changing"],
  rationale: "Concept resolution returns one identity or bounded candidates.",
  commandCoverage: ["packages/core/src/unstable/knowledge/knowledge-graph.test.ts"],
});

const knowledgeConceptRelatedFamily = defineResultFamily({
  id: "knowledge-concept-related",
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
  scenarios: ["related concepts", "empty", "missing root", "corpus changing"],
  rationale: "Related traversal returns bounded graph results and corpus identity.",
  commandCoverage: ["packages/core/src/unstable/knowledge/knowledge-graph.test.ts"],
});

const knowledgeConceptStatusFamily = defineResultFamily({
  id: "knowledge-concept-status",
  schemaNames: ["KnowledgeConceptStatusOutputSchema"],
  requiredTopLevelKeys: [
    "capabilities",
    "readiness",
    "health",
    "bundleCount",
    "conceptCount",
    "scopeCollisions",
  ],
  optionalTopLevelKeys: ["corpusFingerprint"],
  scenarios: [
    "selected corpus",
    "empty corpus",
    "unhealthy corpus",
    "cross-scope collisions not determined",
  ],
  rationale: "Discovery status exposes the canonical capabilities and selected corpus identity.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const lintFamily = defineResultFamily({
  id: "workspace-lint",
  schemaNames: ["LintResultDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["clean", "findings", "normalized findings"],
  rationale: "Lint query and normalized fix modes share one fact-report contract.",
  humanOutputKind: "mixed",
  commandCoverage: ["packages/cli/src/root/lint/handler.test.ts"],
});

const extensionListFamily = defineResultFamily({
  id: "extension-list",
  schemaNames: ["ExtensionListDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount"],
  scenarios: ["local inventory", "updates available", "deprecated", "incomplete coverage"],
  rationale: "Root list is a local inventory query with optional remote filters.",
  commandCoverage: ["packages/cli/src/root/list/command.test.ts"],
});

const instructionsFamily = defineResultFamily({
  id: "instructions-status",
  schemaNames: ["InstructionsStatusOutputSchema"],
  requiredTopLevelKeys: ["enabled", "sourceFileName", "gitignoreAliases", "roots", "items"],
  scenarios: ["enabled", "disabled", "mixed roots"],
  rationale: "Instructions status is a read query; enable and disable remain plan mutations.",
  humanOutputKind: "mixed",
  commandCoverage: ["packages/cli/src/root/rules/instructions.test.ts"],
});

const setupFamily = defineResultFamily({
  id: "setup",
  schemaNames: ["SetupDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["initialized", "already initialized", "previewed", "partial failure"],
  rationale: "Setup has additional discovery data nested in its purpose-built operation result.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/setup.test.ts"],
});

const upgradeFamily = defineResultFamily({
  id: "upgrade",
  schemaNames: ["UpgradeDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["upgraded", "already current", "previewed", "interrupted", "verification failure"],
  rationale: "CLI upgrade reports the package-manager command and verification outcome.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/upgrade/handler.test.ts"],
});

const viewFamily = defineResultFamily({
  id: "registry-view",
  schemaNames: ["ViewDocumentSchema", "ViewFieldValueSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["data", "value"],
  scenarios: ["full document", "scalar field", "versions field", "not found"],
  rationale: "Registry view returns either the full extension document or one selected field.",
  commandCoverage: ["packages/cli/src/root/view/handler.test.ts"],
});

const visibilityEvaluationFamily = defineResultFamily({
  id: "visibility-evaluation",
  schemaNames: ["VisibilityEvaluationSchema"],
  requiredTopLevelKeys: ["target", "intent", "actual", "comparison", "findings"],
  scenarios: ["matching intent", "drift", "unconfigured", "not established", "unavailable"],
  rationale:
    "Visibility status reports repository intent and authoritative Registry state without mutation.",
  commandCoverage: ["packages/cli/src/app.test.ts"],
});

const visibilityMutationFamily = defineResultFamily({
  id: "visibility-mutation",
  schemaNames: ["VisibilityMutationResultSchema"],
  requiredTopLevelKeys: ["target", "before", "after", "authority", "result", "revision"],
  scenarios: ["changed", "already satisfied", "stale revision", "step-up required"],
  rationale:
    "Visibility administration reports the conditional whole-Extension mutation and resulting revision.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/app.test.ts"],
});

const formatterPaths = [
  "axm",
  "axm auth",
  "axm cache",
  "axm hooks",
  "axm knowledge",
  "axm mcps",
  "axm packs",
  "axm rules",
  "axm skills",
  "axm subagents",
] as const;

const planPaths = [
  "axm adopt",
  "axm agents add",
  "axm agents remove",
  "axm agents rm",
  "axm demote",
  "axm deprecate",
  "axm fork",
  "axm hooks disable",
  "axm hooks enable",
  "axm hooks install",
  "axm hooks new",
  "axm hooks uninstall",
  "axm hooks update",
  "axm import",
  "axm install",
  "axm knowledge disable",
  "axm knowledge enable",
  "axm knowledge install",
  "axm knowledge new",
  "axm knowledge uninstall",
  "axm knowledge update",
  "axm mcps add",
  "axm mcps disable",
  "axm mcps enable",
  "axm mcps import",
  "axm mcps install",
  "axm mcps new",
  "axm mcps uninstall",
  "axm mcps update",
  "axm packs add",
  "axm packs disable",
  "axm packs enable",
  "axm packs install",
  "axm packs new",
  "axm packs remove",
  "axm packs uninstall",
  "axm packs unpack",
  "axm packs update",
  "axm rules disable",
  "axm rules enable",
  "axm rules install",
  "axm rules instructions disable",
  "axm rules instructions enable",
  "axm rules new",
  "axm rules uninstall",
  "axm rules update",
  "axm skills disable",
  "axm skills enable",
  "axm skills install",
  "axm skills new",
  "axm skills uninstall",
  "axm skills update",
  "axm subagents disable",
  "axm subagents enable",
  "axm subagents install",
  "axm subagents new",
  "axm subagents uninstall",
  "axm subagents update",
  "axm sync",
  "axm undeprecate",
  "axm uninstall",
  "axm unyank",
  "axm update",
  "axm version",
  "axm yank",
] as const;

const publishPaths = [
  "axm publish",
  "axm hooks publish",
  "axm knowledge publish",
  "axm mcps publish",
  "axm packs publish",
  "axm rules publish",
  "axm skills publish",
  "axm subagents publish",
] as const;

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
  ...rowsFor(publishFamily, publishPaths),
  ...rowsFor(agentsListFamily, ["axm agents", "axm agents list", "axm agents ls"]),
  ...rowsFor(agentCapabilitiesFamily, ["axm agents capabilities"]),
  ...rowsFor(loginFamily, ["axm login", "axm auth login"]),
  ...rowsFor(logoutFamily, ["axm logout", "axm auth logout"]),
  ...rowsFor(tokenFamily, ["axm token", "axm auth token"]),
  ...rowsFor(tokenCreateFamily, ["axm token create", "axm auth token create"]),
  ...rowsFor(tokenListFamily, ["axm token list", "axm auth token list"]),
  ...rowsFor(tokenRevokeFamily, ["axm token revoke", "axm auth token revoke"]),
  ...rowsFor(whoamiFamily, ["axm whoami", "axm auth whoami"]),
  ...rowsFor(cacheStatusFamily, ["axm cache status"]),
  ...rowsFor(cacheVerifyFamily, ["axm cache verify"]),
  ...rowsFor(cachePruneFamily, ["axm cache prune"]),
  ...rowsFor(discoverFamily, ["axm discover"]),
  ...rowsFor(inventoryFamily, [
    "axm hooks list",
    "axm hooks ls",
    "axm mcps list",
    "axm mcps ls",
    "axm packs list",
    "axm packs ls",
    "axm rules list",
    "axm rules ls",
    "axm skills list",
    "axm skills ls",
    "axm subagents list",
    "axm subagents ls",
  ]),
  ...rowsFor(extensionShowFamily, [
    "axm hooks show",
    "axm knowledge show",
    "axm mcps show",
    "axm rules show",
    "axm skills show",
    "axm subagents show",
  ]),
  ...rowsFor(packShowFamily, ["axm packs show"]),
  ...rowsFor(helpTopicFamily, ["axm help"]),
  ...rowsFor(hooksInfoFamily, ["axm hooks info"]),
  ...rowsFor(knowledgeLintFamily, ["axm knowledge lint"]),
  ...rowsFor(knowledgeListFamily, ["axm knowledge list", "axm knowledge ls"]),
  ...rowsFor(knowledgeConceptResolveFamily, ["axm knowledge concepts resolve"]),
  ...rowsFor(knowledgeConceptQueryFamily, [
    "axm knowledge concepts search",
    "axm knowledge concepts query",
  ]),
  ...rowsFor(knowledgeConceptGetFamily, ["axm knowledge concepts get"]),
  ...rowsFor(knowledgeConceptRelatedFamily, ["axm knowledge concepts related"]),
  ...rowsFor(knowledgeConceptStatusFamily, ["axm knowledge concepts status"]),
  ...rowsFor(lintFamily, ["axm lint"]),
  ...rowsFor(extensionListFamily, ["axm list"]),
  ...rowsFor(instructionsFamily, ["axm rules instructions", "axm rules instructions status"]),
  ...rowsFor(setupFamily, ["axm setup"]),
  ...rowsFor(upgradeFamily, ["axm upgrade"]),
  ...rowsFor(viewFamily, ["axm view"]),
  ...rowsFor(visibilityEvaluationFamily, ["axm visibility status"]),
  ...rowsFor(visibilityMutationFamily, ["axm visibility set", "axm visibility reconcile"]),
];

export const FORMATTER_VERSION_CONTRACT = {
  path: "axm --version",
  family: {
    id: "formatter-version",
    outputClass: "formatter-help",
    humanOutputKind: "orientation",
    liveness: "immediate",
    livenessCoverage: ["packages/cli/src/formatter.test.ts"],
    schemaNames: ["JsonVersionDocSchema"],
    requiredEnvelopeKeys: ["type", "name", "version"],
    requiredTopLevelKeys: ["type", "name", "version"],
    optionalTopLevelKeys: [],
    scenarios: ["explicit --version"],
    rationale: "Effect CLI owns built-in version rendering before a command handler runs.",
    centralizedCoverage: [
      "packages/cli/src/machine-output-contracts.test.ts",
      "packages/cli/src/formatter.test.ts",
    ],
    commandCoverage: [],
    documentation: ["docs/architecture/commands/output.md"],
  },
  helpSchemaName: "JsonHelpDocSchema",
} satisfies MachineOutputContractRow;
