/**
 * Publish command handler -- Effect-based orchestration for `axm skills publish`.
 *
 * Publishes a managed extension from `.axm/extensions/` to a target registry:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve extension name (bare name -> scope from settings)
 * 3. Validate managed extension exists
 * 4. Build plan with a single PublishSkillOperation
 * 5. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { registryGuard } from "../../../sources/index.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Spinner } from "../../../tui/index.js";
import { formatError } from "../../../utils/errors.js";
import { WorkspaceContextTag as Workspace } from "../../../workspace/index.js";
import type { PublishSkillOperation } from "../operations.js";
import { publishSkill } from "../publish-skill.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the publish command.
 */
export interface PublishHandlerArgs {
  /** Extension name (@scope/name or bare name). */
  readonly extension: string;
  /** Named registry source to publish to. None = default/first configured. */
  readonly registry: Option.Option<string>;
  /** Skip confirmations. */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class PublishError extends Data.TaggedError("PublishError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";
const MANIFEST_FILENAME = "axm-skill.json";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Determine whether the extension name already contains a scope (`@scope/name`).
 */
const hasScopePrefix = (name: string): boolean => name.startsWith("@") && name.includes("/");

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills publish` command.
 */
export const handlePublish = (args: PublishHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;
    const base = path.dirname(ws.path);

    yield* log.info("axm skills publish");

    // Step 1: Registry guard
    yield* registryGuard;

    // Step 2: Resolve extension name
    let extensionName: string;
    if (hasScopePrefix(args.extension)) {
      extensionName = args.extension;
    } else {
      // Bare name -- resolve scope from settings
      const scope = yield* ws.getScope().pipe(
        Effect.mapError(
          (e) =>
            new PublishError({
              message: `Failed to resolve scope: ${e._tag}`,
              cause: e,
            }),
        ),
      );
      extensionName = `${scope}/${args.extension}`;
    }

    // Parse scope and skill name from the extension name
    const slashIdx = extensionName.indexOf("/");
    const scope = extensionName.slice(0, slashIdx);
    const skillName = extensionName.slice(slashIdx + 1);

    // Step 3: Validate managed extension exists
    const handle = yield* spinnerSvc.start("Validating extension...");
    const extensionDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", skillName);
    const extensionDirExists = yield* fs
      .exists(extensionDir)
      .pipe(Effect.orElseSucceed(() => false));

    if (!extensionDirExists) {
      yield* handle.stop("Failed");
      return yield* new PublishError({
        message: formatError(
          `Managed extension not found: ${extensionName}`,
          [`Expected at: ${extensionDir}`],
          "Only managed extensions (in .axm/extensions/) can be published. Use `axm skills fork` first.",
        ),
        cause: undefined,
      });
    }

    // Validate manifest exists
    const manifestPath = path.join(extensionDir, MANIFEST_FILENAME);
    const manifestExists = yield* fs.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));

    if (!manifestExists) {
      yield* handle.stop("Failed");
      return yield* new PublishError({
        message: formatError(
          `Missing manifest: ${MANIFEST_FILENAME}`,
          [`Expected at: ${manifestPath}`],
          "Ensure the extension has a valid axm-skill.json manifest.",
        ),
        cause: undefined,
      });
    }

    yield* handle.stop(`Validated ${extensionName}`);

    // Step 4: Determine target registry
    const registrySources = yield* ws.getRegistrySources(Option.none()).pipe(
      Effect.mapError(
        (e) =>
          new PublishError({
            message: `Failed to get registry sources: ${e._tag}`,
            cause: e,
          }),
      ),
    );

    if (registrySources.length === 0) {
      return yield* new PublishError({
        message: "No registry sources configured. Run the registry guard first.",
        cause: undefined,
      });
    }

    const registryName = Option.match(args.registry, {
      onNone: () => registrySources[0]!.name,
      onSome: (name) => name,
    });

    // Step 5: Build plan with a single PublishSkillOperation
    const steps: PlannedJobStep<PublishSkillOperation>[] = [
      {
        _tag: "PlannedJobStep",
        operation: {
          name: "publish-skill",
          args: {
            name: extensionName,
            registryName,
          },
        } satisfies PublishSkillOperation,
        expectedResult: { result: "success", message: `Published ${extensionName}` },
        label: `Publish ${extensionName}`,
      },
    ];

    const plan = {
      name: "Publish skill",
      description: Option.some(`Publish ${extensionName} to registry "${registryName}"`),
      jobs: [{ steps, concurrency: 1 as const }],
    };

    yield* ws.resolvePlan(plan, {
      "publish-skill": publishSkill,
    });

    yield* log.success("Done");
  });
