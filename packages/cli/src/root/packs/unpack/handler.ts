import type * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { InstallCommandOperation } from "@agentxm/client-core/unstable/commands";
import type { InstallMcpServerOperation } from "@agentxm/client-core/unstable/mcps";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import {
  parseFqnOrThrow,
  type ExtensionRef,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import type { ResolvedExtensionMap } from "@agentxm/client-core/unstable/lockfile";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "@agentxm/client-core/unstable/source-resolution";
import { buildUnpackPlan } from "./plan.js";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { emitPlanResolutionResult } from "../../../json-output.js";

export interface UnpackHandlerArgs {
  readonly name: string;
  readonly strictAgentSync: Option.Option<boolean>;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const resolveRegistryMember = <T extends ExtensionType>(args: {
  readonly sources: SourceHostProvidersService;
  readonly source: RegistrySource;
  readonly fqn: string;
  readonly expectedType: T;
  readonly resolved: ResolvedExtensionMap[string];
}) =>
  Effect.gen(function* () {
    const parsed = parseFqnOrThrow(args.fqn);
    const matches = yield* Effect.scoped(
      args.sources.find(
        { ...args.source, owner: Option.some(parsed.owner) },
        {
          names: [parsed.name],
          type: args.expectedType,
          owner: Option.some(parsed.owner),
          versionRange: Option.some(args.resolved.version),
        },
      ),
    );
    const ref = matches.find(
      (
        candidate,
      ): candidate is Extract<ExtensionRef, { readonly refType: "registry"; readonly type: T }> =>
        candidate.refType === "registry" &&
        candidate.type === args.expectedType &&
        candidate.owner === parsed.owner &&
        candidate.name === parsed.name &&
        candidate.version === args.resolved.version,
    );
    if (ref === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Cannot unpack ${args.fqn}: registry version ${args.resolved.version} is unavailable`,
      });
    }
    if (ref.publisherBindingId !== args.resolved.publisherBindingId) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Cannot unpack ${args.fqn}: its publisher ownership has changed`,
      });
    }
    return ref;
  });

/**
 * Handles the `axm packs unpack` command.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;

  // Validate pack exists in lockfile
  const entry = yield* Effect.gen(function* () {
    const lockedPack = yield* ws.getLockedPack(args.name);

    if (Option.isNone(lockedPack)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Pack "${args.name}" is not installed`,
        suggestions: [
          {
            description: "Install the pack first.",
            cmd: "axm packs install <source>",
          },
        ],
      });
    }

    const entry = lockedPack.value;

    if (entry.type !== "registry") {
      return yield* makeAppError({
        code: "internal",
        detail: `Cannot unpack "${args.name}" — only registry packs can be unpacked`,
      });
    }

    return entry;
  });

  // Look up the registry source used for this pack
  const sourceOpt = yield* ws.getConfiguredSourceByName(entry.sourceName);
  if (Option.isNone(sourceOpt) || sourceOpt.value.type !== "registry") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Cannot unpack "${args.name}": registry source "${entry.sourceName}" is not configured`,
      suggestions: [{ description: "List configured sources", cmd: "axm sources list" }],
    });
  }
  const source: RegistrySource = {
    type: "registry",
    location: sourceOpt.value.location,
    owner: Option.none(),
  };

  // Unpack promotes pack members into direct settings entries via install
  // operations, which currently exist only for skills, commands, and MCP
  // servers. Refuse to unpack a pack whose other member types would otherwise
  // be silently dropped when the pack itself is removed.
  const unpromotableMembers = [
    ["subagents", entry.resolvedSubagents],
    ["files", entry.resolvedFiles],
    ["rules", entry.resolvedRules],
    ["hooks", entry.resolvedHooks],
  ] as const;
  const droppedTypes = unpromotableMembers
    .filter(([, map]) => map !== undefined && Object.keys(map).length > 0)
    .map(([type]) => type);
  if (droppedTypes.length > 0) {
    return yield* makeAppError({
      code: "validation",
      detail: `Cannot unpack "${args.name}": unpack cannot promote ${droppedTypes.join(", ")} members, and unpacking would remove the pack and lose them. Keep the pack installed to retain these members.`,
    });
  }

  // Build install ops from pack's resolved maps (skipSettings: false for unpack)
  const skillOps = yield* Effect.forEach(
    Object.entries(entry.resolvedSkills),
    ([fqn, resolved]) =>
      Effect.gen(function* () {
        const ref = yield* resolveRegistryMember({
          sources,
          source,
          fqn,
          expectedType: "skill",
          resolved,
        });
        return {
          name: "install-skill" as const,
          args: {
            ref,
            force: false,
            versionRange: Option.none<string>(),
            skipSettings: Option.none<boolean>(),
            strictUnknownAgents: Option.none<boolean>(),
            existingInstalledAt: Option.none<DateTime.Utc>(),
            sourceName: Option.none<string>(),
          },
        };
      }),
    { concurrency: "unbounded" },
  );

  const commandOps: ReadonlyArray<InstallCommandOperation> = yield* Effect.forEach(
    Object.entries(entry.resolvedCommands),
    ([fqn, resolved]) =>
      Effect.gen(function* () {
        const ref = yield* resolveRegistryMember({
          sources,
          source,
          fqn,
          expectedType: "command",
          resolved,
        });
        return {
          name: "install-command" as const,
          args: {
            ref,
            force: false,
            versionRange: Option.none<string>(),
            skipSettings: Option.none<boolean>(),
          },
        };
      }),
    { concurrency: "unbounded" },
  );

  const mcpServerOps: ReadonlyArray<InstallMcpServerOperation> = yield* Effect.forEach(
    Object.entries(entry.resolvedMcpServers),
    ([fqn, resolved]) =>
      Effect.gen(function* () {
        const ref = yield* resolveRegistryMember({
          sources,
          source,
          fqn,
          expectedType: "mcp-server",
          resolved,
        });
        return {
          name: "install-mcp-server" as const,
          args: {
            ref,
            force: false,
            versionRange: Option.none<string>(),
            skipSettings: Option.none<boolean>(),
            strictAgentSync: args.strictAgentSync,
          },
        };
      }),
    { concurrency: "unbounded" },
  );

  // Load configured extensions for no-op detection
  const configuredSkills = yield* ws.records.getConfiguredSkills();
  const configuredCommands = yield* ws.records.getConfiguredCommands();
  const configuredMcpServers = yield* ws.records.getConfiguredMcpServers();

  // Build and execute plan
  const plan = yield* buildUnpackPlan({
    skillOps,
    commandOps,
    mcpServerOps,
    uninstallPackOp: { name: "uninstall-pack", args: { packName: args.name } },
    configuredSkillNames: Object.keys(configuredSkills),
    configuredCommandNames: Object.keys(configuredCommands),
    configuredMcpServerNames: Object.keys(configuredMcpServers),
    name: "Unpack pack",
    description: Option.some(`Unpack ${args.name} into direct settings entries`),
  });

  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("packs.unpack", resolution);
});
