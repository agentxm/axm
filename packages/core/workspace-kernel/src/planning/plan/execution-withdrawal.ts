import { platform } from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { redactCredentialText } from "@agentxm/host-primitives";
import { readExtensionManifest } from "@agentxm/extension-content";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { resolveHookImplementation } from "@agentxm/extension-model/unstable/hooks/resolution";
import {
  decodeMcpServerManifestAt,
  readPluginMcpDefinition,
  resolveMcpInvocation,
  selectMcpDistribution,
} from "../../agent-adapters/index.js";
import type { ExecutionChange, JobStepArtifact, Plan } from "../../operations/index.js";
import {
  acceptedLockedCanonicalPath,
  acceptedLockedResolutionRef,
  computeMaterializedTreeIntegrity,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../../workspace-state/index.js";
import { destination, secretReferences } from "./execution-exposure.js";

export interface ExecutionWithdrawalSubject {
  readonly type: ExtensionType;
  readonly name: string;
}

/** Removal evidence uses retained declarations only. Missing content never causes a fetch. */
const describeWithdrawal = Effect.fn("describeExecutionWithdrawal")(function* (
  subject: ExecutionWithdrawalSubject,
  artifact: JobStepArtifact,
) {
  if (subject.type !== "hook" && subject.type !== "mcp-server") return undefined;
  const accepted = yield* (yield* LockfileReader).acceptedEntry(subject.type, subject.name);
  if (Option.isNone(accepted)) return undefined;
  const canonical = yield* acceptedLockedCanonicalPath(subject);
  const path = yield* Path.Path;
  const changed = (artifact.nativeLocations ?? []).filter((unit) => {
    if (unit.state !== "removed" && unit.state !== "updated") return false;
    if (subject.type === "mcp-server")
      return unit.address.kind === "key-path" && unit.address.keys.at(-1) === subject.name;
    return (
      unit.address.kind === "hook-registrations" &&
      Option.isSome(canonical) &&
      unit.address.scriptRoots.some((root) => {
        const relative = path.relative(canonical.value, root);
        return (
          relative === "" ||
          (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
        );
      })
    );
  });
  const settings = yield* SettingsReader;
  const configuredAgents = yield* settings.configuredAgents;
  const removedEntries =
    subject.type === "mcp-server"
      ? (artifact.targets ?? [])
          .filter(
            (target) =>
              target.unitId === "mcp-server:native-config-entry" &&
              target.entryName === subject.name &&
              target.change !== "unchanged",
          )
          .flatMap((target) =>
            (target.agentIds ?? []).filter((agent) => configuredAgents.includes(agent)),
          )
      : [];
  if (changed.length === 0 && removedEntries.length === 0) return undefined;
  const registrations = [
    ...new Map([
      ...changed.flatMap((unit) =>
        unit.configuredConsumers.map(
          (target) =>
            [
              target,
              {
                target,
                change:
                  subject.type === "hook" || unit.state === "removed"
                    ? ("removed" as const)
                    : ("changed" as const),
              },
            ] as const,
        ),
      ),
      ...removedEntries.map((target) => [target, { target, change: "removed" as const }] as const),
    ]).values(),
  ].sort((a, b) => a.target.localeCompare(b.target));
  const targets = registrations.map(({ target }) => target);
  const ref = yield* acceptedLockedResolutionRef(subject).pipe(
    Effect.option,
    Effect.map(Option.flatten),
  );
  const source = Option.isNone(ref)
    ? "Accepted source details unavailable"
    : ref.value.refType === "registry"
      ? `${ref.value.source.location.href} ${ref.value.owner}/${ref.value.name}@${ref.value.version}`
      : ref.value.refType === "git-hosted"
        ? `Git ${destination(ref.value.source.url.href)}@${ref.value.gitCommitSha}`
        : "local external package";
  const declaration = yield* Effect.gen(function* () {
    if (
      Option.isNone(canonical) ||
      (yield* computeMaterializedTreeIntegrity(canonical.value)) !== accepted.value.treeIntegrity
    )
      return undefined;
    const details: string[] = [];
    let references: string[] = [];
    if (subject.type === "hook") {
      const { manifest } = yield* readExtensionManifest(canonical.value, "hook");
      const location = yield* WorkspaceLocation;
      references = secretReferences((yield* settings.entries("hook"))[subject.name]?.configuration);
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
          references.push(...secretReferences(binding.handler));
        }
      }
    } else {
      const preference = (yield* settings.entries("mcp-server"))[subject.name];
      if (preference?.nativeComponent !== undefined) {
        const definition = yield* readPluginMcpDefinition(
          canonical.value,
          preference.nativeComponent,
        );
        if (definition.kind !== "remote") return undefined;
        details.push(`${definition.transport}: ${destination(definition.url)}`);
      } else {
        const manifest = yield* decodeMcpServerManifestAt(path.join(canonical.value, "mcp.json"));
        const invocation = resolveMcpInvocation({ manifest, ...preference });
        if (invocation._tag === "blocked") return undefined;
        const connection = invocation.connection;
        details.push(
          connection.transport === "stdio"
            ? `stdio: ${redactCredentialText(connection.command)}`
            : `${connection.transport}: ${destination(connection.url)}`,
        );
        const distribution = selectMcpDistribution({ manifest, selector: invocation.distribution });
        if (distribution._tag !== "blocked" && distribution.candidate.kind === "package") {
          const pkg = distribution.candidate.package;
          details.push(
            `${pkg.registryType}: ${redactCredentialText(pkg.identifier)}${pkg.version === undefined ? " (version unspecified)" : `@${pkg.version}`}`,
          );
        }
        references = secretReferences(connection);
      }
    }
    return { details, references: [...new Set(references)].sort() };
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));
  return {
    extensionType: subject.type,
    name: subject.name,
    source,
    contentIdentity: accepted.value.treeIntegrity,
    targets,
    registrations,
    details: [
      "Withdraw external execution; host permissions and running processes remain separate.",
      ...(declaration?.details ?? [
        "Previous execution declaration is unavailable; no source was fetched.",
      ]),
    ],
    secretReferences: [],
    secretReferenceChanges:
      declaration === undefined
        ? { previous: "unavailable", added: [], removed: [] }
        : { previous: "known", added: [], removed: declaration.references },
  } satisfies ExecutionChange;
});

/** Carry withdrawal facts in preview and applied artifacts without creating a consent risk. */
export const withExecutionWithdrawals = Effect.fn("withExecutionWithdrawals")(function* <R, O>(
  plan: Plan<R, O>,
  subjects: ReadonlyArray<ExecutionWithdrawalSubject>,
) {
  if (subjects.length === 0) return plan;
  const seen = new Set<string>();
  const jobs = yield* Effect.forEach(plan.jobs, (job) =>
    Effect.gen(function* () {
      const steps = yield* Effect.forEach(job.steps, (step) =>
        Effect.gen(function* () {
          if (step.readiness === "error" || step.artifact === undefined) return step;
          const artifact = step.artifact;
          const facts = (yield* Effect.forEach(subjects, (subject) =>
            describeWithdrawal(subject, artifact),
          ))
            .filter((fact) => fact !== undefined)
            .filter((fact) => {
              const key = JSON.stringify(fact);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          if (facts.length === 0) return step;
          return {
            ...step,
            artifact: { ...step.artifact, executionChanges: facts },
            run: step.run.pipe(
              Effect.map((result) =>
                result.result === "success" && result.artifact !== undefined
                  ? { ...result, artifact: { ...result.artifact, executionChanges: facts } }
                  : result,
              ),
            ),
          };
        }),
      );
      return { ...job, steps };
    }),
  );
  return { ...plan, jobs };
});
