/** Exact native Hook realization selection, shared by projection and discovery. @experimental */
import * as semver from "semver";
import { installable } from "../agent-capabilities/derive.js";
import { agentById } from "../agent-capabilities/lookup.js";
import type { ConfigurableAgentId } from "../agent-capabilities/identity.js";
import type { WorkspaceScope } from "../workspace-scope.js";
import type { HookManifest, HookImplementation } from "./manifest-schema.js";

export interface HookImplementationContext {
  readonly scope: WorkspaceScope;
  readonly platform?: string;
  readonly hostVersion?: string;
  readonly profile?: string;
  readonly availableRuntimes?: ReadonlyArray<"bash" | "node" | "python">;
}
export type HookImplementationResolution =
  | {
      readonly status: "selected" | "conditional";
      readonly implementation: HookImplementation;
      readonly conditions: ReadonlyArray<string>;
    }
  | { readonly status: "unsupported"; readonly reasons: ReadonlyArray<string> }
  | { readonly status: "ambiguous"; readonly implementationIds: ReadonlyArray<string> };

/** Select declared implementations without treating unknown host facts as verified support. */
export const resolveHookImplementation = (
  manifest: HookManifest,
  agentId: ConfigurableAgentId,
  context: HookImplementationContext,
): HookImplementationResolution => {
  // Native command serialization currently uses POSIX shell quoting and expansion.
  if (
    context.platform !== undefined &&
    context.platform !== "linux" &&
    context.platform !== "darwin"
  )
    return {
      status: "unsupported",
      reasons: [
        `Native Hook command serialization is unavailable on ${context.platform}; supported platforms are linux and darwin.`,
      ],
    };
  const agent = agentById(agentId);
  const hook = agent.capabilities.hook;
  const writer = hook.axm.writer;
  if (
    writer === null ||
    !("locations" in hook.native) ||
    !hook.native.locations.some(
      (location) => location.scope === context.scope && writer.locationIds.includes(location.id),
    )
  )
    return {
      status: "unsupported",
      reasons: [`No native Hook writer supports ${agentId} at ${context.scope} scope.`],
    };
  const candidates: Array<{ implementation: HookImplementation; conditions: Array<string> }> = [];
  const reasons: Array<string> = [];
  for (const implementation of manifest.implementations) {
    if (implementation.protocol !== agentId) continue;
    const failures = implementation.bindings
      .map((binding) => installable(agent, binding))
      .filter((verdict) => !verdict.installable);
    if (failures.length > 0) {
      reasons.push(...failures.map((failure) => `${implementation.id}: ${failure.reason}`));
      continue;
    }
    const required = implementation.requires;
    if (required?.scopes !== undefined && !required.scopes.includes(context.scope)) {
      reasons.push(`${implementation.id} does not support ${context.scope} scope.`);
      continue;
    }
    const conditions: Array<string> =
      context.platform === undefined
        ? ["Platform must support the native POSIX command serializer (linux or darwin)."]
        : [];
    let excluded = false;
    const runtimes = [
      ...new Set(implementation.bindings.map((binding) => binding.handler.runtime)),
    ];
    if (context.availableRuntimes === undefined)
      conditions.push(
        `Native host environment must provide: ${runtimes.map((runtime) => (runtime === "python" ? "python3" : runtime)).join(", ")}; availability is unverified.`,
      );
    else if (runtimes.some((runtime) => !context.availableRuntimes?.includes(runtime))) {
      reasons.push(
        `${implementation.id} requires unavailable runtimes: ${runtimes.filter((runtime) => !context.availableRuntimes?.includes(runtime)).join(", ")}.`,
      );
      excluded = true;
    }
    if (required?.platforms !== undefined) {
      if (context.platform === undefined)
        conditions.push(`Platform must be one of: ${required.platforms.join(", ")}.`);
      else if (!required.platforms.some((platform) => platform === context.platform)) {
        reasons.push(`${implementation.id} does not support ${context.platform}.`);
        excluded = true;
      }
    }
    if (required?.profiles !== undefined) {
      if (context.profile === undefined)
        conditions.push(`Host profile must be one of: ${required.profiles.join(", ")}.`);
      else if (!required.profiles.includes(context.profile)) {
        reasons.push(`${implementation.id} does not support profile ${context.profile}.`);
        excluded = true;
      }
    }
    if (required?.hostVersion !== undefined) {
      if (context.hostVersion === undefined)
        conditions.push(`Host version must satisfy ${required.hostVersion}.`);
      else if (!semver.satisfies(context.hostVersion, required.hostVersion)) {
        reasons.push(`${implementation.id} requires host version ${required.hostVersion}.`);
        excluded = true;
      }
    }
    if (!excluded) candidates.push({ implementation, conditions });
  }
  if (candidates.length > 1)
    return {
      status: "ambiguous",
      implementationIds: candidates.map(({ implementation }) => implementation.id),
    };
  const candidate = candidates[0];
  if (candidate === undefined)
    return {
      status: "unsupported",
      reasons:
        reasons.length > 0
          ? reasons
          : [`No implementation declares the ${agentId} native protocol.`],
    };
  return { status: candidate.conditions.length === 0 ? "selected" : "conditional", ...candidate };
};
