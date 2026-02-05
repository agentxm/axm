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
import { type AgentConfig, getAgentById } from "../../../agents/index.js";
import {
  buildCloneUrl,
  cloneRepo,
  discoverSkills,
  discoverWellKnownSkills,
  getCurrentCommit,
  type ParsedSource,
  parseSource,
  type Skill,
} from "../../../extensions/skills/index.js";
import { ensureInitializedLegacy, readSettings } from "../../../settings/index.js";
import { fetchGitHubTreeHash } from "../../../extensions/skills/github-api.js";
import { SkillSourceV2 } from "../../../extensions/skills/state/types.js";
import {
  applyPlan,
  applyStep,
  type BuildIdealDeps,
  buildIdealForInstall,
  buildPlan,
  CommandError,
  type DiscoveredSkill,
  getPlanSummary,
  type InstallCommand,
  loadCurrentState,
  makeWorkspaceContextLegacy,
  type PlanStep,
  planHasChanges,
  updateLockfileForPlan,
  updateSettingsForPlan,
  type WorkspaceContextLegacy,
} from "../../../workspace/index.js";
import { displayPlan } from "../display.js";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
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
export interface InstallArgs {
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
  readonly nonInteractive?: boolean | undefined;
  /** Preview installation plan without making changes */
  readonly dryRun?: boolean | undefined;
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
 * Used internally by the handler to track source resolution.
 */
interface ResolvedSource {
  /** Parsed source information */
  readonly parsed: ParsedSource;
  /** Path to directory containing skills */
  readonly skillsDir: string;
  /** Git commit SHA (for git sources) */
  readonly commitSha?: string;
}

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves skills from a GitHub/GitLab/Bitbucket git hosting source.
 */
const resolveGitSource = (
  parsed: ParsedSource,
  axmDir: string,
): Effect.Effect<
  { skills: Skill[]; skillsDir: string; commitSha: string },
  InstallError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const cloneUrl = yield* buildCloneUrl(parsed).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: error.message,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    const owner = Option.getOrElse(parsed.owner, () => "unknown");
    const repo = Option.getOrElse(parsed.repo, () => "unknown");
    const cacheDir = nodePath.join(axmDir, "cache", "git", `${owner}-${repo}`);

    // Clone repository
    yield* cloneRepo(cloneUrl, cacheDir, Option.getOrUndefined(parsed.ref)).pipe(
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
    const skillsDir = Option.match(parsed.path, {
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

    return { skills, skillsDir, commitSha };
  });

// -----------------------------------------------------------------------------
// V2 Dependencies
// -----------------------------------------------------------------------------

/**
 * Convert ParsedSource to SkillSourceV2.
 * Used to create a source for buildIdealForInstall.
 *
 * This preserves the original source info (e.g., GitHub owner/repo) for
 * storage in the lockfile and settings. The actual local path for file
 * operations is provided separately to the applyStep callback.
 */
const parsedSourceToV2 = (
  parsed: ParsedSource,
  skillsDir: string,
): Effect.Effect<SkillSourceV2, CommandError> => {
  switch (parsed.type) {
    case "local":
      return Effect.succeed(SkillSourceV2.Local({ path: skillsDir }));
    case "github":
      return Effect.succeed(
        SkillSourceV2.GitHub({
          owner: Option.getOrElse(parsed.owner, () => ""),
          repo: Option.getOrElse(parsed.repo, () => ""),
          ref: parsed.ref,
          path: parsed.path,
        }),
      );
    case "gitlab":
    case "bitbucket":
      // For non-GitHub git sources, store as Local with the cached path
      // The original source info is preserved in the lockfile via separate mechanism
      return Effect.succeed(SkillSourceV2.Local({ path: skillsDir }));
    case "wellknown":
      // For wellknown, store as Local with the cached path
      return Effect.succeed(SkillSourceV2.Local({ path: skillsDir }));
    default:
      return Effect.fail(
        new CommandError({
          message: `Unsupported source type: ${parsed.type}`,
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
  parseSource: () => parsedSourceToV2(resolvedSource.parsed, resolvedSource.skillsDir),

  discoverSkills: (source: SkillSourceV2) =>
    Effect.gen(function* () {
      // For GitHub sources, fetch git tree hash from API for each skill
      const skills: DiscoveredSkill[] = [];

      for (const skill of discoveredSkills) {
        let gitTreeHash: Option.Option<string> = Option.none();

        if (
          source._tag === "GitHub" &&
          resolvedSource.parsed.type === "github" &&
          Option.isSome(resolvedSource.parsed.owner) &&
          Option.isSome(resolvedSource.parsed.repo)
        ) {
          // Build path within repo: subpath (if any) + skill name
          const pathInRepo = Option.match(resolvedSource.parsed.path, {
            onNone: () => skill.name,
            onSome: (p) => `${p}/${skill.name}`,
          });

          gitTreeHash = yield* fetchGitHubTreeHash(
            resolvedSource.parsed.owner.value,
            resolvedSource.parsed.repo.value,
            Option.getOrElse(resolvedSource.parsed.ref, () => "HEAD"),
            pathInRepo,
          ).pipe(
            Effect.map((h): Option.Option<string> => (h === null ? Option.none() : Option.some(h))),
            Effect.catchAll(() => Effect.succeed<Option.Option<string>>(Option.none())),
          );
        }

        skills.push({
          name: skill.name,
          // Skills from discover don't have version; it's from the frontmatter which we don't use here
          version: Option.none(),
          gitTreeHash,
        });
      }

      return skills;
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
 * 5. Resolve source and build ideal state
 * 6. Build plan (diff current vs ideal)
 * 7. Display plan (dry-run stops here)
 * 8. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (
  args: InstallArgs,
): Effect.Effect<
  void,
  InstallError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path | Clack
> => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // Get Clack service
    const clack = yield* Clack;

    // Create workspace context (legacy)
    const ws: WorkspaceContextLegacy = makeWorkspaceContextLegacy({
      global: args.global,
      interactive: isInteractive() && !args.nonInteractive,
    });

    // Show intro
    yield* clack.intro(`axm skills install (${scopeLabel})`);

    // Create spinner (auto-detects TTY)
    const spinner = yield* clack.spinner();

    // Step 1: Parse source
    spinner.start("Parsing source...");
    const parsed = yield* parseSource(args.source).pipe(
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
    spinner.stop(`Source: ${parsed.canonical} (${parsed.type})`);

    // Step 2: Ensure initialized
    spinner.start("Checking initialization...");
    yield* ensureInitializedLegacy({ axmDir: ws.path }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to initialize: ${error.message}`,
            cause: Option.some(error),
            retryable: false,
          }),
      ),
    );
    spinner.stop("Initialized");

    // Step 3: Get agents from settings or --agent flag
    spinner.start("Loading agents...");
    let agents: AgentConfig[];

    if (args.agent.length > 0) {
      // Use explicitly specified agents via --agent flag
      agents = pipe(
        args.agent,
        Array.map((id) => getAgentById(id)),
        Array.getSomes,
      );

      if (agents.length !== args.agent.length) {
        // Array.partition returns [falseElements, trueElements]
        const [invalidIds, validIds] = Array.partition(args.agent, (id) =>
          Option.isSome(getAgentById(id)),
        );
        spinner.stop(`Found ${validIds.length} agent(s), ${invalidIds.length} invalid`);

        if (invalidIds.length > 0) {
          yield* clack.log.warn(`Unknown agents: ${invalidIds.join(", ")}`);
        }
      } else {
        spinner.stop(`Using ${agents.length} specified agent(s)`);
      }
    } else {
      // Read agents from settings (selected during init)
      const settings = yield* readSettings(ws.path).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to read settings: ${error.message}`,
              cause: Option.some(error),
              retryable: false,
            }),
        ),
      );

      const settingsAgents = settings.agents ?? [];
      agents = pipe(
        settingsAgents,
        Array.map((id) => getAgentById(id)),
        Array.getSomes,
      );

      spinner.stop(`Using ${agents.length} agent(s) from settings`);
    }

    if (agents.length === 0) {
      yield* clack.log.error(
        "No agents configured. Run 'axm init' first or use --agent to specify agents.",
      );
      yield* clack.outro("Nothing to do.");
      return;
    }

    // Step 4: Load current state (V2)
    spinner.start("Loading current state...");
    const currentState = yield* loadCurrentState(ws).pipe(
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

    // Step 5: Discover skills based on source type
    let skills: Skill[];
    let resolvedSource: ResolvedSource;

    if (parsed.type === "github" || parsed.type === "gitlab" || parsed.type === "bitbucket") {
      spinner.start("Fetching source to analyze contents...");
    } else {
      spinner.start("Discovering skills...");
    }

    if (parsed.type === "github" || parsed.type === "gitlab" || parsed.type === "bitbucket") {
      const result = yield* resolveGitSource(parsed, ws.path);
      skills = result.skills;
      resolvedSource = { parsed, skillsDir: result.skillsDir, commitSha: result.commitSha };
    } else if (parsed.type === "local") {
      // Local sources: discover skills directly from the filesystem path
      // localPath is always present for local sources (set by buildLocalSource)
      const skillsDir = Option.getOrElse(parsed.localPath, () => parsed.original);
      skills = yield* discoverSkills(skillsDir).pipe(
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
      resolvedSource = { parsed, skillsDir };
    } else if (parsed.type === "wellknown") {
      // Well-known URL sources: discover skills from /.well-known/skills/index.json
      const baseUrl = Option.getOrElse(parsed.baseUrl, () => parsed.original);
      skills = yield* discoverWellKnownSkills(baseUrl).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: formatError(
                `Failed to discover skills from well-known URL: ${error.message}`,
                [`URL: ${baseUrl}`],
                "Verify the URL serves a valid skills index at /.well-known/skills/index.json",
              ),
              cause: Option.some(error),
              retryable: error._tag === "WellKnownFetchError" && error.retryable,
            }),
        ),
      );
      // For wellknown sources, skillsDir is the base URL since files are fetched over HTTP
      resolvedSource = { parsed, skillsDir: baseUrl };
    } else if (parsed.type === "git" || parsed.type === "registry") {
      spinner.stop("Source type not yet supported");
      return yield* Effect.fail(
        new InstallError({
          message: `Source type "${parsed.type}" is not yet supported`,
          cause: Option.none(),
          retryable: false,
        }),
      );
    } else {
      // Exhaustive check - should never reach here
      const _exhaustive: never = parsed.type;
      spinner.stop("Unsupported source type");
      return yield* Effect.fail(
        new InstallError({
          message: `Unsupported source type: ${_exhaustive}`,
          cause: Option.none(),
          retryable: false,
        }),
      );
    }

    if (skills.length === 0) {
      spinner.stop("No skills found");
      return yield* Effect.fail(
        new InstallError({
          message: formatError(
            "No skills found in source",
            [`Source: ${parsed.canonical}`],
            "Verify the source path contains directories with SKILL.md files.",
          ),
          cause: Option.none(),
          retryable: false,
        }),
      );
    }

    spinner.stop(`Found ${skills.length} skill(s)`);

    // Step 5b: List mode - just show skills and exit
    if (args.list) {
      yield* clack.log.info("Available skills:");
      for (const skill of skills) {
        const desc = skill.description ? ` - ${skill.description}` : "";
        yield* clack.log.message(`  ${skill.name}${desc}`);
      }
      yield* clack.outro(`${skills.length} skill(s) available`);
      return;
    }

    // Step 6: Filter/select skills
    let selectedSkillNames: readonly string[];

    // Helper function to check if prompts can be used
    const canPrompt = (): boolean => {
      if (args.yes || args.nonInteractive) {
        return false;
      }
      return isInteractive();
    };

    if (args.skill.length > 0) {
      // Use explicitly specified skills
      selectedSkillNames = Array.filter(args.skill, (name) => skills.some((s) => s.name === name));
      const invalidSkills = Array.filter(args.skill, (name) => !skills.some((s) => s.name === name));

      if (invalidSkills.length > 0) {
        yield* clack.log.warn(`Unknown skills: ${invalidSkills.join(", ")}`);
      }
    } else if (args.all || args.dryRun) {
      // Install all skills (dry-run auto-selects all)
      selectedSkillNames = Array.map(skills, (s) => s.name);
      if (args.all) yield* clack.log.info(`Installing all ${skills.length} skill(s)`);
    } else if (!canPrompt()) {
      // Need to prompt but can't
      return yield* Effect.fail(
        new InstallError({
          message: formatError(
            "Cannot prompt for skill selection",
            ["stdin is not a TTY"],
            "Use --yes, --all, or --non-interactive to run without prompts.",
          ),
          cause: Option.none(),
          retryable: false,
        }),
      );
    } else {
      // Interactive selection
      const selectedSkills = yield* clack
        .multiselect("Select skills to install", skills, {
          toOption: (s) => ({
            value: s.name,
            label: s.name,
            hint: s.description,
          }),
          initialValues: Option.some(Array.map(skills, (s) => s.name)),
          required: Option.some(true),
        })
        .pipe(
          Effect.catchTag("PromptCancelled", () =>
            Effect.fail(
              new InstallError({
                message: "Operation cancelled.",
                cause: Option.none(),
                retryable: false,
              }),
            ),
          ),
          Effect.mapError((error) =>
            error._tag === "InstallError"
              ? error
              : new InstallError({
                  message: "Failed to prompt for skill selection",
                  cause: Option.some(error),
                  retryable: false,
                }),
          ),
        );
      selectedSkillNames = Array.map(selectedSkills, (s) => s.name);
    }

    if (selectedSkillNames.length === 0) {
      yield* clack.log.warn("No skills selected.");
      yield* clack.outro("Nothing to install.");
      return;
    }

    // Filter discovered skills to only those selected
    const filteredSkills = Array.filter(skills, (s) => selectedSkillNames.includes(s.name));

    // Step 7: Build ideal state (V2)
    spinner.start("Building installation plan...");

    // Create the InstallCommand for V2 API
    const installCmd: InstallCommand = {
      _tag: "skills-install",
      source: args.source,
      agents: Array.map(agents, (a) => a.id),
      skills: args.all ? "all" : [...selectedSkillNames],
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

    // Step 8: Build plan (V2)
    const plan = buildPlan(currentState, ideal);

    // Step 9: Display plan
    // Use the original parsed.canonical for display (e.g., "github:owner/repo")
    // instead of the cached local path
    yield* displayPlan(clack, plan, parsed.canonical);

    // Step 10: Check if there are changes
    if (!planHasChanges(plan)) {
      yield* clack.log.info("Already up to date.");
      yield* clack.outro("No changes needed.");
      return;
    }

    // Step 11: Dry-run stops here
    if (args.dryRun) {
      yield* clack.outro("Dry-run complete. No changes made.");
      return;
    }

    // Step 12: Confirm installation (unless --yes or --non-interactive)
    if (!args.yes && !args.nonInteractive) {
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
        Effect.catchTag("PromptCancelled", () =>
          Effect.fail(
            new InstallError({
              message: "Installation cancelled.",
              cause: Option.none(),
              retryable: false,
            }),
          ),
        ),
        Effect.mapError((error) =>
          error._tag === "InstallError"
            ? error
            : new InstallError({
                message: "Failed to prompt for confirmation",
                cause: Option.some(error),
                retryable: false,
              }),
        ),
      );
      if (!confirmed) {
        yield* clack.log.warn("Installation cancelled.");
        return;
      }
    }

    // Step 13: Apply changes (V2)
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
        return applyStep(localStep, { workspacePath: ws.path, agents });
      }
      return applyStep(step, { workspacePath: ws.path, agents });
    };

    const applyResult = yield* applyPlan(
      ws,
      plan,
      { dryRun: false },
      {
        applyStep: applyStepWithSkillPath,
        updateLockfile: (planData: { steps: ReadonlyArray<PlanStep> }) =>
          updateLockfileForPlan(ws.path, planData),
        updateSettings: (planData: { steps: ReadonlyArray<PlanStep> }) =>
          updateSettingsForPlan(ws.path, planData),
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
    for (const step of applyResult.applied) {
      const agentNames = step.agents.join(", ");
      yield* clack.log.success(`${step.skill} -> ${agentNames}`);
    }

    if (applyResult.failed.length > 0) {
      for (const failure of applyResult.failed) {
        yield* clack.log.error(`${failure.step.skill}: ${failure.error.message}`);
      }
    }

    yield* clack.outro(
      `Successfully installed ${applyResult.summary.installed} skill(s) to ${agents.length} agent(s)`,
    );
  });
};
