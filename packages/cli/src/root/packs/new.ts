/**
 * Packs new handler — validates input, resolves owner,
 * builds a single-step plan, and executes via `ws.resolvePlan()`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import {
  decodeExtensionNameSync,
  formatFqn,
  normalizeHandle,
} from "@axm.sh/core/unstable/extensions";
import { EXTENSION_PACK_MANIFEST_FILENAME } from "@axm.sh/core/unstable/packs";
import type { NewExtensionPackOperation } from "@axm.sh/core/unstable/packs";
import { newExtensionPack } from "@axm.sh/core/unstable/packs";
import { computeExtensionPackPaths } from "@axm.sh/core/unstable/packs";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../command-meta.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withWorkspace } from "../../runtime.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksNewHandlerArgs {
  /** Name of the pack (without owner). */
  readonly name: string;
  /** Optional profile override. */
  readonly profile: Option.Option<string>;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handlePacksNew = Effect.fn("PacksNew.handle")(function* (args: PacksNewHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;

  yield* renderer.info("axm packs new");

  // Resolve profile
  const normalizeOwner = (s: string) => normalizeHandle(s.startsWith("@") ? s : `@${s}`);
  const owner = Option.isSome(args.profile)
    ? normalizeOwner(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for extension pack creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  const fqn = formatFqn({ owner, type: "packs", name: decodeExtensionNameSync(args.name) });
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computeExtensionPackPaths(path.join, base, owner, args.name);
  const manifestPath = path.join(packDir.canonicalPath, EXTENSION_PACK_MANIFEST_FILENAME);

  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_CHECK_FAILED",
        what: `Failed to check if extension pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeAppError({
      code: "PACK_ALREADY_EXISTS",
      what: `Extension pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      howToFix: "Choose a different name or remove the existing extension pack first",
    });
  }

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, owner },
  } satisfies NewExtensionPackOperation;

  // Build Plan directly with inline run closure
  const provideServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Workspace>,
  ): Effect.Effect<A, E, never> =>
    effect.pipe(
      Effect.provideService(Workspace, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const step: PlannedJobStep = {
    readiness: "ready",
    label: fqn,
    run: provideServices(newExtensionPack(op)).pipe(
      Effect.map(
        (result): JobStepResult =>
          result.result === "error"
            ? { result: "error", message: result.message, error: result.error }
            : { result: "success", message: result.message },
      ),
    ),
  };

  const plan: Plan = {
    _tag: "Plan",
    name: "New extension pack",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  const resolution = yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("packs.new", resolution);

  yield* renderer.success(`Created extension pack ${fqn}`);
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the extension pack (without owner)"),
  ),
  profile: Flag.string("profile").pipe(
    Flag.withDescription("Override the workspace profile (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Create the extension pack without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Overwrite if an extension pack with this name already exists"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what files would be created without creating them"),
  ),
} as const;
const commandMeta = registryCommandMeta("packs new", { json: true });

export const newCommand = Command.make("new", newConfig, ({ name, profile, yes, force, preview }) =>
  handlePacksNew({ name, profile, yes, force, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withCommandRuntime(commandMeta),
  ),
).pipe(
  withArgvTracking(newConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Create a new empty extension pack"),
  Command.withExamples([
    {
      command: "axm packs new frontend-tools",
      description: "Create an empty extension pack to bundle extensions",
    },
    {
      command: "axm packs new frontend-tools --profile @co",
      description: "Create under a specific owner",
    },
    {
      command: "",
      description: "See also: packs add, packs publish",
    },
  ]),
);
