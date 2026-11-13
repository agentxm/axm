import {
  BlockingClassSchema,
  ErrorCodeSchema,
  OperationPhaseSchema,
} from "@agentxm/workspace-kernel/operations";
import * as Schema from "effect/Schema";
import { workKinds } from "@agentxm/host-primitives/work-observation";
import {
  TraceDetailKindSchema,
  type TraceDetailKind,
  type TraceDetailSelection,
  TraceCommandRouteSchema,
} from "./local-trace-receipt.js";
/* Privacy admission and volume policy for local diagnostic traces. */
export const TRACE_LIMITS = {
  summary: 2048,
  detail: 16384,
  summaryGroups: 512,
} as const;

export const TraceFailureKindSchema = Schema.Literals([
  "expected-absence",
  "not-found",
  "denied",
  "timeout",
  "conflict",
  "interrupted",
  "defect",
  "failure",
]);

// Reuse each schema guard so its parser initializes once across trace attributes.
const isOperationPhase = Schema.is(OperationPhaseSchema);
const isErrorCode = Schema.is(ErrorCodeSchema);
const isTraceFailureKind = Schema.is(TraceFailureKindSchema);
const isBlockingClass = Schema.is(BlockingClassSchema);
const isTraceCommandRoute = Schema.is(TraceCommandRouteSchema);
const isTraceDetailKind = Schema.is(TraceDetailKindSchema);

/** Additive quantities only; attempt ordinals, status codes and capacities are not totals. */
export const traceWorkCounterAttributes = new Set([
  "axm.work.count",
  "axm.work.requested",
  "axm.work.executed",
  "axm.work.reused-count",
  "axm.work.bytes",
  "axm.io.bytes",
  "axm.archive.entries",
  "axm.archive.bytes",
  "axm.registry.batch-size",
  "axm.registry.denied",
  "axm.batch.count",
]);
const numberAttributes = new Set([
  ...traceWorkCounterAttributes,
  "axm.exit.code",
  "http.response.status_code",
  "axm.registry.attempt",
  "axm.registry.max-attempts",
  "axm.wait.milliseconds",
  "axm.wait.capacity",
  "axm.wait.attempts",
  "axm.wait.requested-bytes",
  "axm.admission.capacity",
  "axm.cache.entries-scanned",
  "axm.cache.entries-removed",
  "axm.cache.bytes-freed",
]);
const booleanAttributes = new Set(["axm.work.reused", "axm.work.invalidated", "axm.changed"]);
const attributeValues: Readonly<Record<string, ReadonlyArray<string>>> = {
  "axm.outcome": ["success", "failure", "interrupted"],
  "axm.operation.mode": ["query", "preview", "apply", "unresolved"],
  "axm.operation.outcome": [
    "previewed",
    "applied",
    "no-op",
    "partial",
    "failed",
    "blocked",
    "cancelled",
    "interrupted",
    "completed",
  ],
  "axm.publication.method": ["replace", "in-place"],
  "axm.document.kind": ["settings", "lockfile"],
  "axm.snapshot.kind": ["absent", "copied", "symlink"],
  "axm.format": ["json", "jsonc", "toml", "yaml", "starlark", "vscode-settings"],
  "http.request.method": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
  "axm.registry.purpose": [
    "index",
    "exact-version",
    "metadata",
    "listing",
    "owner",
    "eligibility",
    "download",
    "existence",
    "publish",
    "preview",
    "visibility",
    "discovery",
    "other",
  ],
  "axm.cache.outcome": ["hit", "miss", "corrupt", "coalesced", "bypass"],
  "axm.cache.prune.trigger": ["automatic", "explicit"],
  "axm.native.operation": ["mkdir", "stat", "utimes", "write-file", "unlink", "rmdir"],
  "axm.native.phase": ["acquire", "heartbeat", "release", "cleanup", "exit"],
  "axm.admission.unit": ["permits", "bytes"],
  "axm.invalidation.reason": ["mutation", "phase-exit", "changed-input"],
  "axm.eligibility.phase": ["before-acquisition", "after-confirmation"],
  "axm.observation.operation": [
    "read-file",
    "read-directory",
    "read-directory-entries",
    "access",
    "stat",
    "lstat",
    "real-path",
    "read-link",
    "decode-text",
    "canonical-path",
  ],
  "axm.git.operation": [
    "clone",
    "fetch-commit",
    "list-remote-refs",
    "get-remote-url",
    "get-commit-sha",
    "get-exact-tag",
    "get-tree-sha",
    "compare-directory-to-head",
  ],
  "axm.archive.format": ["zip", "tar", "tar.gz"],
  "axm.manifest.kind": ["pack", "mcp"],
  "axm.auth.purpose": [
    "pkce-exchange",
    "device-authorization",
    "device-token",
    "identity",
    "token-create",
    "token-list",
    "token-delete",
    "session-refresh",
    "workload-exchange",
    "token-revoke",
    "id-token",
  ],
  "axm.auth.cache-kind": ["stored-session", "workload"],
  "axm.update.purpose": ["latest-version", "binary", "checksums"],
  "axm.output.channel": ["stdout", "stderr"],
  "axm.output.format": ["json", "text"],
  "axm.wait.owner": ["settings", "desired-state", "accepted-resolution"],
  "axm.wait.outcome": ["acquired", "timed-out", "interrupted", "failed"],
  "axm.parse.phase": ["prior", "before", "after", "restored", "rendered"],
  "axm.credential.backend": ["keychain", "restricted-file"],
  "axm.credential.operation": ["read", "write", "delete"],
  "axm.credential.outcome": [
    "found",
    "missing",
    "success",
    "unavailable",
    "failure",
    "interrupted",
  ],
  "axm.credential.fallback-reason": ["missing", "unavailable"],
};

/** Routes are supplied from the actual registered command tree, never raw argv. */
export const safeTraceAttribute = (
  key: string,
  value: unknown,
  commandRoutes: ReadonlySet<string> = new Set(),
): boolean => {
  if (key === "axm.operation.phase") return isOperationPhase(value);
  if (key === "axm.failure.category") return isErrorCode(value);
  if (key === "axm.failure.kind") return isTraceFailureKind(value);
  if (key === "axm.wait.class") return isBlockingClass(value);
  if (numberAttributes.has(key))
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER &&
      (key === "axm.wait.milliseconds" || Number.isSafeInteger(value))
    );
  if (booleanAttributes.has(key)) return typeof value === "boolean";
  if (key === "axm.command.route") return isTraceCommandRoute(value) && commandRoutes.has(value);
  if (key === "axm.work.owner") return typeof value === "string" && traceSpanNames.has(value);
  return typeof value === "string" && attributeValues[key]?.includes(value) === true;
};

const detailedWorkKinds: ReadonlySet<string> = new Set(workKinds);
export const isDetailedTraceSpan = (name: string): boolean => detailedWorkKinds.has(name);

export const detailKindForWork = (name: string): TraceDetailKind => {
  if (name.startsWith("axm.io.")) return "io";
  if (
    name.startsWith("axm.parse.") ||
    name === "axm.archive.parse" ||
    name === "axm.archive.read-member" ||
    name === "axm.archive.parse-manifest"
  )
    return "parse";
  if (name.startsWith("axm.hash.")) return "hash";
  if (name.startsWith("axm.native.") || name.startsWith("axm.admission.")) return "native";
  if (name.startsWith("axm.render.") || name.startsWith("axm.cli.")) return "render";
  if (
    name.startsWith("axm.archive.") ||
    name.startsWith("axm.update.") ||
    name === "axm.auth.cache"
  )
    return "cache";
  return "reuse";
};

/** Invalid detail configuration cannot silently select a different capture. */
export const traceDetailSelection = (
  environment: Readonly<Record<string, string | undefined>>,
): TraceDetailSelection | undefined => {
  const value = environment["AXM_TRACE_DETAIL"]?.trim() ?? "";
  const phase = environment["AXM_TRACE_DETAIL_PHASE"]?.trim() || null;
  const kinds: TraceDetailKind[] = [];
  if (value !== "")
    for (const kind of value.split(",")) {
      if (!isTraceDetailKind(kind.trim())) return undefined;
      const selected = Schema.decodeUnknownSync(TraceDetailKindSchema)(kind.trim());
      if (!kinds.includes(selected)) kinds.push(selected);
    }
  if (phase !== null && (!isOperationPhase(phase) || kinds.length === 0)) return undefined;
  return { kinds, phase };
};

export const traceSpanNames = new Set([
  ...workKinds,
  "axm.cli.invocation",
  "axm.http.request",
  "axm.registry.request",
  "axm.registry.attempt",
  "axm.registry.archive-body",
  "axm.process.spawn",
  "axm.observation.phase",
  "axm.resolve.desired-state",
  "axm.resolve.configured-source",
  "axm.observation.read-file",
  "axm.observation.read-directory",
  "axm.observation.read-directory-entries",
  "axm.observation.decode-text",
  "axm.observation.access",
  "axm.observation.stat",
  "axm.observation.lstat",
  "axm.observation.real-path",
  "axm.observation.read-link",
  "axm.observation.canonical-path",
  "axm.observation.pack-document",
  "axm.parse.native",
  "axm.parse.lockfile",
  "axm.archive.parse",
  "axm.archive.parse-manifest",
  "axm.archive.read-member",
  "axm.archive.admit",
  "axm.archive.limits",
  "axm.archive.normalize",
  "axm.archive.decode-manifest",
  "axm.subagent.decode-manifest",
  "axm.subagent.prepare",
  "axm.subagent.compile",
  "axm.subagent.apply",
  "axm.subagent.publish",
  "PublishExtensions.prepare",
  "PublishExtensions.previewOrApply",
  "ListExtensions.query",
  "LocalInspection.query",
  "Inspection.packMembers",
  "Inspection.mcpPackageFacts",
  "ListKnowledge.query",
  "RenderSubagent.query",
  "ViewExtension.read",
  "ExportAcceptedResolutions.query",
  "InstallExtensions.select",
  "InstallExtensions.plan",
  "InstallExtensions.prepare",
  "UpdateExtensions.prepare",
  "LintWorkspace.query",
  "LintWorkspace.fix",
  "SyncWorkspace.prepare",
  "SyncWorkspace.previewOrApply",
  "axm.observation.selected-native",
  "Inspection.listSkills",
  "Inspection.listSubagents",
  "Inspection.listRules",
  "Inspection.listHooks",
  "Inspection.listPacks",
  "Inspection.listMcpServers",
  "axm.publish.prepare",
  "axm.publish.archive",
  "axm.publish.validate-source",
  "axm.publish.upload",
  "axm.publish.file",
  "axm.publish.document",
  "axm.verify.publication",
  "axm.prepare.native",
  "axm.validate.native",
  "axm.rollback.restore",
  "axm.rollback.verify",
  "axm.cli.command",
  "axm.cli.operation",
  "axm.operation.phase",
  "axm.operation.wait",
  "axm.process.run",
  "axm.parse.settings",
  "axm.hash.package",
  "axm.hash.content",
  "axm.hash.execution-materials",
  "axm.registry.eligibility",
  "axm.registry.metadata-batch",
  "axm.registry.metadata-reuse",
  "axm.observation.reuse",
  "axm.observation.invalidate",
  "axm.wait.confirmation",
  "axm.wait.workspace-lock",
  "axm.wait.document-writer",
  "axm.parse.receipts",
  "axm.parse.lockfile-round-trip",
  "axm.parse.lockfile-preservation",
  "axm.hash.receipt",
  "axm.auth.credential-backend",
  "axm.auth.credential-fallback",
  "axm.wait.scratch-budget",
  "axm.publish.snapshot",
  "axm.publish.conflict-check",
  "axm.publish.prepare-document",
  "axm.publish.receipts",
  "axm.registry.retry-wait",
  "axm.archive.cache-read",
  "axm.archive.cache-load",
  "axm.archive.cache-write",
  "axm.archive.cache-verify",
  "axm.archive.cache-prune",
  "axm.archive.integrity",
  "axm.archive.extraction",
  "axm.resolve.desired-state-reuse",
  "axm.wait.file-lock",
  "axm.wait.workspace-admission",
  "UninstallExtensions.prepare",
  "CreateExtension.prepare",
  "ImportNativeExtension.prepare",
  "ForkExtension.prepare",
  "AdoptExtension.prepare",
  "ChangePackMembership.prepare",
  "ChangeAuthoredVersion.prepare",
  "DiscoverExtensions.query",
  "ShareWorkspace.query",
  "KnowledgeDiscovery.query",
  "KnowledgeDiscovery.get",
  "KnowledgeDiscovery.resolve",
  "KnowledgeDiscovery.related",
  "Knowledge.lint",
  "ExportLock.query",
  "SourceHostProviders.fetch",
  "SourceHostProviders.find",
  "ManagePublishedVisibility.status",
  "ManagePublishedVisibility.set",
  "ManagePublishedVisibility.reconcile",
  "RetirePublishedVersion.yank",
  "RetirePublishedVersion.unyank",
  "DeprecatePublishedExtension.deprecate",
  "DeprecatePublishedExtension.undeprecate",
  "ArchivePublishedExtension.archive",
  "ArchivePublishedExtension.unarchive",
  "axm.io.access",
  "axm.io.copy",
  "axm.io.copy-file",
  "axm.io.chmod",
  "axm.io.chown",
  "axm.io.link",
  "axm.io.make-directory",
  "axm.io.make-temp-directory",
  "axm.io.make-temp-file",
  "axm.io.open",
  "axm.io.read-directory",
  "axm.io.read-directory-entries",
  "axm.io.read-file",
  "axm.io.read-link",
  "axm.io.real-path",
  "axm.io.remove",
  "axm.io.rename",
  "axm.io.stat",
  "axm.io.lstat",
  "axm.io.symlink",
  "axm.io.truncate",
  "axm.io.utimes",
  "axm.io.write-file",
  "axm.io.file-stat",
  "axm.io.seek",
  "axm.io.sync",
  "axm.io.file-read",
  "axm.io.file-truncate",
  "axm.io.file-write",
  "axm.cli.execution",
  "axm.cli.error-render",
  "axm.cli.output",
  "axm.cli.render",
  "axm.native.canonical-path",
  "axm.native.unlink",
  "axm.native.remove-directory",
  "axm.native.lock-acquire",
  "axm.native.lock-release",
  "axm.native.lock-cleanup",
  "axm.native.lock-io",
  "axm.hash.instruction-witness",
  "axm.hash.git-payload",
  "axm.hash.git-ignore",
  "axm.hash.desired-state",
  "axm.hash.targeted-update",
  "axm.hash.execution-candidate",
  "axm.hash.execution-configuration",
  "axm.hash.sync-observations",
  "axm.native.account-home",
  "axm.hash.materialized-tree",
  "axm.hash.distribution-tree",
  "axm.hash.preimage",
  "axm.archive.external-decode",
  "axm.archive.external-extract",
  "axm.parse.manifest",
  "axm.parse.lockfile-decode",
  "axm.parse.settings-round-trip",
  "axm.render.settings",
  "axm.observation.pack-reuse",
  "axm.git.operation",
  "axm.auth.request",
  "axm.auth.poll-wait",
  "axm.auth.retry-wait",
  "axm.wait.credential-file-lock",
  "axm.wait.session-refresh",
  "axm.auth.cache",
  "axm.auth.session-refresh",
  "axm.update.request",
  "axm.update.body",
  "axm.update.integrity",
  "axm.update.cache",
  "axm.artifact.body",
  "axm.artifact.integrity",
  "axm.process.account-home",
  "AuthClient.createToken",
  "AuthClient.deleteToken",
  "AuthClient.exchangePkceCode",
  "AuthClient.getMe",
  "AuthClient.initiateDeviceFlow",
  "AuthClient.listTokens",
  "AuthClient.pollDeviceToken",
  "CredentialStore.clear",
  "CredentialStore.load",
  "CredentialStore.save",
  "Identity.current",
  "Identity.currentToken",
  "Identity.requireSignedIn",
  "Login.run",
  "Logout.run",
  "PendingDeviceLoginStore.clear",
  "PendingDeviceLoginStore.load",
  "PendingDeviceLoginStore.save",
  "SessionRefresher.fresh",
  "TokenExchange.exchangeWorkloadToken",
  "TokenExchange.refreshToken",
  "TokenExchange.revokeToken",
  "Tokens.create",
  "Tokens.list",
  "Tokens.revoke",
  "WorkloadCredentials.tokenFor",
  "SelfUpdate.applyUpgrade",
  "SelfUpdate.assessUpgrade",
  "SelfUpdate.prepareUpgrade",
  "SelfUpdate.selectUpgradeRelease",
  "StartupUpdateCheck.run",
  "cliMaintenance.applyScriptUpgrade",
  "selfUpdate.applyHomebrew",
  "selfUpdate.applyPackageUpgrade",
  "selfUpdate.applyRegistryPackage",
]);

/** Aggregation follows invocation, operation and cache-maintenance intervals, not each item. */
export const isSummaryOwner = (name: string) =>
  name === "axm.cli.invocation" ||
  name === "axm.cli.command" ||
  name === "axm.cli.operation" ||
  name === "axm.operation.phase" ||
  name === "axm.archive.cache-prune";

/** The private aggregate logger admits only the bounded typed fact payload. */
export const safeTraceAggregateAttribute = (key: string, value: unknown): boolean => {
  // The session already admitted the exact command-tree route. This private
  // serialization boundary preserves that fact without another route catalog.
  if (key === "axm.command.route") return isTraceCommandRoute(value);
  if (key === "axm.summary.schema-version") return value === 1;
  if (key === "axm.summary.kind")
    return typeof value === "string" && traceSpanNames.has(value) && value !== "axm.cli.invocation";
  if (key === "axm.summary.owner") return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
  if (
    key === "axm.summary.count" ||
    key === "axm.summary.duration-measured" ||
    key === "axm.summary.work-duration-us"
  )
    return (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= (key === "axm.summary.count" ? 1 : 0)
    );
  if (key.startsWith("axm.measured."))
    return (
      traceWorkCounterAttributes.has("axm." + key.slice("axm.measured.".length)) &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0
    );
  return safeTraceAttribute(key, value);
};

const ownerPrefixes = [...new Set([...traceSpanNames].map((name) => name.split(".")[0] + "."))];
/** New work in an owned namespace must be admitted or make evidence incomplete. */
export const isOwnedTraceSpan = (name: string) =>
  ownerPrefixes.some((prefix) => name.startsWith(prefix));
