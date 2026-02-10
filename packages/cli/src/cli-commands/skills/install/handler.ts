/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Uses desired-state reconciliation pattern:
 * 1. Create workspace context (local vs global)
 * 2. Ensure workspace is initialized
 * 3. Load current state (actual from disk + locked from lockfile)
 * 4. Build ideal state from command
 * 5. Build plan (diff current vs ideal)
 * 6. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  determineSourceInput,
  printSource,
  SourceProviders,
  registryGuard,
} from "../../../sources/index.js";
import { determineSkillsToInstall } from "./select-skills.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Spinner } from "../../../tui/index.js";
import { LockfileService } from "../../../lockfile/index.js";
import { SettingsService } from "../../../settings/index.js";
import { formatError } from "../../../utils/errors.js";
import { WorkspaceContextTag as Workspace } from "../../../workspace/index.js";
import type { InstallSkillOperation } from "../operations.js";
import { buildPlan } from "./build-plan.js";
import { installSkill } from "./install-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the install command.
 */
export interface InstallHandlerArgs {
  /** Source to install skills from */
  readonly source: string;
  /** Install to global ~/.axm/ instead of local .axm/ */
  readonly global: boolean;
  /** Target agent(s) to install skills for */
  readonly agents: readonly string[];
  /** Specific skill(s) to install (by name) */
  readonly skills: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
  /** List available skills without installing */
  readonly list: boolean;
  /** Install all available skills */
  readonly all: boolean;
  /** Overwrite existing skills */
  readonly force: boolean;
  /** Disable all prompts */
  readonly nonInteractive: Option.Option<boolean>;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

/**
 * Error that occurs during skill installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InstallError extends Data.TaggedError("InstallError")<{
  readonly message: string;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills install` command.
 *
 * Flow (state-based architecture):
 * 1. Parse source string to determine type
 * 2. Ensure .axm/ is initialized
 * 3. Detect installed agents (or use --agent flag)
 * 4. Load current state (actual + locked)
 * 5. Discover skills from source
 * 6. List mode (--list stops here)
 * 7. Select skills to install
 * 8. Build ideal state
 * 9. Build plan (diff current vs ideal)
 * 10. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (args: InstallHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    const ws = yield* Workspace;
    const sources = yield* SourceProviders;
    // Get TUI services
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;

    // Show intro
    yield* log.info(`axm skills install (${scopeLabel})`);

    // Step 1: Parse source
    let handle = yield* spinnerSvc.start("Parsing source...");
    const source = yield* determineSourceInput(args.source).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: formatError(
              `Invalid source: ${error.message}`,
              [`Provided: ${args.source || "(empty)"}`],
              "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
            ),
            cause: error,
            retryable: false,
          }),
      ),
    );
    yield* handle.stop(`Source: ${printSource(source)} (${source.source})`);

    // Step 1.5: Registry guard — ensure a registry source is configured
    if (source.source === "registry") {
      yield* registryGuard;
    }

    // Step 2: Get workspace context (provided by runtime)

    // TODO: Step 3 — Get agents from settings or --agent flag

    // Step 5: Discover skills from source via SourceProviders
    handle = yield* spinnerSvc.start("Discovering skills...");
    const findOptions = {
      names: [] as ReadonlyArray<string>,
      agents: args.agents as ReadonlyArray<string>,
      type: "skill" as const,
    };
    const allRefs = yield* sources.resolve(source, findOptions).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: formatError(
              `Failed to discover skills: ${error.message}`,
              [`Source: ${printSource(source)}`],
              "Verify the source path contains directories with SKILL.md files.",
            ),
            cause: error,
            retryable: false,
          }),
      ),
      Effect.tapError(() => handle.stop("Failed")),
    );
    // Filter to skill refs only
    const discoveredSkills = Array.filter(allRefs, (ref) => ref.type === "skill");
    if (!Array.isNonEmptyReadonlyArray(discoveredSkills)) {
      yield* handle.stop("No skills found");
      return yield* new InstallError({
        message: formatError(
          "No skills found in source",
          [`Source: ${printSource(source)}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        cause: undefined,
        retryable: false,
      });
    }
    yield* handle.stop(`Found ${discoveredSkills.length} skill(s)`);

    // Step 6: List mode -> display and exit
    if (args.list) {
      yield* log.info("Available skills:");
      for (const ref of discoveredSkills) {
        const desc = ref.skill.description ? ` - ${ref.skill.description}` : "";
        yield* log.message(`  ${ref.skill.name}${desc}`);
      }
      yield* log.success(`${discoveredSkills.length} skill(s) available`);
      return;
    }

    // Step 7: Select skills to install
    const selectedSkills = yield* determineSkillsToInstall(discoveredSkills, {
      requestedSkills: args.skills,
      all: args.all,
      yes: args.yes,
    });

    if (!Array.isNonEmptyReadonlyArray(selectedSkills)) {
      yield* log.warn("No skills selected.");
      yield* log.success("Nothing to install.");
      return;
    }

    const ss = yield* SettingsService;
    const agentIds = yield* ss.getAgents();

    const ops = selectedSkills.map(
      (s) =>
        ({
          name: "install-skill",
          args: {
            agents: agentIds,
            force: args.force,
            source: s.source,
            skill: s.skill,
            location: s.location,
            version: s.version,
            gitTreeSha: s.gitTreeSha,
          },
        }) satisfies InstallSkillOperation,
    );

    // Build plan
    const ls = yield* LockfileService;
    const lockedSkills = yield* ls.getSkills();
    const lockfile = { lockfileVersion: 1, skills: lockedSkills };
    const plan = buildPlan(
      ops,
      lockfile,
      "Install skill(s)",
      Option.some(`Install skills from ${printSource(source)}`),
    );

    yield* ws.resolvePlan(plan, { "install-skill": installSkill });

    yield* log.success("Done");
  });
};
