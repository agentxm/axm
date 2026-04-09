import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { Workspace } from "@axm.sh/core/unstable/workspace";
import { buildRegistrySkillRef } from "@axm.sh/core/unstable/skills";
import {
  buildRegistryCommandRef,
  type InstallCommandOperation,
} from "@axm.sh/core/unstable/commands";
import {
  buildRegistryMcpServerRef,
  type InstallMcpServerOperation,
} from "@axm.sh/core/unstable/mcp-servers";
import type { RegistrySource } from "@axm.sh/core/unstable/sources";
import { parseFqnOrThrow } from "@axm.sh/core/unstable/extensions";
import { buildUnpackPlan } from "./plan.js";
import { previewOrApplyPlan } from "@axm.sh/core/unstable/workspace";
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
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs unpack");

  // Validate pack exists in lockfile
  const entry = yield* renderer.withSpinner(
    "Checking pack...",
    () =>
      Effect.gen(function* () {
        const lockedPack = yield* ws.getLockedExtensionPack(args.name);

        if (Option.isNone(lockedPack)) {
          return yield* makeAppError({
            code: "PACK_NOT_INSTALLED",
            what: `Pack "${args.name}" is not installed`,
            howToFix: "Install the extension pack first with `axm packs install`.",
          });
        }

        const entry = lockedPack.value;

        if (entry.type !== "registry") {
          return yield* makeAppError({
            code: "PACK_UNPACK_UNSUPPORTED",
            what: `Cannot unpack "${args.name}" — only registry extension packs can be unpacked`,
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
  const skillOps = Object.entries(entry.resolvedSkills).map(([fqn, version]) => {
    const parsed = parseFqnOrThrow(fqn);
    return {
      name: "install-skill" as const,
      args: {
        ref: buildRegistrySkillRef(parsed.owner, parsed.name, version, source, []),
        force: false,
        versionConstraint: Option.none<string>(),
        skipSettings: Option.none<boolean>(),
        strictUnknownAgents: Option.none<boolean>(),
        existingInstalledAt: Option.none<Date>(),
        sourceName: Option.none<string>(),
      },
    };
  });

  const commandOps: ReadonlyArray<InstallCommandOperation> = Object.entries(
    entry.resolvedCommands,
  ).map(([fqn, version]) => {
    const parsed = parseFqnOrThrow(fqn);
    return {
      name: "install-command" as const,
      args: {
        ref: buildRegistryCommandRef(parsed.owner, parsed.name, version, source, []),
        force: false,
        versionConstraint: Option.none<string>(),
        skipSettings: Option.none<boolean>(),
      },
    };
  });

  const mcpServerOps: ReadonlyArray<InstallMcpServerOperation> = Object.entries(
    entry.resolvedMcpServers,
  ).map(([fqn, version]) => {
    const parsed = parseFqnOrThrow(fqn);
    return {
      name: "install-mcp-server" as const,
      args: {
        ref: buildRegistryMcpServerRef(parsed.owner, parsed.name, version, source, []),
        force: false,
        versionConstraint: Option.none<string>(),
        skipSettings: Option.none<boolean>(),
        strictAgentSync: args.strictAgentSync,
      },
    };
  });

  // Load configured extensions for no-op detection
  const configuredSkills = yield* ws.getConfiguredSkills();
  const configuredCommands = yield* ws.getConfiguredCommands();
  const configuredMcpServers = yield* ws.getConfiguredMcpServers();

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
