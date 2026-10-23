import { createHash } from "node:crypto";
import { platform } from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { fromFileLocation, redactCredentialText } from "@agentxm/host-primitives";
import { readExtensionManifest } from "@agentxm/extension-content";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { resolveHookImplementation } from "@agentxm/extension-model/unstable/hooks/resolution";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  McpAuthSchema,
  McpBindingSchema,
  McpDistributionSchema,
  decodeMcpServerManifestAt,
  readPluginMcpDefinition,
  resolveMcpInvocation,
  selectMcpDistribution,
} from "../../agent-adapters/index.js";
import {
  acquiredDirectoryForRef,
  copyExtensionDirectory,
  sourceRefContentKey,
} from "../../acquisition/index.js";
import {
  StepFailure,
  type ExecutionChange,
  type Plan,
  type PlanRiskCondition,
} from "../../operations/index.js";
import { SourceHostProviders } from "../../sources/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  DesiredStateReader,
  resolveConfiguredExtensionObservations,
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  computeMaterializedTreeIntegrity,
  retainedPackageKeyForRef,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../../workspace-state/index.js";

/** Visit decoded declarations only. Environment references remain symbolic. */
export const secretReferences = (value: unknown): string[] => {
  if (typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(secretReferences);
  return Object.entries(value).flatMap(([key, child]) =>
    key === "env" && typeof child === "string" ? [child] : secretReferences(child),
  );
};

export const destination = (value: unknown): string => {
  if (typeof value !== "string") return "symbolic endpoint";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return redactCredentialText(url.href);
  } catch {
    return "endpoint unavailable";
  }
};

const configurationJson = (value: unknown): string =>
  JSON.stringify(value, (_key, child: unknown) =>
    Predicate.isReadonlyObject(child) && !Array.isArray(child)
      ? Object.fromEntries(
          Object.entries(child).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : child,
  ) ?? "null";

/** Derive review facts from verified package declarations before an execution candidate is sealed. */
export const executionExposureRisks = Effect.fn("executionExposureRisks")(function* (
  plan: Plan<unknown, unknown>,
) {
  if (
    !plan.jobs.some((job) =>
      job.steps.some(
        (step) =>
          step.readiness !== "error" &&
          step.exposureRefs?.some(
            (ref) =>
              ref.refType !== "workspace" && (ref.type === "hook" || ref.type === "mcp-server"),
          ),
      ),
    )
  )
    return [];
  const changes: ExecutionChange[] = [];
  const seenChanges = new Set<string>();
  const observer = yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider);
  const desired = yield* Effect.serviceOption(DesiredStateReader);
  const priorGraph = Option.isSome(desired) ? yield* desired.value.graph() : undefined;
  const settings = yield* SettingsReader;
  const location = yield* WorkspaceLocation;
  const lock = yield* LockfileReader;
  const path = yield* Path.Path;
  for (const step of plan.jobs.flatMap((job) => job.steps)) {
    if (step.readiness === "error") continue;
    for (const ref of step.exposureRefs ?? []) {
      if (ref.refType === "workspace" || (ref.type !== "hook" && ref.type !== "mcp-server"))
        continue;
      const name = ref.type === "hook" ? ref.hook.name : ref.server.name;
      const outcomes = (step.agentOutcomes ?? step.artifact?.agentOutcomes)?.filter(
        (outcome) => outcome.name === name && outcome.extensionType === ref.type,
      );
      const targets = [
        ...new Set(
          outcomes !== undefined && outcomes.length > 0
            ? outcomes
                .filter(
                  (outcome) => outcome.outcome === "projected" || outcome.outcome === "current",
                )
                .map((outcome) => outcome.agentId)
            : (step.artifact?.agents ?? (yield* settings.configuredAgents)),
        ),
      ].sort();
      if (targets.length === 0) continue;
      const change = yield* Effect.scoped(
        Effect.gen(function* () {
          const prior = yield* lock.acceptedEntry(ref.type, name);
          const priorRef = yield* acceptedLockedResolutionRef({ type: ref.type, name });
          const canonical = yield* acceptedLockedCanonicalPath({ type: ref.type, name });
          const fs = yield* FileSystem.FileSystem;
          const priorNode = priorGraph?.nodes.find(
            (node) => node.type === ref.type && node.name === name,
          );
          const current =
            Option.isSome(observer) && priorNode?.enabled === true
              ? yield* resolveConfiguredExtensionObservations(observer.value, {
                  type: ref.type,
                  state: "current",
                  scope: location.scope,
                  agentIds: targets,
                  ...(priorGraph === undefined ? {} : { desiredGraph: priorGraph }),
                  rows: [{ name, targetState: "enabled", installed: Option.isSome(prior) }],
                }).pipe(Effect.option)
              : Option.none();
          const verifiedTargets = Option.isSome(current)
            ? (current.value
                .get(name)
                ?.agentOutcomes.filter((outcome) => outcome.outcome === "current")
                .map((outcome) => outcome.agentId) ?? [])
            : [];

          const sameSource =
            Option.isSome(priorRef) &&
            (ref.refType === "local" && priorRef.value.refType === "local"
              ? retainedPackageKeyForRef(priorRef.value) === retainedPackageKeyForRef(ref)
              : sourceRefContentKey(priorRef.value) === sourceRefContentKey(ref));
          const sourceRoot = yield* Effect.gen(function* () {
            if (ref.refType !== "registry") return fromFileLocation(ref.location);
            if (
              Option.isSome(canonical) &&
              Option.isSome(priorRef) &&
              Option.isSome(prior) &&
              sameSource &&
              (yield* fs.exists(canonical.value))
            ) {
              const observed = yield* computeMaterializedTreeIntegrity(canonical.value).pipe(
                Effect.option,
              );
              if (Option.isSome(observed) && observed.value === prior.value.treeIntegrity)
                return canonical.value;
            }
            const sources = yield* Effect.serviceOption(SourceHostProviders);
            if (Option.isNone(sources))
              return yield* new StepFailure({
                category: "internal",
                detail: "Executable source content is unavailable for review.",
              });
            return (yield* sources.value.fetch(ref)).directory;
          });
          const sourcePackageRoot = yield* acquiredDirectoryForRef(ref, sourceRoot);
          // Review the same payload materialization copies, excluding transport metadata such as .git.
          const packageRoot =
            ref.refType === "registry"
              ? sourcePackageRoot
              : yield* Effect.gen(function* () {
                  const snapshot = yield* fs.makeTempDirectoryScoped({
                    prefix: "axm-execution-review-",
                  });
                  yield* copyExtensionDirectory(sourcePackageRoot, snapshot);
                  return snapshot;
                });
          const root = path.join(packageRoot, path.relative(sourcePackageRoot, sourceRoot));
          const tree = yield* computeMaterializedTreeIntegrity(packageRoot);
          const native = step.artifact?.nativeLocations ?? [];
          const details: string[] = [];
          let symbolic: string[] = [];
          let configured: unknown;
          let previousConfiguration: unknown;
          if (ref.type === "hook") {
            const { manifest } = yield* readExtensionManifest(root, "hook");
            const proposed = step.executionPreferences?.find(
              (value) => value.type === "hook" && value.name === name,
            );
            previousConfiguration = (yield* settings.entries("hook"))[name]?.configuration;
            configured = proposed?.type === "hook" ? proposed.configuration : previousConfiguration;
            for (const agent of targets) {
              if (!isConfigurableAgentId(agent)) continue;
              const selection = resolveHookImplementation(manifest, agent, {
                scope: location.scope,
                platform: platform(),
              });
              if (selection.status !== "selected" && selection.status !== "conditional") continue;
              for (const binding of selection.implementation.bindings) {
                details.push(
                  `${agent}: ${binding.event}, ${binding.handler.runtime} ${binding.handler.entrypoint}`,
                );
                symbolic.push(...secretReferences(binding.handler));
              }
            }
            symbolic.push(...secretReferences(configured));
          } else {
            const proposed = step.executionPreferences?.find(
              (value) => value.type === "mcp-server" && value.name === name,
            );
            const previous = (yield* settings.entries("mcp-server"))[name];
            const preference =
              proposed?.type === "mcp-server" && proposed.authorizeDistributionSelection !== true
                ? yield* Schema.decodeUnknownEffect(
                    Schema.Struct({
                      distribution: Schema.optional(McpDistributionSchema),
                      bindings: Schema.optional(Schema.Array(McpBindingSchema)),
                      auth: Schema.optional(McpAuthSchema),
                    }),
                  )(proposed)
                : previous;
            previousConfiguration = {
              distribution: previous?.distribution,
              bindings: previous?.bindings,
              auth: previous?.auth,
            };
            configured = {
              distribution: preference?.distribution,
              bindings: preference?.bindings,
              auth: preference?.auth,
            };
            const nativeComponent =
              ref.refType === "local" || ref.refType === "git-hosted"
                ? ref.nativeComponent
                : undefined;
            if (nativeComponent !== undefined) {
              const definition = yield* readPluginMcpDefinition(packageRoot, nativeComponent);
              if (definition.kind !== "remote")
                return yield* new StepFailure({
                  category: "conflict",
                  detail: "Plugin MCP execution cannot be reviewed for this target.",
                });
              details.push(`${definition.transport}: ${destination(definition.url)}`);
            } else {
              const manifest = yield* decodeMcpServerManifestAt(
                path.join(root, manifestFilenameForType("mcp-server")),
              );
              const selected = selectMcpDistribution({
                manifest,
                selector: preference?.distribution,
                allowUnambiguous:
                  proposed?.type === "mcp-server" &&
                  proposed.authorizeDistributionSelection === true,
              });
              const invocation = resolveMcpInvocation({
                manifest,
                ...preference,
                ...(selected._tag === "selected"
                  ? { distribution: selected.candidate.selector }
                  : {}),
              });
              if (invocation._tag === "blocked")
                return yield* new StepFailure({
                  category: "validation",
                  detail:
                    "MCP execution cannot be resolved for review; configure its required inputs.",
                });
              const connection = invocation.connection;
              configured = {
                distribution: invocation.distribution,
                bindings: preference?.bindings,
                auth: preference?.auth,
              };
              details.push(
                connection.transport === "stdio"
                  ? `stdio: ${redactCredentialText(connection.command)}`
                  : `${connection.transport}: ${destination(connection.url)}`,
              );
              const distribution = selectMcpDistribution({
                manifest,
                selector: invocation.distribution,
              });
              if (distribution._tag !== "blocked" && distribution.candidate.kind === "package") {
                const pkg = distribution.candidate.package;
                details.push(
                  `${pkg.registryType}: ${redactCredentialText(pkg.identifier)}${pkg.version === undefined ? " (version unspecified)" : `@${pkg.version}`}`,
                );
              }
              symbolic = secretReferences(connection);
            }
          }
          const unchangedRegistration =
            targets.every((target) => verifiedTargets.includes(target)) ||
            (Option.isNone(observer) &&
              native.length > 0 &&
              native.every(
                (unit) =>
                  unit.state === "unchanged" &&
                  (unit.ownership === "owned" || unit.ownership === "declared"),
              ));
          const unchangedExecution =
            Option.isSome(prior) &&
            prior.value.treeIntegrity === tree &&
            Option.isSome(priorRef) &&
            sameSource &&
            configurationJson(configured) === configurationJson(previousConfiguration);
          if (unchangedRegistration && unchangedExecution) return undefined;
          const configurationIdentity = createHash("sha256")
            .update(configurationJson(configured))
            .digest("hex");
          const previousReferences = yield* Effect.gen(function* () {
            if (
              native.length > 0 &&
              native.every((unit) => unit.state === "created" && unit.ownership === "absent")
            )
              return Option.some<string[]>([]);
            if (!unchangedRegistration) return Option.none<string[]>();
            if (
              Option.isNone(prior) ||
              Option.isNone(canonical) ||
              !(yield* fs.exists(canonical.value))
            )
              return Option.none<string[]>();
            if (
              (yield* computeMaterializedTreeIntegrity(canonical.value)) !==
              prior.value.treeIntegrity
            )
              return Option.none<string[]>();
            if (ref.type === "hook") {
              const { manifest } = yield* readExtensionManifest(canonical.value, "hook");
              const references = secretReferences(previousConfiguration);
              for (const agent of targets) {
                if (!isConfigurableAgentId(agent)) continue;
                const selection = resolveHookImplementation(manifest, agent, {
                  scope: location.scope,
                  platform: platform(),
                });
                if (selection.status === "selected" || selection.status === "conditional")
                  references.push(...secretReferences(selection.implementation.bindings));
              }
              return Option.some(references);
            }
            const nativeComponent =
              ref.refType === "local" || ref.refType === "git-hosted"
                ? ref.nativeComponent
                : undefined;
            if (nativeComponent !== undefined) return Option.none<string[]>();
            const manifest = yield* decodeMcpServerManifestAt(
              path.join(canonical.value, manifestFilenameForType("mcp-server")),
            );
            const previous = (yield* settings.entries("mcp-server"))[name];
            const invocation = resolveMcpInvocation({ manifest, ...previous });
            return invocation._tag === "blocked"
              ? Option.none<string[]>()
              : Option.some(secretReferences(invocation.connection));
          }).pipe(Effect.catch(() => Effect.succeed(Option.none<string[]>())));
          const requested = [...new Set(symbolic)].sort();
          const registrations = targets.flatMap((target) => {
            if (Option.isNone(prior)) return [{ target, change: "added" as const }];
            if (verifiedTargets.includes(target))
              return [
                {
                  target,
                  change: unchangedExecution ? ("unchanged" as const) : ("changed" as const),
                },
              ];
            const units = native.filter((unit) => unit.configuredConsumers.includes(target));
            return units.length === 0
              ? [{ target, change: "unknown" as const }]
              : units.map((unit) => ({
                  target,
                  change:
                    unit.state === "created"
                      ? ("added" as const)
                      : unit.state === "updated"
                        ? ("changed" as const)
                        : unit.state === "removed"
                          ? ("removed" as const)
                          : unit.state === "unchanged"
                            ? ("unchanged" as const)
                            : ("unknown" as const),
                }));
          });
          return {
            extensionType: ref.type,
            name,
            source:
              ref.refType === "registry"
                ? `${ref.source.location.href} ${ref.owner}/${ref.name}@${ref.version}`
                : ref.refType === "git-hosted"
                  ? `Git ${destination(ref.source.url.href)}@${ref.gitCommitSha}`
                  : "local external package",
            contentIdentity: `${tree}; configuration-sha256:${configurationIdentity}`,
            targets,
            registrations,
            details,
            secretReferences: requested,
            secretReferenceChanges: Option.isSome(previousReferences)
              ? {
                  previous: "known",
                  added: requested.filter((value) => !previousReferences.value.includes(value)),
                  removed: [...new Set(previousReferences.value)]
                    .filter((value) => !requested.includes(value))
                    .sort(),
                }
              : { previous: "unavailable", added: [], removed: [] },
          } satisfies ExecutionChange;
        }),
      ).pipe(
        Effect.mapError((cause) =>
          cause instanceof StepFailure
            ? cause
            : new StepFailure({
                category: "validation",
                detail:
                  "External execution cannot be reviewed from its exact package and configuration.",
                cause,
              }),
        ),
      );
      if (change !== undefined) {
        const identity = configurationJson(change);
        if (!seenChanges.has(identity)) changes.push(change);
        seenChanges.add(identity);
      }
    }
  }
  if (changes.length === 0) return [];
  return [
    {
      level: "override-required",
      id: "external-execution-changes",
      policy: "accept-execution-changes",
      requiredFlag: "--accept-execution-changes",
      detail: `Accept external Hook/MCP execution changes. Host permissions and external runtime behavior remain separate. Independent build provenance is not verified.\n${changes.map((change) => `${change.name}: ${change.source}\nRegistrations: ${change.registrations.map((registration) => `${registration.target} (${registration.change})`).join(", ")}\nContent: ${change.contentIdentity}\n${change.details.join("\n")}\nSymbolic inputs: ${change.secretReferences.join(", ") || "none"}\n${change.secretReferenceChanges.previous === "unavailable" ? "Previous input requests could not be established; review all requested inputs." : `Added inputs: ${change.secretReferenceChanges.added.join(", ") || "none"}; removed inputs: ${change.secretReferenceChanges.removed.join(", ") || "none"}`}`).join("\n")}`,
      executionChanges: changes,
    },
  ] satisfies ReadonlyArray<PlanRiskCondition>;
});
