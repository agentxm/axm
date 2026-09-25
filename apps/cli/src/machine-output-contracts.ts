/**
 * CLI human and machine output contract register.
 *
 * This is deliberately indexed by every command path exposed by the real
 * Effect CLI command tree. `machine-output-contracts.test.ts` compares these
 * rows with that tree using exact equality, so adding, removing, or aliasing a
 * command requires explicit result, liveness and human-scenario decisions.
 *
 * The schema names refer to the named Effect Schema used at the renderer call
 * boundary. Success envelopes add `ok` and may add `summary` / `suggestions`.
 * Built-in help and version documents are formatter-owned exceptions and do
 * not use the success envelope.
 */

export type MachineOutputClass = "formatter-help" | "structured-result" | "json-refused";
export type HumanOutputKind = "orientation" | "query" | "mutation" | "mixed";
export type LivenessClass = "immediate" | "progress";

export interface MachineOutputFamily {
  readonly id: string;
  readonly outputClass: MachineOutputClass;
  readonly humanOutputKind: HumanOutputKind;
  readonly liveness: LivenessClass;
  readonly livenessCoverage: ReadonlyArray<string>;
  readonly humanCoverage: ReadonlyArray<{
    readonly file: string;
    readonly scenarios: ReadonlyArray<string>;
  }>;
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
  humanCoverage: [
    {
      file: "apps/cli/src/formatter.test.ts",
      scenarios: ["group orientation", "usage errors", "help"],
    },
  ],
  outputClass: "formatter-help",
  humanOutputKind: "orientation",
  liveness: "immediate",
  livenessCoverage: ["apps/cli/src/formatter.test.ts"],
  schemaNames: ["JsonHelpDocSchema"],
  requiredEnvelopeKeys: ["type", "name", "usage"],
  requiredTopLevelKeys: ["type", "name", "usage"],
  optionalTopLevelKeys: ["summary", "arguments", "flags", "subcommands", "examples", "learnMore"],
  scenarios: ["group invoked without a subcommand", "explicit --help on every command path"],
  rationale: "Effect CLI owns built-in help rendering before a command handler runs.",
  centralizedCoverage: [
    "apps/cli/src/machine-output-contracts.test.ts",
    "apps/cli/src/formatter.test.ts",
  ],
  commandCoverage: [],
  documentation: ["docs/architecture/commands/output.md"],
} satisfies MachineOutputFamily;

const planFamily = {
  id: "plan-resolution",
  humanCoverage: [
    {
      file: "apps/cli/src/operation-output.test.ts",
      scenarios: [
        "preview",
        "apply",
        "no-op",
        "partial failure",
        "blocked",
        "interrupted",
        "recovery",
      ],
    },
  ],
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  livenessCoverage: [
    "apps/cli/src/screen/machine-progress-events-follow-the-lifecycle-schema.spec.ts",
    "packages/core/workspace/src/transitions/planning/plan/long-running-operations-emit-lifecycle-events.spec.ts",
    "packages/core/workspace/src/transitions/planning/plan/resolve-plan.test.ts",
    "apps/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  schemaNames: ["PlanResolutionDocumentSchema"],
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", "result"],
  optionalTopLevelKeys: ["summary", "suggestions"],
  scenarios: [
    "applied",
    "previewed",
    "cancelled",
    "no-op",
    "partial failure",
    "failed",
    "blocked",
    "interrupted",
    "recovery required",
  ],
  rationale: "Mutations expose one durable plan-resolution result across all execution outcomes.",
  centralizedCoverage: [
    "apps/cli/src/operation-output.test.ts",
    "apps/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  commandCoverage: ["command-specific tests cover branches not represented by the shared plan"],
  documentation: ["docs/architecture/commands/output.md"],
} satisfies MachineOutputFamily;

const publishFamily = {
  id: "publish",
  humanCoverage: [
    {
      file: "apps/cli/src/root/publish/command.test.ts",
      scenarios: ["review", "published URLs", "no-op", "blocked", "unknown settlement", "quiet"],
    },
  ],
  outputClass: "structured-result",
  humanOutputKind: "mutation",
  liveness: "progress",
  livenessCoverage: [
    "apps/cli/src/root/publish/command.test.ts",
    "apps/cli-e2e/src/cli-commands/skills/publish/publish.e2e.ts",
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
    "apps/cli/src/root/publish/command.test.ts",
    "apps/cli-e2e/src/cli-commands/structured-output.e2e.ts",
  ],
  commandCoverage: ["apps/cli/src/root/publish/command.test.ts"],
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
  readonly liveness: LivenessClass;
  readonly livenessCoverage?: ReadonlyArray<string>;
  readonly humanCoverage: MachineOutputFamily["humanCoverage"];
}): MachineOutputFamily => ({
  id: input.id,
  outputClass: "structured-result",
  humanOutputKind: input.humanOutputKind ?? "query",
  liveness: input.liveness,
  livenessCoverage: input.livenessCoverage ?? input.commandCoverage,
  humanCoverage: input.humanCoverage,
  schemaNames: input.schemaNames,
  requiredEnvelopeKeys: ["ok", "result"],
  requiredTopLevelKeys: ["ok", ...input.requiredTopLevelKeys],
  optionalTopLevelKeys: ["summary", "suggestions", ...(input.optionalTopLevelKeys ?? [])],
  scenarios: input.scenarios,
  rationale: input.rationale,
  centralizedCoverage: [
    "apps/cli/src/machine-output-contracts.test.ts",
    "apps/cli/src/screen/screen-machine.test.ts",
  ],
  commandCoverage: input.commandCoverage,
  documentation: ["docs/architecture/commands/output.md"],
});

const agentsListFamily = defineResultFamily({
  id: "agents-list",
  liveness: "progress",
  humanCoverage: [
    { file: "apps/cli/src/root/agents/list.test.ts", scenarios: ["configured", "empty"] },
  ],
  schemaNames: ["AgentsListOutputSchema"],
  requiredTopLevelKeys: ["items", "configured", "detected", "available", "count"],
  scenarios: ["configured agents", "empty workspace"],
  rationale: "Agent discovery returns inventory and source counts rather than a mutation plan.",
  commandCoverage: ["apps/cli/src/root/agents/list.test.ts"],
});

const agentCapabilitiesFamily = defineResultFamily({
  id: "agent-capabilities",
  liveness: "immediate",
  humanCoverage: [
    {
      file: "apps/cli/src/root/agents/capabilities.test.ts",
      scenarios: ["known agent", "unknown agent"],
    },
  ],
  schemaNames: ["AgentCapabilitiesOutputSchema"],
  requiredTopLevelKeys: ["agent", "name", "lifecycle", "supported", "items", "count"],
  scenarios: ["known agent", "unknown agent"],
  rationale: "Capability inspection is a read query.",
  commandCoverage: ["apps/cli/src/root/agents/capabilities.test.ts"],
});

const loginFamily = defineResultFamily({
  id: "login",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/auth/login.test.ts",
      scenarios: ["sign-in", "already signed in", "pending handoff", "cancelled"],
    },
  ],
  schemaNames: ["LoginDocumentSchema", "LoginNoOpDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["logged in", "already logged in", "auth failure"],
  rationale: "Login reports the authoritative registry authentication transition.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "apps/cli/src/root/auth/login.test.ts",
    "packages/supporting/registry-access/src/authentication/device-login.test.ts",
    "packages/supporting/registry-access/src/adapters/loopback-login.test.ts",
  ],
});

const logoutFamily = defineResultFamily({
  id: "logout",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/auth/logout.test.ts",
      scenarios: ["signed out", "local-only sign-out", "not signed in"],
    },
  ],
  schemaNames: ["LogoutDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["logged out", "local-only logout", "not logged in"],
  rationale: "Logout reports the durable credential operation and its status.",
  humanOutputKind: "mutation",
  commandCoverage: ["apps/cli/src/root/auth/logout.test.ts"],
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
    humanCoverage: [
      {
        file: "apps/cli/src/root/auth/token.test.ts",
        scenarios: ["explicit raw credential", "JSON refusal"],
      },
      {
        file: "apps/cli/src/root/auth/token-create-revokes-undelivered-token.spec.ts",
        scenarios: ["acknowledged delivery", "delivery failure"],
      },
    ],
    outputClass: "json-refused",
    humanOutputKind,
    liveness,
    livenessCoverage: ["apps/cli/src/root/auth/token.test.ts"],
    schemaNames: ["JsonErrorEnvelopeSchema"],
    requiredEnvelopeKeys: ["ok", "code", "title", "detail"],
    requiredTopLevelKeys: ["ok", "code", "title", "detail"],
    optionalTopLevelKeys: ["suggestions"],
    scenarios: ["--json refused as usage before any credential effect"],
    rationale:
      "No JSON success document may carry a secret; `--output token` is the explicit export channel.",
    centralizedCoverage: ["apps/cli/src/machine-output-contracts.test.ts"],
    commandCoverage: [
      "apps/cli/src/root/auth/token.test.ts",
      "apps/cli-e2e/src/cli-commands/auth/token/token.e2e.ts",
    ],
    documentation: ["docs/architecture/commands/output.md"],
  }) satisfies MachineOutputFamily;

const tokenListFamily = defineResultFamily({
  id: "token-list",
  liveness: "progress",
  humanCoverage: [{ file: "apps/cli/src/root/auth/token.test.ts", scenarios: ["tokens", "empty"] }],
  schemaNames: ["TokenListDocumentSchema"],
  requiredTopLevelKeys: ["items", "count", "hasMore", "cursor"],
  scenarios: ["tokens present", "empty list", "auth failure"],
  rationale: "Token listing is a paginated read query.",
  commandCoverage: ["apps/cli/src/root/auth/token.test.ts"],
});

const tokenRevokeFamily = defineResultFamily({
  id: "token-revoke",
  liveness: "progress",
  humanCoverage: [{ file: "apps/cli/src/root/auth/token.test.ts", scenarios: ["revoked"] }],
  schemaNames: ["RevokeTokenDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["revoked", "auth failure"],
  rationale: "Revocation reports one durable credential operation.",
  humanOutputKind: "mutation",
  commandCoverage: ["apps/cli/src/root/auth/token.test.ts"],
});

const whoamiFamily = defineResultFamily({
  id: "whoami",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/auth/whoami.test.ts",
      scenarios: ["account authority", "limited authority"],
    },
  ],
  schemaNames: ["WhoamiDocumentSchema"],
  requiredTopLevelKeys: ["data"],
  scenarios: ["authenticated", "auth failure"],
  rationale: "Identity inspection is a read query.",
  commandCoverage: ["apps/cli/src/root/auth/whoami.test.ts"],
});

const cacheStatusFamily = defineResultFamily({
  id: "cache-status",
  liveness: "progress",
  humanCoverage: [{ file: "apps/cli/src/root/cache/command.test.ts", scenarios: ["status"] }],
  schemaNames: ["CacheStatusOutputSchema"],
  requiredTopLevelKeys: ["entries", "bytes", "maxBytes", "maxAgeDays"],
  scenarios: ["populated cache", "empty cache"],
  rationale: "Cache status is a read query.",
  commandCoverage: [
    "packages/supporting/registry-client/src/archive-cache/enforces-reported-retention-limits.spec.ts",
  ],
});

const cacheVerifyFamily = defineResultFamily({
  id: "cache-verify",
  liveness: "progress",
  humanCoverage: [{ file: "apps/cli/src/root/cache/command.test.ts", scenarios: ["verification"] }],
  schemaNames: ["CacheVerifyOutputSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["valid", "invalid entries"],
  rationale: "Cache verification returns a purpose-built verification result.",
  commandCoverage: [
    "packages/supporting/registry-client/src/archive-cache/removes-only-corrupt-archives.spec.ts",
  ],
});

const cachePruneFamily = defineResultFamily({
  id: "cache-prune",
  liveness: "progress",
  humanCoverage: [{ file: "apps/cli/src/root/cache/command.test.ts", scenarios: ["maintenance"] }],
  schemaNames: ["CachePruneOutputSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["pruned", "no-op"],
  rationale: "Cache pruning reports cache-specific byte and entry counts.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "packages/supporting/registry-client/src/archive-cache/enforces-reported-retention-limits.spec.ts",
  ],
});

const discoverFamily = defineResultFamily({
  id: "discover",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/discover/handler.test.ts",
      scenarios: ["matches", "empty", "unavailable registry"],
    },
  ],
  schemaNames: ["DiscoverOutputSchema"],
  requiredTopLevelKeys: ["items", "count", "totalDetected", "registryAvailable"],
  scenarios: ["matches", "no matches", "registry unavailable"],
  rationale: "Discovery is a read query with registry availability metadata.",
  commandCoverage: [
    "apps/cli/src/root/discover/handler.test.ts",
    "packages/core/workspace/src/discovery/discover/reports-companions-for-detected-dependencies.spec.ts",
  ],
});

const inventoryFamily = defineResultFamily({
  id: "extension-inventory",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/list-empty-output.test.ts",
      scenarios: ["empty inventory"],
    },
  ],
  schemaNames: ["ExtensionInventorySchema"],
  requiredTopLevelKeys: [
    "items",
    "count",
    "configuredCount",
    "implicitCount",
    "installedCount",
    "leftoverCount",
    "undeclaredCount",
    "unmanagedCount",
  ],
  scenarios: ["extensions present", "empty inventory", "mixed managed state"],
  rationale: "Per-type list commands share the workspace inventory query contract.",
  commandCoverage: ["apps/cli/src/root/list-empty-output.test.ts", "per-type list tests"],
});

const extensionShowFamily = defineResultFamily({
  id: "extension-show",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/shared/extension-show.test.ts",
      scenarios: ["identity", "source", "scope"],
    },
  ],
  schemaNames: ["ExtensionShowResultSchema"],
  requiredTopLevelKeys: ["item", "agents"],
  scenarios: ["extension found", "not found"],
  rationale: "Per-type show commands share the extension detail query contract.",
  commandCoverage: ["apps/cli/src/root/shared/extension-show.test.ts"],
});

const mcpInventoryFamily: MachineOutputFamily = {
  ...inventoryFamily,
  id: "mcp-inventory",
  schemaNames: ["McpServerListQueryResultSchema"],
  humanCoverage: [
    {
      file: "apps/cli/src/root/list-empty-output.test.ts",
      scenarios: ["local server names", "managed state"],
    },
  ],
  commandCoverage: ["apps/cli/src/root/list-empty-output.test.ts"],
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
    "target",
    "disposition",
    "restorable",
    "message",
  ],
  optionalTopLevelKeys: ["version", "affectedVersions"],
  scenarios: ["yanked", "unyanked", "already current"],
  rationale: "Version retirement is an authoritative, non-restorable Registry transition.",
  commandCoverage: ["apps/cli/src/root/lifecycle/command.test.ts"],
  humanCoverage: [
    {
      file: "apps/cli/src/root/lifecycle/command.test.ts",
      scenarios: ["remote disposition", "target"],
    },
  ],
});

const packShowFamily = defineResultFamily({
  id: "pack-show",
  liveness: "progress",
  humanCoverage: [
    { file: "apps/cli/src/root/packs/show.test.ts", scenarios: ["pack authority", "dependencies"] },
  ],
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
  commandCoverage: ["apps/cli-e2e/src/cli-commands/packs/packs.e2e.ts"],
});

const helpTopicFamily = defineResultFamily({
  id: "help-topic",
  humanCoverage: [
    { file: "apps/cli/src/root/help/command.test.ts", scenarios: ["index", "topic", "raw schema"] },
  ],
  schemaNames: ["HelpIndexResultSchema", "HelpTopicResultSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["usage", "topics", "topic", "content"],
  scenarios: ["topic index", "topic page", "schema topic", "unknown topic"],
  rationale: "The help command returns raw topic data; built-in --help remains formatter-owned.",
  humanOutputKind: "orientation",
  liveness: "immediate",
  commandCoverage: ["apps/cli/src/root/help/command.test.ts"],
});

const knowledgeLintFamily = defineResultFamily({
  id: "knowledge-lint",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["coordinate findings", "error tally"],
    },
  ],
  schemaNames: ["KnowledgeLintQueryResultSchema"],
  requiredTopLevelKeys: ["valid", "diagnostics"],
  scenarios: ["valid bundle", "diagnostics"],
  rationale: "Knowledge linting returns a bundle-validation query result.",
  commandCoverage: ["apps/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeListFamily = defineResultFamily({
  id: "knowledge-list",
  liveness: "progress",
  humanCoverage: [
    { file: "apps/cli/src/root/knowledge/json-output.test.ts", scenarios: ["bundle inventory"] },
  ],
  schemaNames: ["KnowledgeListQueryResultSchema"],
  requiredTopLevelKeys: ["items", "count"],
  scenarios: ["bundles present", "empty"],
  rationale: "Knowledge bundle listing is a read query.",
  commandCoverage: ["apps/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptGetFamily = defineResultFamily({
  id: "knowledge-concept-get",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["human discovery result on stdout", "inspection liveness"],
    },
  ],
  schemaNames: ["KnowledgeConceptGetOutputSchema", "KnowledgeConceptCorpusChangingFailureSchema"],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["concept", "reason", "ref", "expectedRevision", "currentRevision"],
  scenarios: ["concept found", "revision changed", "not found"],
  rationale: "Concept get returns exact source and resolved revision identity.",
  commandCoverage: ["apps/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptQueryFamily = defineResultFamily({
  id: "knowledge-concept-query",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["human discovery result on stdout", "inspection liveness"],
    },
  ],
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
  commandCoverage: ["apps/cli/src/root/knowledge/json-output.test.ts"],
});

const knowledgeConceptResolveFamily = defineResultFamily({
  id: "knowledge-concept-resolve",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["human discovery result on stdout", "inspection liveness"],
    },
  ],
  schemaNames: [
    "KnowledgeConceptResolveOutputSchema",
    "KnowledgeConceptCorpusChangingFailureSchema",
  ],
  requiredTopLevelKeys: ["outcome"],
  optionalTopLevelKeys: ["candidate", "candidates", "reason"],
  scenarios: ["resolved", "ambiguous", "not found", "corpus changing"],
  rationale: "Concept resolution returns one identity or bounded candidates.",
  commandCoverage: [
    "packages/core/workspace/src/knowledge/query/graph/resolves-exact-reference.spec.ts",
    "packages/core/workspace/src/knowledge/query/graph/requires-explicit-fuzzy-resolution.spec.ts",
  ],
});

const knowledgeConceptRelatedFamily = defineResultFamily({
  id: "knowledge-concept-related",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["human discovery result on stdout", "inspection liveness"],
    },
  ],
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
  commandCoverage: [
    "packages/core/workspace/src/knowledge/query/graph/traverses-authored-links.spec.ts",
  ],
});

const knowledgeConceptStatusFamily = defineResultFamily({
  id: "knowledge-concept-status",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/knowledge/json-output.test.ts",
      scenarios: ["human discovery result on stdout", "inspection liveness"],
    },
  ],
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
    "changing corpus",
    "unavailable corpus after capture failure",
    "cross-scope collisions not determined",
  ],
  rationale: "Discovery status exposes the canonical capabilities and selected corpus identity.",
  commandCoverage: ["apps/cli/src/root/knowledge/json-output.test.ts"],
});

const lintFamily = defineResultFamily({
  id: "workspace-lint",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/lint/handler.test.ts",
      scenarios: ["findings", "clean", "normalization"],
    },
  ],
  schemaNames: ["LintResultDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["clean", "findings", "normalized findings"],
  rationale: "Lint query and normalized fix modes share one fact-report contract.",
  humanOutputKind: "mixed",
  commandCoverage: ["apps/cli/src/root/lint/handler.test.ts"],
});

const extensionListFamily = defineResultFamily({
  id: "extension-list",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/list/command.test.ts",
      scenarios: ["inventory", "updates", "coverage"],
    },
  ],
  schemaNames: ["ExtensionListDocumentSchema"],
  requiredTopLevelKeys: ["filter", "items", "count", "totalCount"],
  scenarios: ["local inventory", "updates available", "deprecated", "incomplete coverage"],
  rationale: "Root list is a local inventory query with optional remote filters.",
  commandCoverage: ["apps/cli/src/root/list/command.test.ts"],
});

const instructionsFamily = defineResultFamily({
  id: "instructions-status",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/instructions.test.ts",
      scenarios: ["enabled", "disabled", "stale targets"],
    },
  ],
  schemaNames: ["InstructionsStatusOutputSchema"],
  requiredTopLevelKeys: ["enabled", "sourceFileName", "gitignoreAliases", "roots", "items"],
  scenarios: ["enabled", "disabled", "mixed roots"],
  rationale: "Instructions status is a read query; enable and disable remain plan mutations.",
  humanOutputKind: "mixed",
  commandCoverage: ["apps/cli/src/root/instructions.test.ts"],
});

const setupFamily = defineResultFamily({
  id: "setup",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/setup.test.ts",
      scenarios: ["setup", "preview", "already initialized", "partial result"],
    },
  ],
  schemaNames: ["SetupDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["initialized", "already initialized", "previewed", "partial failure"],
  rationale: "Setup has additional discovery data nested in its purpose-built operation result.",
  humanOutputKind: "mutation",
  commandCoverage: ["apps/cli/src/root/setup.test.ts"],
});

const shareFamily = defineResultFamily({
  id: "workspace-share",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/share/command.test.ts",
      scenarios: ["copyable locator", "availability"],
    },
  ],
  schemaNames: ["ShareWorkspaceDocumentSchema"],
  requiredTopLevelKeys: [
    "command",
    "origin",
    "locator",
    "availability",
    "extensions",
    "installCommand",
  ],
  scenarios: ["available origin", "unavailable origin", "missing origin", "empty selection"],
  rationale:
    "Share is a read-only repository query that reports the live origin and exact typed install selection.",
  commandCoverage: ["packages/core/workspace/src/sharing/share-workspace.spec.ts"],
});

const upgradeFamily = defineResultFamily({
  id: "upgrade",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/upgrade/handler.test.ts",
      scenarios: ["ownership", "delegation", "failure evidence", "quiet"],
    },
  ],
  schemaNames: ["UpgradeDocumentSchema"],
  requiredTopLevelKeys: ["result"],
  scenarios: ["upgraded", "already current", "previewed", "interrupted", "verification failure"],
  rationale: "CLI upgrade reports the package-manager command and verification outcome.",
  humanOutputKind: "mutation",
  commandCoverage: ["apps/cli/src/root/upgrade/handler.test.ts"],
});

const viewFamily = defineResultFamily({
  id: "registry-view",
  liveness: "progress",
  humanCoverage: [
    { file: "apps/cli/src/root/view/handler.test.ts", scenarios: ["page", "scalar", "versions"] },
  ],
  schemaNames: ["ViewDocumentSchema", "ViewFieldValueSchema"],
  requiredTopLevelKeys: [],
  optionalTopLevelKeys: ["data", "value"],
  scenarios: ["full document", "scalar field", "versions field", "not found"],
  rationale: "Registry view returns either the full extension document or one selected field.",
  commandCoverage: ["apps/cli/src/root/view/handler.test.ts"],
});

const visibilityEvaluationFamily = defineResultFamily({
  id: "visibility-evaluation",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/visibility/handler.test.ts",
      scenarios: ["intent", "actual state", "findings"],
    },
  ],
  schemaNames: ["VisibilityEvaluationSchema"],
  requiredTopLevelKeys: ["target", "intent", "actual", "comparison", "findings"],
  scenarios: ["matching intent", "drift", "unconfigured", "not established", "unavailable"],
  rationale:
    "Visibility status reports repository intent and authoritative Registry state without mutation.",
  commandCoverage: [
    "packages/core/workspace/src/publishing/visibility/status-reports-repository-intent-and-registry-evaluation.spec.ts",
  ],
});

const visibilityMutationFamily = defineResultFamily({
  id: "visibility-mutation",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/visibility/handler.test.ts",
      scenarios: ["changed", "already satisfied", "revision"],
    },
  ],
  schemaNames: ["VisibilityMutationResultSchema"],
  requiredTopLevelKeys: ["target", "before", "after", "authority", "result", "revision"],
  scenarios: ["changed", "already satisfied", "stale revision", "step-up required"],
  rationale:
    "Visibility administration reports the conditional whole-Extension mutation and resulting revision.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "packages/core/workspace/src/publishing/visibility/set-uses-explicit-intent-and-observed-revision.spec.ts",
    "packages/core/workspace/src/publishing/visibility/reconcile-applies-declared-repository-intent.spec.ts",
  ],
});

const lifecycleTransitionFamily = defineResultFamily({
  id: "lifecycle-transition",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/lifecycle/command.test.ts",
      scenarios: ["deprecated", "restored", "revision"],
    },
  ],
  schemaNames: ["LifecycleTransitionOutputSchema"],
  requiredTopLevelKeys: ["target", "before", "after", "disposition", "revision"],
  scenarios: ["created", "edited", "restored", "unchanged", "stale revision"],
  rationale:
    "Deprecation administration reports the authoritative conditional Registry transition without a local workspace artifact.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "packages/core/workspace/src/publishing/deprecation/updates-guidance-at-the-observed-revision.spec.ts",
    "packages/core/workspace/src/publishing/deprecation/removes-guidance-at-the-observed-revision.spec.ts",
  ],
});

const archivalTransitionFamily = defineResultFamily({
  id: "archival-transition",
  liveness: "progress",
  humanCoverage: [
    {
      file: "apps/cli/src/root/lifecycle/command.test.ts",
      scenarios: ["archived", "restored", "revision"],
    },
  ],
  schemaNames: ["ArchivalTransitionOutputSchema"],
  requiredTopLevelKeys: ["target", "before", "after", "disposition", "revision"],
  scenarios: ["created", "edited", "restored", "unchanged", "stale revision"],
  rationale:
    "Archival administration reports the authoritative conditional Registry transition without a local workspace artifact.",
  humanOutputKind: "mutation",
  commandCoverage: [
    "packages/core/workspace/src/publishing/archival/archives-at-the-observed-revision.spec.ts",
    "packages/core/workspace/src/publishing/archival/unarchives-at-the-observed-revision.spec.ts",
  ],
});

const formatterPaths = [
  "axm",
  "axm agents",
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
  "axm demote",
  "axm fork",
  "axm hooks disable",
  "axm hooks enable",
  "axm hooks install",
  "axm hooks new",
  "axm hooks uninstall",
  "axm hooks update",
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
  "axm migrate",
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
  "axm instructions disable",
  "axm instructions enable",
  "axm rules new",
  "axm rules uninstall",
  "axm rules update",
  "axm skills disable",
  "axm skills enable",
  "axm skills import",
  "axm skills install",
  "axm skills new",
  "axm skills uninstall",
  "axm skills update",
  "axm subagents disable",
  "axm subagents enable",
  "axm subagents import",
  "axm subagents install",
  "axm subagents new",
  "axm subagents uninstall",
  "axm subagents update",
  "axm sync",
  "axm uninstall",
  "axm update",
  "axm version",
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
  ...rowsFor(registryTransitionFamily, ["axm yank", "axm unyank"]),
  ...rowsFor(lifecycleTransitionFamily, ["axm deprecate", "axm undeprecate"]),
  ...rowsFor(archivalTransitionFamily, ["axm archive", "axm unarchive"]),
  ...rowsFor(publishFamily, publishPaths),
  ...rowsFor(agentsListFamily, ["axm agents list"]),
  ...rowsFor(agentCapabilitiesFamily, ["axm agents capabilities"]),
  ...rowsFor(loginFamily, ["axm login"]),
  ...rowsFor(logoutFamily, ["axm logout"]),
  ...rowsFor(credentialExportFamily("token-read", "query", "immediate"), ["axm token"]),
  ...rowsFor(credentialExportFamily("token-create", "mutation", "progress"), ["axm token create"]),
  ...rowsFor(tokenListFamily, ["axm token list"]),
  ...rowsFor(tokenRevokeFamily, ["axm token revoke"]),
  ...rowsFor(whoamiFamily, ["axm whoami"]),
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
    "axm subagents show",
  ]),
  ...rowsFor(packShowFamily, ["axm packs show"]),
  ...rowsFor(helpTopicFamily, ["axm help"]),
  ...rowsFor(knowledgeLintFamily, ["axm knowledge lint"]),
  ...rowsFor(knowledgeListFamily, ["axm knowledge list"]),
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
  ...rowsFor(instructionsFamily, ["axm instructions"]),
  ...rowsFor(setupFamily, ["axm setup"]),
  ...rowsFor(shareFamily, ["axm share"]),
  ...rowsFor(upgradeFamily, ["axm upgrade"]),
  ...rowsFor(viewFamily, ["axm view"]),
  ...rowsFor(visibilityEvaluationFamily, ["axm visibility status"]),
  ...rowsFor(visibilityMutationFamily, ["axm visibility set", "axm visibility reconcile"]),
];

export const FORMATTER_VERSION_CONTRACT = {
  path: "axm --version",
  family: {
    id: "formatter-version",
    humanCoverage: [{ file: "apps/cli/src/formatter.test.ts", scenarios: ["version"] }],
    outputClass: "formatter-help",
    humanOutputKind: "orientation",
    liveness: "immediate",
    livenessCoverage: ["apps/cli/src/formatter.test.ts"],
    schemaNames: ["JsonVersionDocSchema"],
    requiredEnvelopeKeys: ["type", "name", "version"],
    requiredTopLevelKeys: ["type", "name", "version"],
    optionalTopLevelKeys: [],
    scenarios: ["explicit --version"],
    rationale: "Effect CLI owns built-in version rendering before a command handler runs.",
    centralizedCoverage: [
      "apps/cli/src/machine-output-contracts.test.ts",
      "apps/cli/src/formatter.test.ts",
    ],
    commandCoverage: [],
    documentation: ["docs/architecture/commands/output.md"],
  },
  helpSchemaName: "JsonHelpDocSchema",
} satisfies MachineOutputContractRow;
