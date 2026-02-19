/**
 * Install command handler - Effect-based orchestration for `axm packs install`.
 *
 * Packs are registry-only. Flow:
 * 1. Parse input (validate format: @scope/packs/name, bare name)
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
import { buildInstallPlan } from "./build-plan.js";
import { installPack } from "./install-pack.js";
import { installSkill } from "../../skills/install/install-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs install command.
 */
export interface InstallPackHandlerArgs {
  /** Source to install pack from (e.g., "@acme/packs/frontend-tools") */
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
// Input Parsing
// -----------------------------------------------------------------------------

/**
 * Parse pack install input into scope, name, and version constraint.
 *
 * Accepted formats:
 * - `@scope/packs/pack-name` → fully qualified
 * - `@scope/packs/pack-name@^2.0.0` → with version constraint
 * - `pack-name` → resolved to `@defaultScope/packs/pack-name`
 * - `pack-name@^2.0.0` → bare with version constraint
 *
 * Rejected:
 * - `@scope/pack-name` (without `/packs/`) — ambiguous, could be a skill
 * - Non-registry sources (local paths, github:, etc.)
 */
export const parsePackInput = (input: string) =>
  Effect.gen(function* () {
    const trimmed = input.trim();
    const parsed = parseInputPattern(trimmed);

    // Handle bare name (e.g., "my-pack") — resolve with default scope
    if (Option.isSome(parsed) && parsed.value.pattern.pattern === "name-input") {
      const ws = yield* Workspace;
      const scope = yield* ws.getConfiguredScope();
      return {
        scope,
        packName: parsed.value.pattern.name,
        versionConstraint: Option.none<string>(),
        resolvedInput: `${scope}/packs/${parsed.value.pattern.name}`,
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
        const scope = yield* ws.getConfiguredScope();
        return {
          scope,
          packName: name,
          versionConstraint: Option.some(constraint),
          resolvedInput: `${scope}/packs/${name}@${constraint}`,
        };
      }
    }

    // Handle @scope/packs/pack-name[@constraint]
    if (Option.isSome(parsed) && parsed.value.pattern.pattern === "registry-pattern-input") {
      const pat = parsed.value.pattern;

      // Reject @scope/pack-name (without /packs/ segment)
      if (Option.isNone(pat.type) || pat.type.value !== "packs") {
        return yield* makeCliError({
          code: "PACK_SOURCE_INVALID_FORMAT",
          what: "Pack source must include /packs/ segment",
          details: [`Provided: ${trimmed}`],
          howToFix:
            "Use @scope/packs/pack-name format. The /packs/ segment distinguishes packs from skills.",
        });
      }

      if (Option.isNone(pat.name)) {
        return yield* makeCliError({
          code: "PACK_SOURCE_MISSING_NAME",
          what: "Pack source must include a pack name",
          details: [`Provided: ${trimmed}`],
          howToFix: "Use @scope/packs/pack-name format.",
        });
      }

      return {
        scope: pat.scope,
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
      howToFix: "Use @scope/packs/pack-name or just pack-name (resolved to default scope).",
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
  const scopeLabel = args.global ? "global" : "project";

  const ws = yield* Workspace;
  const sources = yield* SourceHostProviders;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;

  yield* log.info(`axm packs install (${scopeLabel})`);

  // Step 1: Parse and validate input
  const parseHandle = yield* spinnerSvc.start("Parsing source...");
  const { scope, packName, versionConstraint, resolvedInput } = yield* parsePackInput(
    args.source,
  ).pipe(Effect.tapError(() => parseHandle.stop("Failed")));
  yield* parseHandle.stop(`Pack: ${scope}/packs/${packName}`);

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
        howToFix: "Use @scope/packs/pack-name or just pack-name.",
        cause: error,
      }),
    ),
  );

  if (source.type !== "registry") {
    return yield* makeCliError({
      code: "PACK_SOURCE_NOT_REGISTRY",
      what: "Packs can only be installed from a registry",
      details: [`Provided source type: ${source.type}`],
      howToFix: "Use a registry source: @scope/packs/pack-name",
    });
  }

  yield* registryGuard;

  // Step 4: Discover pack from registry
  const discoverHandle = yield* spinnerSvc.start("Fetching pack from registry...");
  const refs = yield* sources
    .find(source, {
      skillNames: [packName],
      type: "pack",
      scope: Option.none(),
      versionConstraint: Option.none(),
    })
    .pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "PACK_FETCH_FAILED",
          what: `Failed to fetch pack from registry: ${error.message}`,
          details: [`Pack: ${scope}/packs/${packName}`],
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

  // Step 5: Build and execute plan
  const lockedPacks = yield* ws.getLockedPacks();
  const lockedSkills = yield* ws.getLockedSkills();
  const lockfile = { lockfileVersion: 1, skills: lockedSkills, packs: lockedPacks };

  const plan = buildInstallPlan({
    ref: packRef,
    skillOps: [],
    lockfile,
    name: "Install pack",
    description: Option.some(`Install pack ${scope}/packs/${packName}`),
    versionConstraint,
  });

  yield* ws.resolvePlan(plan, { "install-pack": installPack, "install-skill": installSkill });

  yield* log.success("Done");
});
