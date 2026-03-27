/**
 * Packs new handler — validates input, resolves profile,
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
import { formatFqn } from "@axm.sh/core/unstable/extensions";
import { PACK_MANIFEST_FILENAME } from "@axm.sh/core/unstable/packs";
import type { NewPackOperation } from "@axm.sh/core/unstable/packs";
import { newPack } from "@axm.sh/core/unstable/packs";
import { computePackPaths } from "@axm.sh/core/unstable/packs";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import type { JobStepResult, Plan, PlannedJobStep } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PacksNewHandlerArgs {
  /** Name of the pack (without profile). */
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
  const normalizeProfile = (s: string) => (s.startsWith("@") ? s : `@${s}`);
  const profile = Option.isSome(args.profile)
    ? normalizeProfile(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for pack creation",
                  howToFix:
                    "Configure a profile in settings.json with `axm init`, or use --profile",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  const fqn = formatFqn({ handle: profile, type: "packs", name: args.name });
  const base = ws.baseDir;

  // Check if pack already exists
  const packDir = computePackPaths(path.join, base, profile, args.name);
  const manifestPath = path.join(packDir.canonicalPath, PACK_MANIFEST_FILENAME);

  const exists = yield* fs.exists(manifestPath).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "PACK_CHECK_FAILED",
        what: `Failed to check if pack exists: ${manifestPath}`,
        cause: e,
      }),
    ),
  );

  if (exists) {
    return yield* makeAppError({
      code: "PACK_ALREADY_EXISTS",
      what: `Pack '${fqn}' already exists at ${packDir.canonicalPath}`,
      howToFix: "Choose a different name or remove the existing pack first",
    });
  }

  // Build operation
  const op = {
    name: "new-pack",
    args: { name: args.name, profile },
  } satisfies NewPackOperation;

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
    run: provideServices(newPack(op)).pipe(
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
    name: "New pack",
    description: Option.some(`Create ${fqn}`),
    jobs: [{ concurrency: 1 as const, steps: [step] }],
  };

  yield* resolvePlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });

  yield* renderer.success(`Created pack ${fqn}`);
});

// -----------------------------------------------------------------------------
// Command
// -----------------------------------------------------------------------------

const newConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the pack (without profile)"),
  ),
  profile: Flag.string("profile").pipe(
    Flag.withDescription("Override the workspace profile (e.g., @acme)"),
    Flag.optional,
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const newCommand = Command.make("new", newConfig, ({ name, profile, yes, force, preview }) =>
  withRuntime(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE, handlePacksNew({ name, profile, yes, force, preview })),
    { command: "packs new" },
  ),
).pipe(
  withArgvTracking(newConfig),
  Command.withDescription("Create a new empty extension pack"),
  Command.withExamples([
    {
      command: "axm packs new frontend-tools",
      description: "Create @<profile>/frontend-tools",
    },
    {
      command: "axm packs new frontend-tools --profile @co",
      description: "Create @co/frontend-tools",
    },
  ]),
);
