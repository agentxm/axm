/**
 * Install command handler - Effect-based orchestration for `axm packs install`.
 *
 * Packs are registry-only. Flow:
 * 1. Parse input (validate format: @namespace/packs/name, bare name)
 * 2. Resolve to registry source
 * 3. sources.find() → PackExtensionRef
 * 4. buildInstallPlan → ws.resolvePlan()
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  parseInputPattern,
  resolveSource,
  registryGuard,
  SourceHostProviders,
} from "../../../sources/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildInstallPlan } from "./plan.js";
import { installPack } from "../../../extensions/packs/operations/install.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { installCommand } from "../../../extensions/commands/operations/install.js";
import { installMcpServer } from "../../../extensions/mcp-servers/operations/install.js";
import { parseFqn } from "../../../extensions/fqn.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type {
  RegistrySkillRef,
  RegistryCommandRef,
  RegistryMcpServerRef,
} from "../../../sources/types.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs install command.
 */
export interface InstallPackHandlerArgs {
  /** Source to install pack from (e.g., "@acme/packs/frontend-tools") */
  readonly source: string;
  /** Install to user scope (~/.axm/) instead of project scope (.axm/) */
  readonly global: boolean;
  /** Skip confirmations */
  readonly yes: boolean;
  /** Overwrite existing packs */
  readonly force: boolean;
  /** Disable all prompts */
  readonly nonInteractive: Option.Option<boolean>;
}

// -----------------------------------------------------------------------------
// Input Parsing
// -----------------------------------------------------------------------------

/**
 * Parse pack install input into namespace, name, and version constraint.
 *
 * Accepted formats:
 * - `@namespace/packs/pack-name` → fully qualified
 * - `@namespace/packs/pack-name@^2.0.0` → with version constraint
 * - `pack-name` → resolved to `@defaultScope/packs/pack-name`
 * - `pack-name@^2.0.0` → bare with version constraint
 *
 * Rejected:
 * - `@namespace/pack-name` (without `/packs/`) — ambiguous, could be a skill
 * - Non-registry sources (local paths, github:, etc.)
 */
export const parsePackInput = (input: string) =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    const parsed = parseInputPattern(trimmed);

    // Handle bare name (e.g., "my-pack") — resolve with default namespace
    if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
      const ws = yield* Workspace;
      const namespace = yield* ws.getConfiguredNamespace();
      return {
        namespace,
        packName: parsed.value.pattern.name,
        versionConstraint: Option.none<string>(),
        resolvedInput: `${namespace}/packs/${parsed.value.pattern.name}`,
      };
    }

    // Handle bare name with version constraint (e.g., "my-pack@^2.0.0")
    // parseInputPattern returns None for "name@constraint" — handle manually
    if (Option.isNone(parsed) && !trimmed.startsWith("@") && trimmed.includes("@")) {
      const atIndex = trimmed.indexOf("@");
      const name = trimmed.slice(0, atIndex);
      const constraint = trimmed.slice(atIndex + 1);
      if (name && constraint && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(name)) {
        const ws = yield* Workspace;
        const namespace = yield* ws.getConfiguredNamespace();
        return {
          namespace,
          packName: name,
          versionConstraint: Option.some(constraint),
          resolvedInput: `${namespace}/packs/${name}@${constraint}`,
        };
      }
    }

    // Handle @namespace/packs/pack-name[@constraint]
    if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
      const pat = parsed.value.pattern;

      // Reject @namespace/pack-name (without /packs/ segment)
      if (Option.isNone(pat.type) || pat.type.value !== "packs") {
        return yield* makeCliError({
          code: "PACK_SOURCE_INVALID_FORMAT",
          what: "Pack source must include /packs/ segment",
          details: [`Provided: ${trimmed}`],
          howToFix:
            "Use @namespace/packs/pack-name format. The /packs/ segment distinguishes packs from skills.",
        });
      }

      if (Option.isNone(pat.name)) {
        return yield* makeCliError({
          code: "PACK_SOURCE_MISSING_NAME",
          what: "Pack source must include a pack name",
          details: [`Provided: ${trimmed}`],
          howToFix: "Use @namespace/packs/pack-name format.",
        });
      }

      return {
        namespace: pat.namespace,
        packName: pat.name.value,
        versionConstraint: pat.versionConstraint,
        resolvedInput: trimmed,
      };
    }

    // Reject everything else (local paths, github:, URLs, etc.)
    return yield* makeCliError({
      code: "PACK_SOURCE_NOT_REGISTRY",
      what: "Packs can only be installed from a registry",
      details: [`Provided: ${trimmed}`],
      howToFix: "Use @namespace/packs/pack-name or just pack-name (resolved to default namespace).",
    });
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallPack = Effect.fn("InstallPack.handle")(function* (
  args: InstallPackHandlerArgs,
) {
  const scopeLabel = args.global ? "user" : "project";

  const ws = yield* Workspace;
  const sources = yield* SourceHostProviders;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;

  yield* log.info(`axm packs install (${scopeLabel})`);

  // Step 1: Parse and validate input
  const parseHandle = yield* spinnerSvc.start("Parsing source...");
  const { namespace, packName, versionConstraint, resolvedInput } = yield* parsePackInput(
    args.source,
  ).pipe(Effect.tapError(() => parseHandle.stop("Failed")));
  yield* parseHandle.stop(`Pack: ${namespace}/packs/${packName}`);

  // Step 2: Check if already installed (unless --force)
  if (!args.force) {
    const lockedPack = yield* ws.getLockedPack(packName);
    if (Option.isSome(lockedPack)) {
      yield* log.warn(`Pack "${packName}" is already installed. Use --force to overwrite.`);
      yield* log.success("Nothing to install.");
      return;
    }
  }

  // Step 3: Resolve source and registry guard
  const source = yield* resolveSource(resolvedInput).pipe(
    Effect.mapError((error) =>
      makeCliError({
        code: "INVALID_SOURCE",
        what: `Invalid source: ${error.message}`,
        details: [`Provided: ${args.source || "(empty)"}`],
        howToFix: "Use @namespace/packs/pack-name or just pack-name.",
        cause: error,
      }),
    ),
  );

  if (source.type !== "registry") {
    return yield* makeCliError({
      code: "PACK_SOURCE_NOT_REGISTRY",
      what: "Packs can only be installed from a registry",
      details: [`Provided source type: ${source.type}`],
      howToFix: "Use a registry source: @namespace/packs/pack-name",
    });
  }

  yield* registryGuard;

  // Step 4: Discover pack from registry
  const discoverHandle = yield* spinnerSvc.start("Fetching pack from registry...");
  const refs = yield* sources
    .find(source, {
      skillNames: [packName],
      type: "pack",
      namespace: Option.none(),
      versionConstraint: Option.none(),
    })
    .pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "PACK_FETCH_FAILED",
          what: `Failed to fetch pack from registry: ${error.message}`,
          details: [`Pack: ${namespace}/packs/${packName}`],
          howToFix: "Verify the pack name and registry configuration.",
          cause: error,
        }),
      ),
      Effect.tapError(() => discoverHandle.stop("Failed")),
    );

  if (refs.length === 0) {
    yield* discoverHandle.stop("Not found");
    return yield* makeCliError({
      code: "PACK_NOT_FOUND",
      what: `Pack "${packName}" not found in registry`,
      howToFix: "Verify the pack name and check available packs.",
    });
  }

  const packRef = refs[0]!;
  if (packRef.type !== "pack" || packRef.refType !== "registry") {
    return yield* makeCliError({
      code: "PACK_FETCH_FAILED",
      what: "Registry did not return a valid pack reference",
    });
  }
  yield* discoverHandle.stop("Found pack");

  // Step 5: Resolve dependency constraints to exact registry refs
  const skillOps: ReadonlyArray<InstallSkillOperation> = yield* Effect.forEach(
    Object.entries(packRef.pack.skills),
    ([fqn, versionConstraint]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        if (parsed.type !== "skills") {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_INVALID_FQN",
            what: `Expected a skill FQN, got: ${fqn}`,
          });
        }

        const refs = yield* sources.find(packRef.source, {
          skillNames: [parsed.name],
          type: "skill",
          namespace: Option.some(parsed.namespace),
          versionConstraint: Option.some(versionConstraint),
        });

        const resolved = refs.find(
          (ref): ref is RegistrySkillRef =>
            ref.type === "skill" &&
            ref.refType === "registry" &&
            ref.namespace === parsed.namespace &&
            ref.name === parsed.name,
        );

        if (resolved === undefined) {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_NOT_FOUND",
            what: `Skill dependency not found: ${fqn}@${versionConstraint}`,
          });
        }

        return {
          name: "install-skill",
          args: {
            ref: resolved,
            force: false,
            versionConstraint: Option.some(versionConstraint),
            skipSettings: Option.some(true),
          },
        } satisfies InstallSkillOperation;
      }),
    { concurrency: "unbounded" },
  );

  const commandOps: ReadonlyArray<InstallCommandOperation> = yield* Effect.forEach(
    Object.entries(packRef.pack.commands),
    ([fqn, versionConstraint]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        if (parsed.type !== "commands") {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_INVALID_FQN",
            what: `Expected a command FQN, got: ${fqn}`,
          });
        }

        const refs = yield* sources.find(packRef.source, {
          skillNames: [parsed.name],
          type: "command",
          namespace: Option.some(parsed.namespace),
          versionConstraint: Option.some(versionConstraint),
        });

        const resolved = refs.find(
          (ref): ref is RegistryCommandRef =>
            ref.type === "command" &&
            ref.refType === "registry" &&
            ref.namespace === parsed.namespace &&
            ref.name === parsed.name,
        );

        if (resolved === undefined) {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_NOT_FOUND",
            what: `Command dependency not found: ${fqn}@${versionConstraint}`,
          });
        }

        return {
          name: "install-command",
          args: {
            ref: resolved,
            force: false,
            versionConstraint: Option.some(versionConstraint),
            skipSettings: Option.some(true),
          },
        } satisfies InstallCommandOperation;
      }),
    { concurrency: "unbounded" },
  );

  const mcpServerOps: ReadonlyArray<InstallMcpServerOperation> = yield* Effect.forEach(
    Object.entries(packRef.pack.mcpServers),
    ([fqn, versionConstraint]) =>
      Effect.gen(function* () {
        const parsed = yield* parseFqn(fqn);
        if (parsed.type !== "mcp-servers") {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_INVALID_FQN",
            what: `Expected an MCP server FQN, got: ${fqn}`,
          });
        }

        const refs = yield* sources.find(packRef.source, {
          skillNames: [parsed.name],
          type: "mcp-server",
          namespace: Option.some(parsed.namespace),
          versionConstraint: Option.some(versionConstraint),
        });

        const resolved = refs.find(
          (ref): ref is RegistryMcpServerRef =>
            ref.type === "mcp-server" &&
            ref.refType === "registry" &&
            ref.namespace === parsed.namespace &&
            ref.name === parsed.name,
        );

        if (resolved === undefined) {
          return yield* makeCliError({
            code: "PACK_DEPENDENCY_NOT_FOUND",
            what: `MCP server dependency not found: ${fqn}@${versionConstraint}`,
          });
        }

        return {
          name: "install-mcp-server",
          args: {
            ref: resolved,
            force: false,
            versionConstraint: Option.some(versionConstraint),
            skipSettings: Option.some(true),
          },
        } satisfies InstallMcpServerOperation;
      }),
    { concurrency: "unbounded" },
  );

  // Step 6: Build and execute plan
  const lockedPacks = yield* ws.getLockedPacks();
  const lockedSkills = yield* ws.getLockedSkills();
  const lockedCommands = yield* ws.getLockedCommands();
  const lockedMcpServers = yield* ws.getLockedMcpServers();
  const lockfile = {
    lockfileVersion: 1,
    skills: lockedSkills,
    commands: lockedCommands,
    mcpServers: lockedMcpServers,
    packs: lockedPacks,
  };

  const plan = buildInstallPlan({
    ref: packRef,
    skillOps,
    commandOps,
    mcpServerOps,
    lockfile,
    name: "Install pack",
    description: Option.some(`Install pack ${namespace}/packs/${packName}`),
    versionConstraint,
  });

  yield* ws.resolvePlan(plan, {
    "install-pack": installPack,
    "install-skill": installSkill,
    "install-command": installCommand,
    "install-mcp-server": installMcpServer,
  });

  yield* log.success("Done");
});
