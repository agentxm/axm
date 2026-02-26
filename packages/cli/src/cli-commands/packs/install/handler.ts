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
  RegistrySource,
} from "../../../sources/types.js";

const isCliError = (
  error: unknown,
): error is {
  readonly _tag: "CliError";
  readonly code: string;
  readonly what: string;
} =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "CliError" &&
  "code" in error &&
  typeof error.code === "string" &&
  "what" in error &&
  typeof error.what === "string";

const summarizeLookupError = (error: unknown): string => {
  if (isCliError(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isCliError(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

interface RegistryLookupProbe {
  readonly location: string;
  readonly outcome: "matched" | "not-found" | "error";
  readonly reason: Option.Option<string>;
}

const formatRegistryProbe = (probe: RegistryLookupProbe): string => {
  switch (probe.outcome) {
    case "matched":
      return `${probe.location}: matched`;
    case "not-found":
      return `${probe.location}: no match`;
    case "error":
      return Option.match(probe.reason, {
        onNone: () => `${probe.location}: error`,
        onSome: (reason) => `${probe.location}: ${reason}`,
      });
  }
};

const formatRegistrySourceLabel = ({
  source,
  registryHosts,
}: {
  readonly source: RegistrySource;
  readonly registryHosts: ReadonlyArray<{
    readonly name: string;
    readonly location: URL;
  }>;
}): string => {
  const matched = registryHosts.find((host) => host.location.href === source.location.href);
  if (matched !== undefined) {
    return `${matched.name} (${matched.location.href})`;
  }
  return source.location.href;
};

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
        inputKind: "name-input" as const,
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
          inputKind: "name-input-with-version" as const,
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
        inputKind: "registry-pattern-input" as const,
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
  const { inputKind, namespace, packName, versionConstraint, resolvedInput } =
    yield* parsePackInput(args.source);
  yield* parseHandle.stop(`Pack: ${namespace}/packs/${packName}`);

  if (inputKind === "name-input" || inputKind === "name-input-with-version") {
    yield* log.info(`Source resolution: ${args.source.trim()} -> ${resolvedInput}`);
  }

  // Step 2: Resolve source and registry guard
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

  const findPackRefs = (lookupSource: RegistrySource) =>
    Effect.gen(function* () {
      const probes: RegistryLookupProbe[] = [];

      const findWith = (candidate: RegistrySource) =>
        sources.find(candidate, {
          skillNames: [packName],
          type: "pack",
          namespace: Option.some(namespace),
          versionConstraint,
        });

      const toProbe = (
        location: URL,
        result:
          | Effect.Effect.Success<ReturnType<typeof findWith>>
          | Effect.Effect.Error<ReturnType<typeof findWith>>,
        isError: boolean,
      ): RegistryLookupProbe =>
        isError
          ? {
              location: location.href,
              outcome: "error",
              reason: Option.some(
                summarizeLookupError(result as Effect.Effect.Error<ReturnType<typeof findWith>>),
              ),
            }
          : {
              location: location.href,
              outcome:
                (result as Effect.Effect.Success<ReturnType<typeof findWith>>).length > 0
                  ? "matched"
                  : "not-found",
              reason: Option.none(),
            };

      const initialResult = yield* findWith(lookupSource).pipe(Effect.either);
      probes.push(
        initialResult._tag === "Right"
          ? toProbe(lookupSource.location, initialResult.right, false)
          : toProbe(lookupSource.location, initialResult.left, true),
      );
      if (initialResult._tag === "Right") {
        return {
          refs: initialResult.right,
          source: lookupSource,
          probes,
        } as const;
      }

      const initialError = initialResult.left;
      if (!isRemoteReadNotImplemented(initialError)) {
        return yield* Effect.fail(initialError);
      }

      const registryHosts = yield* ws.getRegistrySourceHosts();
      const fallbackSources = registryHosts
        .filter((host) => host.location.protocol === "file:")
        .map(
          (host) =>
            ({
              type: "registry" as const,
              location: host.location,
              namespace: Option.some(namespace),
            }) satisfies RegistrySource,
        );

      const fallbackErrors: string[] = [summarizeLookupError(initialError)];

      for (const fallbackSource of fallbackSources) {
        if (fallbackSource.location.href === lookupSource.location.href) {
          continue;
        }

        const fallbackResult = yield* findWith(fallbackSource).pipe(Effect.either);
        probes.push(
          fallbackResult._tag === "Right"
            ? toProbe(fallbackSource.location, fallbackResult.right, false)
            : toProbe(fallbackSource.location, fallbackResult.left, true),
        );
        if (fallbackResult._tag === "Right") {
          if (fallbackResult.right.length === 0) {
            continue;
          }
          return {
            refs: fallbackResult.right,
            source: fallbackSource,
            probes,
          } as const;
        }

        fallbackErrors.push(summarizeLookupError(fallbackResult.left));
      }

      return yield* makeCliError({
        code: "PACK_FETCH_FAILED",
        what: "Failed to fetch pack from registry",
        details: [
          `Pack: ${namespace}/packs/${packName}`,
          `Lookup errors: ${fallbackErrors.join("; ")}`,
        ],
        howToFix:
          "Remote registry discovery is not yet supported. Configure a file:// registry source or use a local registry source name.",
        cause: initialError,
      });
    });

  // Step 3: Discover pack from registry
  const discoverHandle = yield* spinnerSvc.start("Fetching pack from registry...");
  const discovery = yield* findPackRefs(source).pipe(
    Effect.mapError((error) =>
      makeCliError({
        code: "PACK_FETCH_FAILED",
        what: "Failed to fetch pack from registry",
        details: [`Pack: ${namespace}/packs/${packName}`, `Reason: ${summarizeLookupError(error)}`],
        howToFix: "Verify the pack name and registry configuration.",
        cause: error,
      }),
    ),
  );
  const refs = discovery.refs;
  if (inputKind === "name-input" || inputKind === "name-input-with-version") {
    yield* log.info(
      `Host resolution: ${discovery.probes.map((probe) => formatRegistryProbe(probe)).join("; ")}`,
    );
  }
  const registryHosts = yield* ws.getRegistrySourceHosts();
  const resolvedRegistryLabel = formatRegistrySourceLabel({
    source: discovery.source,
    registryHosts,
  });
  yield* log.info(`Registry source: ${resolvedRegistryLabel}`);

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

  // Step 4: Resolve dependency constraints to exact registry refs
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

  // Step 5: Build and execute plan
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
