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
  documentation: ["contributing/guides/cli-renderer.md"],
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
  documentation: ["contributing/guides/cli-renderer.md"],
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
  requiredTopLevelKeys: ["ok", "mode", "results"],
  optionalTopLevelKeys: ["selection", "summary", "suggestions"],
  scenarios: ["preview", "apply", "no-op", "partial failure"],
  rationale:
    "Publish reconciliation has a purpose-built multi-item result whose actions differ from file plans.",
  centralizedCoverage: [
    "packages/cli/src/json-output.test.ts",
    "packages/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  commandCoverage: ["packages/cli/src/root/publish/command.test.ts"],
  documentation: ["contributing/guides/cli-renderer.md"],
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
  documentation: ["contributing/guides/cli-renderer.md"],
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
    "ignoredCount",
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
    "trustStatus",
    "canonicalStatus",
    "desiredDependencies",
    "resolvedDependencies",
    "drift",
    "recoveryAction",
  ],
  scenarios: ["trusted pack", "drifted workspace pack", "unresolved dependencies"],
  rationale: "Pack inspection joins desired, trusted, canonical, and receipt state.",
  commandCoverage: ["packages/cli/src/root/packs/show.test.ts"],
});

const packRepairFamily = defineResultFamily({
  id: "pack-repair",
  schemaNames: ["PackRepairResultSchema"],
  requiredTopLevelKeys: [
    "pack",
    "authority",
    "canonicalPath",
    "previousContentIdentity",
    "currentContentIdentity",
    "changes",
    "confirmation",
    "result",
    "recoveryAction",
  ],
  scenarios: ["current", "previewed", "requires confirmation", "repaired"],
  rationale: "Pack repair reports the classified trust-baseline transition.",
  humanOutputKind: "mutation",
  commandCoverage: ["packages/cli/src/root/packs/repair.test.ts"],
});

const workspaceStatusFamily = defineResultFamily({
  id: "workspace-status",
  schemaNames: ["WorkspaceStatusSchema"],
  requiredTopLevelKeys: [
    "healthy",
    "desiredGraphComplete",
    "scope",
    "problems",
    "blockedOperations",
  ],
  scenarios: ["healthy workspace", "blocking local problems"],
  rationale: "Workspace status reports local reconciliation health and supported recovery actions.",
  commandCoverage: ["packages/cli/src/root/status.test.ts"],
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

const knowledgeOpenFamily = defineResultFamily({
  id: "knowledge-open",
  schemaNames: ["KnowledgeOpenQueryResultSchema"],
  requiredTopLevelKeys: ["concept"],
  scenarios: ["concept found", "not found"],
  rationale: "Opening a knowledge concept is a read query.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeSearchFamily = defineResultFamily({
  id: "knowledge-search",
  schemaNames: ["KnowledgeSearchQueryResultSchema"],
  requiredTopLevelKeys: ["query", "items", "count"],
  scenarios: ["matches", "no matches"],
  rationale: "Knowledge search is a read query.",
  commandCoverage: ["packages/cli/src/root/knowledge/json-output.test.ts"],
});

const lintFamily = defineResultFamily({
  id: "workspace-lint",
  schemaNames: ["LintResultDocumentSchema", "LintFixDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["clean", "findings", "fixed", "partially fixed", "fix failure"],
  rationale: "Lint query and fix modes share a report, with fix nesting the applied plan.",
  humanOutputKind: "mixed",
  commandCoverage: ["packages/cli/src/root/lint/handler.test.ts"],
});

const outdatedFamily = defineResultFamily({
  id: "outdated",
  schemaNames: ["OutdatedDocumentSchema"],
  requiredTopLevelKeys: ["items", "count"],
  scenarios: ["updates available", "up to date", "mixed sources"],
  rationale: "Outdated is a read query across installed extensions.",
  commandCoverage: ["packages/cli/src/root/outdated/handler.test.ts"],
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

const formatterPaths = [
  "axm",
  "axm auth",
  "axm cache",
  "axm commands",
  "axm files",
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
  "axm commands disable",
  "axm commands enable",
  "axm commands install",
  "axm commands new",
  "axm commands uninstall",
  "axm commands update",
  "axm commands version",
  "axm demote",
  "axm deprecate",
  "axm files disable",
  "axm files enable",
  "axm files install",
  "axm files new",
  "axm files prune",
  "axm files uninstall",
  "axm files update",
  "axm files version",
  "axm hooks disable",
  "axm hooks enable",
  "axm hooks install",
  "axm hooks new",
  "axm hooks prune",
  "axm hooks uninstall",
  "axm hooks update",
  "axm hooks version",
  "axm install",
  "axm knowledge disable",
  "axm knowledge enable",
  "axm knowledge install",
  "axm knowledge new",
  "axm knowledge uninstall",
  "axm knowledge update",
  "axm knowledge version",
  "axm mcps add",
  "axm mcps disable",
  "axm mcps enable",
  "axm mcps import",
  "axm mcps install",
  "axm mcps new",
  "axm mcps remove",
  "axm mcps rm",
  "axm mcps uninstall",
  "axm mcps update",
  "axm mcps version",
  "axm packs add",
  "axm packs install",
  "axm packs new",
  "axm packs remove",
  "axm packs uninstall",
  "axm packs unpack",
  "axm packs version",
  "axm prune",
  "axm rules disable",
  "axm rules enable",
  "axm rules install",
  "axm rules instructions disable",
  "axm rules instructions enable",
  "axm rules new",
  "axm rules uninstall",
  "axm rules update",
  "axm rules version",
  "axm skills copy",
  "axm skills disable",
  "axm skills enable",
  "axm skills install",
  "axm skills new",
  "axm skills prune",
  "axm skills uninstall",
  "axm skills update",
  "axm skills version",
  "axm subagents disable",
  "axm subagents enable",
  "axm subagents install",
  "axm subagents new",
  "axm subagents uninstall",
  "axm subagents update",
  "axm subagents version",
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
  "axm commands publish",
  "axm files publish",
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
    "axm commands list",
    "axm commands ls",
    "axm files list",
    "axm files ls",
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
    "axm commands show",
    "axm files show",
    "axm hooks show",
    "axm knowledge show",
    "axm mcps show",
    "axm rules show",
    "axm skills show",
    "axm subagents show",
  ]),
  ...rowsFor(packShowFamily, ["axm packs show"]),
  ...rowsFor(packRepairFamily, ["axm packs repair"]),
  ...rowsFor(workspaceStatusFamily, ["axm status"]),
  ...rowsFor(helpTopicFamily, ["axm help"]),
  ...rowsFor(hooksInfoFamily, ["axm hooks info"]),
  ...rowsFor(knowledgeLintFamily, ["axm knowledge lint"]),
  ...rowsFor(knowledgeListFamily, ["axm knowledge list", "axm knowledge ls"]),
  ...rowsFor(knowledgeOpenFamily, ["axm knowledge open"]),
  ...rowsFor(knowledgeSearchFamily, ["axm knowledge search"]),
  ...rowsFor(lintFamily, ["axm lint"]),
  ...rowsFor(outdatedFamily, ["axm outdated"]),
  ...rowsFor(instructionsFamily, ["axm rules instructions"]),
  ...rowsFor(setupFamily, ["axm setup"]),
  ...rowsFor(upgradeFamily, ["axm upgrade"]),
  ...rowsFor(viewFamily, ["axm view"]),
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
    documentation: ["contributing/guides/cli-renderer.md"],
  },
  helpSchemaName: "JsonHelpDocSchema",
} satisfies MachineOutputContractRow;
