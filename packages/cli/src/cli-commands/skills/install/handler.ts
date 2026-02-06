/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * Uses desired-state reconciliation pattern:
 * 1. Create workspace context (local vs global)
 * 2. Ensure workspace is initialized
 * 3. Load current state (actual from disk + locked from lockfile)
 * 4. Build ideal state from command
 * 5. Build plan (diff current vs ideal)
 * 6. Display plan (dry-run stops here)
 * 7. Apply plan (if not dry-run)
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { AgentConfig } from "../../../agents/index.js";
import { parseSource, printSource, type Source } from "../../../extensions/skills/index.js";
import { discoverSkills, type DiscoveredSkill } from "./discover-skills.js";
import { determineSkillsToInstall } from "./select-skills.js";
import { fetchGitHubTreeHash } from "../../../sources/index.js";
import { SkillSourceV2 } from "../../../extensions/skills/state/types.js";
import {
  applyPlan,
  applyStep,
  type BuildIdealDeps,
  buildIdealForInstall,
  buildPlan,
  CommandError,
  ensureAgentsConfigured,
  getPlanSummary,
  type InstallCommand,
  loadCurrentState,
  type PlanStep,
  planHasChanges,
  updateLockfileForPlan,
  updateSettingsForPlan,
  WorkspaceContextTag,
} from "../../../workspace/index.js";
import { displayPlan } from "../display.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Clack } from "../../../clack-effect/index.js";
import { formatError } from "../../../utils/errors.js";
import { isInteractive } from "../../../utils/tty.js";

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
  readonly agent: readonly string[];
  /** Specific skill(s) to install (by name) */
  readonly skill: readonly string[];
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
  /** Preview installation plan without making changes */
  readonly dryRun: Option.Option<boolean>;
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
  readonly cause: Option.Option<unknown>;
  readonly retryable: boolean;
}> {}

// -----------------------------------------------------------------------------
// V2 Dependencies
// -----------------------------------------------------------------------------

/**
 * Convert Source to SkillSourceV2.
 * Used to create a source for buildIdealForInstall.
 *
 * This preserves the original source info (e.g., GitHub owner/repo) for
 * storage in the lockfile and settings. The actual local path for file
 * operations is provided separately to the applyStep callback.
 */
const sourceToV2 = (source: Source): Effect.Effect<SkillSourceV2, CommandError> => {
  switch (source.source) {
    case "local":
      return Effect.succeed(SkillSourceV2.Local({ path: source.path }));
    case "github":
      return Effect.succeed(
        SkillSourceV2.GitHub({
          owner: source.owner,
          repo: source.repo,
          ref: source.ref,
          path: source.subPath,
        }),
      );
    case "gitlab":
    case "bitbucket":
      // For non-GitHub git sources, store as Local with a placeholder path
      // The original source info is preserved in the lockfile via separate mechanism
      return Effect.succeed(
        SkillSourceV2.Local({ path: source.subPath.pipe(Option.getOrElse(() => ".")) }),
      );
    default:
      return Effect.fail(
        new CommandError({
          message: `Unsupported source type: ${source.source}`,
          cause: Option.none(),
        }),
      );
  }
};

/**
 * Create BuildIdealDeps for the V2 buildIdealForInstall.
 * This creates the parseSource and discoverSkills callbacks required by the V2 API.
 */
const createBuildIdealDeps = (
  source: Source,
  discoveredSkills: readonly DiscoveredSkill[],
): BuildIdealDeps => ({
  parseSource: () => sourceToV2(source),

  discoverSkills: (v2Source: SkillSourceV2) =>
    Effect.gen(function* () {
      // For GitHub sources, fetch git tree hash from API for each skill
      const isGitHubSource = v2Source._tag === "GitHub" && source.source === "github";

      return yield* Effect.forEach(
        discoveredSkills,
        (skill) =>
          Effect.gen(function* () {
            let gitTreeHash: Option.Option<string> = Option.none();

            if (isGitHubSource && source.source === "github") {
              // Build path within repo: subpath (if any) + skill name
              const pathInRepo = Option.match(source.subPath, {
                onNone: () => skill.name,
                onSome: (p) => `${p}/${skill.name}`,
              });

              gitTreeHash = yield* fetchGitHubTreeHash(
                source.owner,
                source.repo,
                Option.getOrElse(source.ref, () => "HEAD"),
                pathInRepo,
              ).pipe(
                Effect.map(
                  (h): Option.Option<string> => (h === null ? Option.none() : Option.some(h)),
                ),
                Effect.catchAll(() => Effect.succeed<Option.Option<string>>(Option.none())),
              );
            }

            return {
              name: skill.name,
              // Skills from discover don't have version; it's from the frontmatter which we don't use here
              version: Option.none(),
              gitTreeHash,
            };
          }),
        { concurrency: "unbounded" },
      );
    }),
});

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
 * 10. Display plan (dry-run stops here)
 * 11. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (args: InstallHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  // Scoped to manage temp directory lifecycle from remote git source discovery.
  // The scope keeps the temp clone dir alive until plan application completes.
  return Effect.scoped(
    Effect.gen(function* () {
      // Get Clack service
      const clack = yield* Clack;

      // Show intro
      yield* clack.intro(`axm skills install (${scopeLabel})`);

      // Create spinner (auto-detects TTY)
      const spinner = yield* clack.spinner();

      // Step 1: Parse source
      spinner.start("Parsing source...");
      const source = yield* parseSource(args.source).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: formatError(
                `Invalid source: ${error.message}`,
                [`Provided: ${args.source || "(empty)"}`],
                "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
              ),
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop(`Source: ${printSource(source)} (${source.source})`);

      // Step 2: Get workspace context (provided by runtime)
      const context = yield* WorkspaceContextTag;

      // Step 3: Get agents from settings or --agent flag
      spinner.start("Loading agents...");
      const agents: AgentConfig[] = yield* ensureAgentsConfigured({
        agentFlags: args.agent,
        workspacePath: context.path,
        getSettings: () => context.getSettings(),
        yes: args.yes,
        nonInteractive: Option.getOrElse(args.nonInteractive, () => false),
      }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: error.message,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop(`Using ${agents.length} agent(s)`);

      // Step 4: Load current state (V2)
      spinner.start("Loading current state...");
      const currentState = yield* loadCurrentState(context).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to load current state: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop("Loaded current state");

      // Step 5: Discover skills from source
      spinner.start("Discovering skills...");
      const discoveredSkills = yield* discoverSkills(source).pipe(
        Effect.tapError(() => Effect.sync(() => spinner.stop("Failed"))),
      );

      if (!Array.isNonEmptyReadonlyArray(discoveredSkills)) {
        spinner.stop("No skills found");
        return yield* new InstallError({
          message: formatError(
            "No skills found in source",
            [`Source: ${printSource(source)}`],
            "Verify the source path contains directories with SKILL.md files.",
          ),
          cause: Option.none(),
          retryable: false,
        });
      }
      spinner.stop(`Found ${discoveredSkills.length} skill(s)`);

      // Step 6: List mode -> display and exit
      if (args.list) {
        yield* clack.log.info("Available skills:");
        for (const skill of discoveredSkills) {
          const desc = skill.description ? ` - ${skill.description}` : "";
          yield* clack.log.message(`  ${skill.name}${desc}`);
        }
        yield* clack.outro(`${discoveredSkills.length} skill(s) available`);
        return;
      }

      // Step 7: Select skills to install
      const selectedSkills = yield* determineSkillsToInstall(discoveredSkills, {
        requestedSkills: args.skill,
        all: args.all,
        dryRun: Option.getOrElse(args.dryRun, () => false),
        yes: args.yes,
      });

      const selectedSkillNames = Array.map(selectedSkills, (s) => s.name);

      if (!Array.isNonEmptyReadonlyArray(selectedSkillNames)) {
        yield* clack.log.warn("No skills selected.");
        yield* clack.outro("Nothing to install.");
        return;
      }

      const filteredSkills = selectedSkills;

      // Step 8: Build ideal state (V2)
      spinner.start("Building installation plan...");

      // Create the InstallCommand for V2 API
      const installCmd: InstallCommand = {
        _tag: "skills-install",
        source: args.source,
        agents: Array.map(agents, (a) => a.id),
        skills: selectedSkillNames,
        force: args.force,
      };

      // Create deps for buildIdealForInstall
      const buildIdealDeps = createBuildIdealDeps(source, filteredSkills);

      const ideal = yield* buildIdealForInstall(currentState, installCmd, buildIdealDeps).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to build ideal state: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );
      spinner.stop("Built installation plan");

      // Step 9: Build plan (V2)
      const plan = buildPlan(currentState, ideal);

      // Step 10: Display plan
      yield* displayPlan(clack, plan, printSource(source));

      // Step 11: Check if there are changes
      if (!planHasChanges(plan)) {
        yield* clack.log.info("Already up to date.");
        yield* clack.outro("No changes needed.");
        return;
      }

      // Step 12: Dry-run stops here
      if (Option.getOrElse(args.dryRun, () => false)) {
        yield* clack.outro("Dry-run complete. No changes made.");
        return;
      }

      // Step 13: Confirm installation (unless --yes or --non-interactive)
      if (!args.yes && !Option.getOrElse(args.nonInteractive, () => false)) {
        if (!isInteractive()) {
          return yield* Effect.fail(
            new InstallError({
              message: formatError(
                "Cannot prompt for confirmation",
                ["stdin is not a TTY"],
                "Use --yes, --all, or --non-interactive to run without prompts.",
              ),
              cause: Option.none(),
              retryable: false,
            }),
          );
        }
        const confirmed = yield* clack.confirm("Apply changes?").pipe(
          Effect.mapError(
            (error) =>
              new InstallError(
                error._tag === "PromptCancelled"
                  ? { message: "Installation cancelled.", cause: Option.none(), retryable: false }
                  : {
                      message: "Failed to prompt for confirmation",
                      cause: Option.some(error),
                      retryable: false,
                    },
              ),
          ),
        );
        if (!confirmed) {
          yield* clack.log.warn("Installation cancelled.");
          return;
        }
      }

      // Step 14: Apply changes (V2)
      const summary = getPlanSummary(plan);
      spinner.start(`Applying ${summary.installed + summary.updated} change(s)...`);

      // Build a name->path map from discovered skills for file operations.
      // The plan stores source info for lockfile/settings, but file operations
      // need the path to each specific skill folder.
      const skillPathMap = new Map(discoveredSkills.map((s) => [s.name, s.path]));

      const applyStepWithSkillPath = (step: PlanStep) => {
        if (step._tag === "InstallSkill" || step._tag === "UpdateSkill") {
          const skillPath = skillPathMap.get(step.skill);
          if (skillPath) {
            const localSource = SkillSourceV2.Local({ path: skillPath });
            const localStep = { ...step, source: localSource };
            return applyStep(localStep, { workspacePath: context.path, agents });
          }
        }
        return applyStep(step, { workspacePath: context.path, agents });
      };

      const applyResult = yield* applyPlan(
        plan,
        { dryRun: false },
        {
          applyStep: applyStepWithSkillPath,
          updateLockfile: (planData: { steps: ReadonlyArray<PlanStep> }) =>
            updateLockfileForPlan(context.path, planData),
          updateSettings: (planData: { steps: ReadonlyArray<PlanStep> }) =>
            updateSettingsForPlan(context.path, planData),
        },
      ).pipe(
        Effect.mapError(
          (error: { message: string }) =>
            new InstallError({
              message: `Failed to apply changes: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );

      spinner.stop(`Applied ${applyResult.applied.length} change(s)`);

      // Show results summary
      yield* Effect.forEach(
        applyResult.applied,
        (step) => {
          const agentNames = step.agents.join(", ");
          return clack.log.success(`${step.skill} -> ${agentNames}`);
        },
        { concurrency: 1 },
      );

      if (applyResult.failed.length > 0) {
        yield* Effect.forEach(
          applyResult.failed,
          (failure) => clack.log.error(`${failure.step.skill}: ${failure.error.message}`),
          { concurrency: 1 },
        );
      }

      yield* clack.outro(
        `Successfully installed ${applyResult.summary.installed} skill(s) to ${agents.length} agent(s)`,
      );
    }),
  );
};
