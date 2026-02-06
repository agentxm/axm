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

import * as nodePath from "node:path";
import type { AgentConfig } from "../../../agents/index.js";
import type { ExtensionRef } from "../../../extensions/common.js";
import {
  buildCloneUrl,
  cloneRepo,
  type DiscoveredSkill,
  discoverSkills,
  getCurrentCommit,
  parseSource,
  printSource,
  type Skill,
  type Source,
} from "../../../extensions/skills/index.js";
import { determineSkillsToInstall } from "./select-skills.js";
import type { BitbucketSource, GitHubSource, GitLabSource } from "../../../sources/index.js";
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
import type { FileSystem } from "@effect/platform";
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
// Internal Types
// -----------------------------------------------------------------------------

/**
 * Resolved source with skills directory path.
 * Used internally by the handler and select-skills to track source resolution.
 */
export interface ResolvedSource {
  /** Parsed source information */
  readonly source: Source;
  /** Path to directory containing skills */
  readonly skillsDir: string;
  /** Git commit SHA (for git sources) */
  readonly commitSha: Option.Option<string>;
}

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves skills from a GitHub/GitLab/Bitbucket git hosting source.
 */
const resolveGitHostingProviderSource = (
  source: GitHubSource | GitLabSource | BitbucketSource,
  axmDir: string,
): Effect.Effect<
  { skills: DiscoveredSkill[]; skillsDir: string; commitSha: string },
  InstallError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const cloneUrl = yield* buildCloneUrl(source).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: error.message,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    const cacheDir = nodePath.join(axmDir, "cache", "git", `${source.owner}-${source.repo}`);

    // Clone repository
    yield* cloneRepo(cloneUrl, cacheDir, Option.getOrUndefined(source.ref)).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: formatError(
              `Failed to clone repository: ${error.message}`,
              [`URL: ${cloneUrl}`],
              "Check your network connection and repository access credentials.",
            ),
            cause: Option.some(error),
            retryable: true,
          }),
      ),
    );

    // Get current commit SHA
    const commitSha = yield* getCurrentCommit(cacheDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to get commit SHA: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    // Determine skills directory (with optional subpath)
    const skillsDir = Option.match(source.subPath, {
      onNone: () => cacheDir,
      onSome: (p) => nodePath.join(cacheDir, p),
    });

    // Discover skills
    const skills = yield* discoverSkills(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to discover skills in ${skillsDir}: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );

    const discovered: DiscoveredSkill[] = skills.map((skill) => ({
      ...skill,
      discoveryPath: Array.of<ExtensionRef>({ name: skill.name, type: "skill" }),
    }));

    return { skills: discovered, skillsDir, commitSha };
  });

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
const sourceToV2 = (
  source: Source,
  skillsDir: string,
): Effect.Effect<SkillSourceV2, CommandError> => {
  switch (source.source) {
    case "local":
      return Effect.succeed(SkillSourceV2.Local({ path: skillsDir }));
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
      // For non-GitHub git sources, store as Local with the cached path
      // The original source info is preserved in the lockfile via separate mechanism
      return Effect.succeed(SkillSourceV2.Local({ path: skillsDir }));
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
  resolvedSource: ResolvedSource,
  discoveredSkills: readonly Skill[],
): BuildIdealDeps => ({
  parseSource: () => sourceToV2(resolvedSource.source, resolvedSource.skillsDir),

  discoverSkills: (v2Source: SkillSourceV2) =>
    Effect.gen(function* () {
      // For GitHub sources, fetch git tree hash from API for each skill
      const src = resolvedSource.source;
      const isGitHubSource = v2Source._tag === "GitHub" && src.source === "github";

      return yield* Effect.forEach(
        discoveredSkills,
        (skill) =>
          Effect.gen(function* () {
            let gitTreeHash: Option.Option<string> = Option.none();

            if (isGitHubSource && src.source === "github") {
              // Build path within repo: subpath (if any) + skill name
              const pathInRepo = Option.match(src.subPath, {
                onNone: () => skill.name,
                onSome: (p) => `${p}/${skill.name}`,
              });

              gitTreeHash = yield* fetchGitHubTreeHash(
                src.owner,
                src.repo,
                Option.getOrElse(src.ref, () => "HEAD"),
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
// Source Discovery
// -----------------------------------------------------------------------------

/**
 * Discovers skills from a parsed source.
 * Resolves the source (cloning if remote), then discovers available skills
 * within it. Returns discovered skills alongside resolved source metadata.
 */
const discoverSkillsFromSource = (source: Source) =>
  Effect.gen(function* () {
    const { path: workspacePath } = yield* WorkspaceContextTag;

    switch (source.source) {
      case "github":
      case "gitlab":
      case "bitbucket": {
        const result = yield* resolveGitHostingProviderSource(source, workspacePath);
        return {
          skills: result.skills,
          resolvedSource: {
            source,
            skillsDir: result.skillsDir,
            commitSha: Option.some(result.commitSha),
          } satisfies ResolvedSource,
        };
      }

      case "azurerepos":
        return yield* new InstallError({
          message: formatError(
            "Azure Repos sources are not yet supported",
            [`Source: ${printSource(source)}`],
            "Use GitHub, GitLab, Bitbucket, or a local path instead.",
          ),
          cause: Option.none(),
          retryable: false,
        });

      case "local": {
        const skillsDir = source.path;
        const rawSkills = yield* discoverSkills(skillsDir).pipe(
          Effect.mapError(
            (error) =>
              new InstallError({
                message: formatError(
                  `Failed to discover skills: ${error.message}`,
                  [`Path: ${skillsDir}`],
                  "Verify the path exists and contains directories with SKILL.md files.",
                ),
                cause: Option.some(error),
                retryable: false,
              }),
          ),
        );
        const skills: DiscoveredSkill[] = rawSkills.map((skill) => ({
          ...skill,
          discoveryPath: Array.of<ExtensionRef>({ name: skill.name, type: "skill" }),
        }));
        return {
          skills,
          resolvedSource: {
            source,
            skillsDir,
            commitSha: Option.none(),
          } satisfies ResolvedSource,
        };
      }

      case "git":
      case "registry":
        return yield* Effect.fail(
          new InstallError({
            message: `Source type "${source.source}" is not yet supported`,
            cause: Option.none(),
            retryable: false,
          }),
        );
    }
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

  return Effect.gen(function* () {
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
    const { skills: discoveredSkills, resolvedSource } = yield* discoverSkillsFromSource(
      source,
    ).pipe(Effect.tapError(() => Effect.sync(() => spinner.stop("Failed"))));

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
        const desc = Option.isSome(skill.description) ? ` - ${skill.description.value}` : "";
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
    const buildIdealDeps = createBuildIdealDeps(resolvedSource, filteredSkills);

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

    // Create a modified applyStep that ensures source paths point to the specific skill folder.
    // The plan stores source pointing to the skillsDir root (for lockfile/settings),
    // but file operations need the path to the specific skill folder.
    const applyStepWithSkillPath = (step: PlanStep) => {
      // For install/update steps, ensure source path includes the skill name
      if (step._tag === "InstallSkill" || step._tag === "UpdateSkill") {
        // For GitHub/Registry: use the cached skillsDir + skill name
        // For Local: the source path is the skillsDir root, append skill name
        const skillPath = nodePath.join(resolvedSource.skillsDir, step.skill);
        const localSource = SkillSourceV2.Local({ path: skillPath });
        const localStep = { ...step, source: localSource };
        return applyStep(localStep, { workspacePath: context.path, agents });
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
  });
};
