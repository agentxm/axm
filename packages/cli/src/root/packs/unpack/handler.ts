import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { buildRegistrySkillRef } from "@agentxm/client-core/unstable/skills";
import {
  buildRegistryCommandRef,
  type InstallCommandOperation,
} from "@agentxm/client-core/unstable/commands";
import {
  buildRegistryMcpServerRef,
  type InstallMcpServerOperation,
} from "@agentxm/client-core/unstable/mcp-servers";
import type { RegistrySource } from "@agentxm/client-core/unstable/sources";
import { parseFqn } from "@agentxm/client-core/unstable/extensions";
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

/**
 * Handles the `axm packs unpack` command.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs unpack");

  // Validate pack exists in lockfile
  const entry = yield* renderer.withSpinner(
    "Checking pack...",
    () =>
      Effect.gen(function* () {
        const lockedPack = yield* ws.getLockedPack(args.name);

        if (Option.isNone(lockedPack)) {
          return yield* makeAppError({
            code: "internal",
            message: `Pack "${args.name}" is not installed`,
            breadcrumbs: [
              {
                description: "Install the pack first with `axm packs install`.",
                cmd: "axm packs install <source>",
              },
            ],
          });
        }

        const entry = lockedPack.value;

        if (entry.type !== "registry") {
          return yield* makeAppError({
            code: "internal",
            message: `Cannot unpack "${args.name}" — only registry packs can be unpacked`,
          });
        }

        return entry;
      }),
    { successMessage: `Found ${args.name}` },
  );

  // Look up the registry source used for this pack
  const sourceOpt = yield* ws.getConfiguredSourceByName(entry.sourceName);
  const source: RegistrySource =
    Option.isSome(sourceOpt) && sourceOpt.value.type === "registry"
      ? {
          type: "registry",
          location: sourceOpt.value.location,
          owner: Option.none(),
        }
      : {
          type: "registry",
          location: new URL("file:///unknown"),
          owner: Option.none(),
        };

  // Build install ops from pack's resolved maps (skipSettings: false for unpack)
  const skillOps = yield* Effect.forEach(
    Object.entries(entry.resolvedSkills),
    ([fqn, version]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        return {
          name: "install-skill" as const,
          args: {
            ref: buildRegistrySkillRef(parsed.owner, parsed.name, version, source, []),
            force: false,
            versionRange: Option.none<string>(),
            skipSettings: Option.none<boolean>(),
            strictUnknownAgents: Option.none<boolean>(),
            existingInstalledAt: Option.none<Date>(),
            sourceName: Option.none<string>(),
          },
        };
      }),
    { concurrency: "unbounded" },
  );

  const commandOps: ReadonlyArray<InstallCommandOperation> = yield* Effect.forEach(
    Object.entries(entry.resolvedCommands),
    ([fqn, version]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        return {
          name: "install-command" as const,
          args: {
            ref: buildRegistryCommandRef(parsed.owner, parsed.name, version, source, []),
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
    ([fqn, version]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        return {
          name: "install-mcp-server" as const,
          args: {
            ref: buildRegistryMcpServerRef(parsed.owner, parsed.name, version, source, []),
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

  yield* renderer.success("Done");
});
