/**
 * Install command handler - Effect-based orchestration for `axm packs install`.
 *
 * Packs are registry-only. Flow:
 * 1. Parse source (must be registry)
 * 2. Registry guard (ensure registry configured)
 * 3. Fetch pack archive from registry
 * 4. Extract to managed location
 * 5. Read manifest to discover referenced extensions
 * 6. Build cascading install plan (pack + referenced extensions)
 * 7. Execute plan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import {
  parseInputPattern,
  resolveSource,
  registryGuard,
  SourceHostProviders,
} from "../../../sources/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { PackManifestSchema } from "../../../extensions/packs/manifest-schema.js";
import type { InstallPackOperation } from "../operations.js";
import { buildInstallPlan } from "./build-plan.js";
import { installPack } from "./install-pack.js";
import { installSkill } from "../../skills/install/install-skill.js";
import type { InstallSkillOperation } from "../../skills/operations.js";
import { copySkillDirectory } from "../../skills/copy-skill-directory.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { PACK_MANIFEST_FILENAME } from "../constants.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs install command.
 */
export interface InstallPackHandlerArgs {
  /** Source to install pack from (e.g., "@acme/frontend-tools") */
  readonly source: string;
  /** Install to global ~/.axm/ instead of local .axm/ */
  readonly global: boolean;
  /** Skip confirmations */
  readonly yes: boolean;
  /** Overwrite existing packs */
  readonly force: boolean;
  /** Disable all prompts */
  readonly nonInteractive: Option.Option<boolean>;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallPack = (args: InstallPackHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    const ws = yield* Workspace;
    const sources = yield* SourceHostProviders;
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    yield* log.info(`axm packs install (${scopeLabel})`);

    // Step 1: Parse source (must be registry)
    const parseHandle = yield* spinnerSvc.start("Parsing source...");
    const source = yield* resolveSource(args.source).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "INVALID_SOURCE",
          what: `Invalid source: ${error.message}`,
          details: [`Provided: ${args.source || "(empty)"}`],
          howToFix:
            "Packs must be installed from a registry. Use format: @scope/pack-name or @scope/pack-name@version",
          cause: error,
        }),
      ),
    );

    if (source.type !== "registry") {
      yield* parseHandle.stop("Failed");
      return yield* Effect.fail(
        makeCliError({
          code: "PACK_SOURCE_NOT_REGISTRY",
          what: "Packs can only be installed from a registry",
          details: [`Provided source type: ${source.type}`],
          howToFix: "Use a registry source: @scope/pack-name or @scope/pack-name@version",
        }),
      );
    }
    yield* parseHandle.stop(`Source: ${sources.origin(source)} (registry)`);
    const parsedPattern = parseInputPattern(args.source.trim());
    const packName =
      Option.isSome(parsedPattern) && parsedPattern.value.pattern.pattern === "registry-pattern-input"
        ? Option.getOrNull(parsedPattern.value.pattern.name)
        : null;
    const packVersionConstraint =
      Option.isSome(parsedPattern) && parsedPattern.value.pattern.pattern === "registry-pattern-input"
        ? parsedPattern.value.pattern.versionConstraint
        : Option.none<string>();
    if (packName === null) {
      return yield* makeCliError({
        code: "PACK_SOURCE_MISSING_NAME",
        what: "Pack source must include a pack name",
        howToFix: "Use @scope/packs/name or @scope/name",
      });
    }

    // Step 2: Check if already installed (unless --force)
    if (!args.force) {
      const lockedPack = yield* ws.getLockedPack(packName);
      if (Option.isSome(lockedPack)) {
        yield* log.warn(`Pack "${packName}" is already installed. Use --force to overwrite.`);
        yield* log.success("Nothing to install.");
        return;
      }
    }

    // Step 3: Registry guard
    yield* registryGuard;

    // Step 4: Discover and fetch pack from registry
    const discoverHandle = yield* spinnerSvc.start("Fetching pack from registry...");
    const findOptions = {
      names: [packName] satisfies ReadonlyArray<string>,
      agents: [] satisfies ReadonlyArray<string>,
      type: "pack" as const,
    };
    const refs = yield* sources.find(source, findOptions).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "PACK_FETCH_FAILED",
          what: `Failed to fetch pack from registry: ${error.message}`,
          details: [`Pack: ${sources.origin(source)}`],
          howToFix: "Verify the pack name and registry configuration.",
          cause: error,
        }),
      ),
      Effect.tapError(() => discoverHandle.stop("Failed")),
    );

    if (refs.length === 0) {
      yield* discoverHandle.stop("Not found");
      return yield* Effect.fail(
        makeCliError({
          code: "PACK_NOT_FOUND",
          what: `Pack "${packName}" not found in registry`,
          howToFix: "Verify the pack name and check available packs.",
        }),
      );
    }

    // Fetch the pack archive
    const packRef = refs[0]!;
    if (packRef.type !== "pack" || !("scope" in packRef)) {
      return yield* Effect.fail(
        makeCliError({
          code: "PACK_FETCH_FAILED",
          what: "Registry did not return a valid pack reference",
        }),
      );
    }
    const registryScope = packRef.scope;
    const fetched = yield* sources.fetch(packRef).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "PACK_FETCH_FAILED",
          what: `Failed to download pack: ${error.message}`,
          cause: error,
        }),
      ),
      Effect.tapError(() => discoverHandle.stop("Failed")),
    );
    yield* discoverHandle.stop("Fetched pack");

    // Step 5: Extract to managed location
    const extractHandle = yield* spinnerSvc.start("Extracting pack...");
    const base = path.dirname(ws.path);
    const packDir = path.join(base, REGISTRY_EXTENSIONS_DIR, registryScope, "packs", packName);

    yield* copySkillDirectory(fetched.directory, packDir).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_EXTRACT_FAILED",
          what: `Failed to extract pack to ${packDir}`,
          cause: e,
        }),
      ),
      Effect.tapError(() => extractHandle.stop("Failed")),
    );
    yield* extractHandle.stop("Extracted");

    // Step 6: Read manifest to discover referenced extensions
    const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);
    const manifestExists = yield* fs
      .exists(manifestPath)
      .pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!manifestExists) {
      return yield* Effect.fail(
        makeCliError({
          code: "PACK_MISSING_MANIFEST",
          what: `Pack archive does not contain ${PACK_MANIFEST_FILENAME}`,
          details: [`Expected at: ${manifestPath}`],
          howToFix: "The pack archive may be corrupted. Try reinstalling.",
        }),
      );
    }

    const manifestContent = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_MANIFEST_READ_FAILED",
          what: `Failed to read pack manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    const manifestJson = yield* Effect.try({
      try: () => JSON.parse(manifestContent) as unknown,
      catch: (e) =>
        makeCliError({
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: "Failed to parse pack manifest JSON",
          cause: e,
        }),
    });

    const manifest = yield* Schema.decodeUnknown(PackManifestSchema)(manifestJson).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "PACK_MANIFEST_PARSE_FAILED",
          what: "Pack manifest is invalid",
          details: [e.message],
          cause: e,
        }),
      ),
    );

    // Build resolved extension maps from manifest
    const resolvedSkills: Record<string, string> = { ...(manifest.skills ?? {}) };
    const resolvedCommands: Record<string, string> = { ...(manifest.commands ?? {}) };
    const resolvedMcpServers: Record<string, string> = { ...(manifest["mcp-servers"] ?? {}) };

    // Resolve version from pack ref
    const resolvedVersion = (() => {
      if ("version" in packRef) {
        const v = packRef.version;
        if (typeof v === "string") return v;
      }
      return manifest.version;
    })();

    // Step 7: Fetch skill dependencies from manifest
    const skillEntries = Object.entries(resolvedSkills);
    const skillOps = yield* Effect.forEach(
      skillEntries,
      ([fqn, constraint]) =>
        Effect.gen(function* () {
          // Append version constraint from manifest to the source string
          // e.g., "@acme/code-review" + "^1.0.0" → "@acme/code-review@^1.0.0"
          const sourceStr = constraint && constraint !== "*" ? `${fqn}@${constraint}` : fqn;
          const skillSource = yield* resolveSource(sourceStr).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "PACK_DEPENDENCY_RESOLVE_FAILED",
                what: `Failed to resolve pack dependency: ${fqn}`,
                cause: error,
              }),
            ),
          );

          if (skillSource.type !== "registry") {
            return yield* makeCliError({
              code: "PACK_DEPENDENCY_RESOLVE_FAILED",
              what: `Skill dependency "${fqn}" must be a registry source`,
              howToFix: "Pack skill dependencies must use @scope/name format.",
            });
          }
          const parsedSkill = parseInputPattern(sourceStr);
          const skillName =
            Option.isSome(parsedSkill) && parsedSkill.value.pattern.pattern === "registry-pattern-input"
              ? Option.getOrNull(parsedSkill.value.pattern.name)
              : null;
          if (skillName === null) {
            return yield* makeCliError({
              code: "PACK_DEPENDENCY_RESOLVE_FAILED",
              what: `Skill dependency "${fqn}" is missing a name`,
            });
          }

          const skillFindOpts = {
            names: [skillName] satisfies ReadonlyArray<string>,
            agents: [] satisfies ReadonlyArray<string>,
            type: "skill" as const,
          };
          const skillRefs = yield* sources.find(skillSource, skillFindOpts).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "PACK_DEPENDENCY_FETCH_FAILED",
                what: `Failed to discover skill dependency: ${fqn}`,
                cause: error,
              }),
            ),
          );

          if (skillRefs.length === 0) {
            return yield* makeCliError({
              code: "PACK_DEPENDENCY_NOT_FOUND",
              what: `Skill dependency "${fqn}" not found in registry`,
              howToFix: "Verify the skill is published to the registry.",
            });
          }

          const skillRef = skillRefs[0]!;

          const fetchedSkill = yield* sources.fetch(skillRef).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "PACK_DEPENDENCY_FETCH_FAILED",
                what: `Failed to fetch skill dependency: ${fqn}`,
                cause: error,
              }),
            ),
          );

          return {
            ref: skillRef,
            fetched: fetchedSkill,
            versionConstraint:
              Option.isSome(parsedSkill) && parsedSkill.value.pattern.pattern === "registry-pattern-input"
                ? parsedSkill.value.pattern.versionConstraint
                : Option.none<string>(),
          };
        }),
      { concurrency: "unbounded" },
    );

    // Build InstallSkillOperations from fetched skill deps
    // Pack dependencies skip settings writes — they only appear in the lockfile
    const agents = yield* ws.getConfiguredAgents();
    const skillInstallOps: ReadonlyArray<InstallSkillOperation> = skillOps.flatMap(
      ({ ref, fetched, versionConstraint }) =>
        ref.type !== "skill"
          ? []
          : [
              {
                name: "install-skill" as const,
                args: {
                  ref,
                  agents,
                  force: args.force,
                  versionConstraint,
                  skipSettings: true,
                  fetchedLocation: `file://${fetched.directory}`,
                },
              },
            ],
    );

    // Step 8: Build install plan
    const op: InstallPackOperation = {
      name: "install-pack",
      args: {
        packName,
        scope: registryScope,
        resolvedVersion,
        checksum: "",
        sourceName: "default",
        resolvedSkills,
        resolvedCommands,
        resolvedMcpServers,
        versionConstraint: packVersionConstraint,
      },
    };

    const lockedPacks = yield* ws.getLockedPacks();
    const lockedSkills = yield* ws.getLockedSkills();
    const lockfile = { lockfileVersion: 1, skills: lockedSkills, packs: lockedPacks };

    const plan = buildInstallPlan(
      [op, ...skillInstallOps],
      lockfile,
      "Install pack",
      Option.some(`Install pack ${sources.origin(source)}`),
    );

    yield* ws.resolvePlan(plan, { "install-pack": installPack, "install-skill": installSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("InstallPack.handle"));
};
