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
import { type AgentConfig, detectAgents, getAgentById } from "@agentxm/core/experimental/agents";
import {
  buildCloneUrl,
  cloneRepo,
  discoverSkills,
  discoverWellKnownSkills,
  ensureInitialized,
  getCurrentCommit,
  type ParsedSource,
  parseSource,
  type Skill,
} from "@agentxm/core/experimental/skills";
import { fetchGitHubTreeHash } from "@agentxm/core/experimental/skills/github-api";
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
  makeWorkspaceContext,
  type PlanJson,
  type PlanStep,
  type PlanSummary,
  planHasChanges,
  planToJson,
  SkillSourceV2,
  updateLockfileForPlan,
  updateSettingsForPlan,
  type WorkspaceContext,
} from "@agentxm/core/experimental/workspace";
import * as p from "@clack/prompts";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import { Data, Effect, Option, pipe } from "effect";
import { formatError } from "../../../utils/errors.js";
import { canPrompt, promptConfirm, promptMultiselect } from "../../../utils/prompts.js";
import { createSpinnerHelper } from "../../../utils/spinner.js";
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
  /** Increase output detail */
  readonly verbose?: boolean | undefined;
  /** Suppress non-essential output */
  readonly quiet?: boolean | undefined;
  /** Output as JSON */
  readonly json?: boolean | undefined;
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
  readonly cause?: unknown;
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
            cause: error,
            retryable: false,
          }),
      ),
    );
    const cacheDir = nodePath.join(axmDir, "cache", "git", `${parsed.owner}-${parsed.repo}`);

    // Clone repository
    yield* cloneRepo(cloneUrl, cacheDir, parsed.ref).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: formatError(
              `Failed to clone repository: ${error.message}`,
              [`URL: ${cloneUrl}`],
              "Check your network connection and repository access credentials.",
            ),
            cause: error,
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
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Determine skills directory (with optional subpath)
    const skillsDir = parsed.path ? nodePath.join(cacheDir, parsed.path) : cacheDir;

    // Discover skills
    const skills = yield* discoverSkills(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to discover skills in ${skillsDir}: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    return { skills, skillsDir, commitSha };
  });

// -----------------------------------------------------------------------------
// Plan Display
// -----------------------------------------------------------------------------

/**
 * Format source for display in plan output.
 * Uses V2 SkillSourceV2 type with Registry, GitHub, Local variants.
 */
const formatSourceV2 = (source: SkillSourceV2): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "GitHub": {
      let result = `github:${source.owner}/${source.repo}`;
      if (Option.isSome(source.path)) {
        result += `/${source.path.value}`;
      }
      if (Option.isSome(source.ref)) {
        result += `@${source.ref.value}`;
      }
      return result;
    }
    case "Registry": {
      let result = `@${source.scope}/${source.name}`;
      if (Option.isSome(source.version)) {
        result += `@${source.version.value}`;
      }
      return result;
    }
  }
};

/**
 * Format hash for display (first 7 characters).
 */
const formatHash = (hash: Option.Option<string>): string =>
  pipe(
    hash,
    Option.map((h) => {
      // Remove prefix like "sha256:" if present
      const stripped = h.includes(":") ? (h.split(":")[1] ?? h) : h;
      return stripped.slice(0, 7);
    }),
    Option.getOrElse(() => "???????"),
  );

/**
 * Get symbol for plan step type.
 */
const getStepSymbol = (tag: PlanStep["_tag"]): string => {
  switch (tag) {
    case "InstallSkill":
      return "+";
    case "UpdateSkill":
      return "~";
    case "UninstallSkill":
      return "-";
    default: {
      // Exhaustive check
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
};

/**
 * Format a single plan step for display.
 * @param step - The plan step to format
 * @param displaySource - Optional display source string (for showing original source instead of cached path)
 */
const formatStep = (step: PlanStep, displaySource?: string): string => {
  const symbol = getStepSymbol(step._tag);

  switch (step._tag) {
    case "InstallSkill": {
      const source = displaySource ?? formatSourceV2(step.source);
      return `  ${symbol} ${step.skill.padEnd(20)} ${source}`;
    }
    case "UpdateSkill": {
      const fromHash = formatHash(step.fromHash);
      const toHash = formatHash(step.toHash);
      return `  ${symbol} ${step.skill.padEnd(20)} ${fromHash} -> ${toHash}`;
    }
    case "UninstallSkill":
      return `  ${symbol} ${step.skill.padEnd(20)} (remove)`;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
};

/**
 * Format summary line for plan.
 */
const formatPlanSummary = (summary: PlanSummary): string => {
  const parts: string[] = [];
  if (summary.installed > 0) parts.push(`${summary.installed} to install`);
  if (summary.updated > 0) parts.push(`${summary.updated} to update`);
  if (summary.uninstalled > 0) parts.push(`${summary.uninstalled} to uninstall`);
  return parts.length > 0 ? parts.join(", ") : "No changes";
};

/**
 * Display the plan in human-readable format.
 * @param steps - The plan steps to display
 * @param displaySource - Optional display source string (for showing original source instead of cached path)
 */
const displayPlanOutput = (steps: ReadonlyArray<PlanStep>, displaySource?: string): void => {
  if (steps.length === 0) {
    return;
  }

  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");

  for (const step of steps) {
    p.log.message(formatStep(step, displaySource));
  }

  const summary = getPlanSummary({ steps });
  p.log.message("");
  p.log.message(`  Summary: ${formatPlanSummary(summary)}`);
};

/**
 * Output plan as JSON.
 */
const outputPlanJson = (steps: ReadonlyArray<PlanStep>): void => {
  const json: PlanJson = planToJson({ steps });
  console.log(JSON.stringify(json, null, 2));
};

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
          owner: parsed.owner ?? "",
          repo: parsed.repo ?? "",
          ref: Option.fromNullable(parsed.ref),
          path: Option.fromNullable(parsed.path),
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
  parseSource: (_source: string) =>
    parsedSourceToV2(resolvedSource.parsed, resolvedSource.skillsDir),

  discoverSkills: (source: SkillSourceV2) =>
    Effect.gen(function* () {
      // For GitHub sources, fetch git tree hash from API for each skill
      const skills: DiscoveredSkill[] = [];

      for (const skill of discoveredSkills) {
        let gitTreeHash: Option.Option<string> = Option.none();

        if (
          source._tag === "GitHub" &&
          resolvedSource.parsed.type === "github" &&
          resolvedSource.parsed.owner &&
          resolvedSource.parsed.repo
        ) {
          // Build path within repo: subpath (if any) + skill name
          const pathInRepo = resolvedSource.parsed.path
            ? `${resolvedSource.parsed.path}/${skill.name}`
            : skill.name;

          gitTreeHash = yield* fetchGitHubTreeHash(
            resolvedSource.parsed.owner,
            resolvedSource.parsed.repo,
            resolvedSource.parsed.ref ?? "HEAD",
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
): Effect.Effect<void, InstallError, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // JSON mode should suppress non-JSON output
    const showOutput = !args.json;

    // Create workspace context (V2)
    const ws: WorkspaceContext = makeWorkspaceContext({
      global: args.global,
      interactive: isInteractive() && !args.nonInteractive,
    });

    // Show intro
    if (showOutput) {
      p.intro(`axm skills install (${scopeLabel})`);
    }

    // Create spinner helper (auto-detects TTY)
    const spinnerHelper = createSpinnerHelper();

    // Step 1: Parse source
    if (showOutput) spinnerHelper.start("Parsing source...");
    const parsed = yield* parseSource(args.source).pipe(
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
    if (showOutput) spinnerHelper.stop(`Source: ${parsed.canonical} (${parsed.type})`);

    // Step 2: Ensure initialized
    if (showOutput) spinnerHelper.start("Checking initialization...");
    yield* ensureInitialized({ axmDir: ws.path }).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to initialize: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Initialized");

    // Step 3: Detect or select agents
    if (showOutput) spinnerHelper.start("Detecting agents...");
    let agents: AgentConfig[];

    if (args.agent.length > 0) {
      // Use explicitly specified agents
      agents = args.agent
        .map((id) => getAgentById(id))
        .filter(Option.isSome)
        .map((opt) => opt.value);

      if (agents.length !== args.agent.length) {
        const validIds = args.agent.filter((id) => Option.isSome(getAgentById(id)));
        const invalidIds = args.agent.filter((id) => Option.isNone(getAgentById(id)));
        if (showOutput)
          spinnerHelper.stop(`Found ${validIds.length} agent(s), ${invalidIds.length} invalid`);

        if (invalidIds.length > 0 && showOutput) {
          p.log.warn(`Unknown agents: ${invalidIds.join(", ")}`);
        }
      } else {
        if (showOutput) spinnerHelper.stop(`Using ${agents.length} specified agent(s)`);
      }
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents().pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to detect agents: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      if (detectedAgents.length === 0) {
        if (showOutput) {
          spinnerHelper.stop("No agents detected");
          p.log.error("No AI coding agents detected. Use --agent to specify agents manually.");
          p.outro("No agents available.");
        }
        return;
      }

      if (showOutput) spinnerHelper.stop(`Found ${detectedAgents.length} agent(s)`);

      // Select agents (interactive or auto)
      if (args.yes || args.nonInteractive || args.dryRun) {
        agents = detectedAgents;
        if (showOutput)
          p.log.info(`Auto-selecting all detected agents: ${agents.map((a) => a.name).join(", ")}`);
      } else if (!isInteractive()) {
        // Not interactive and no --yes/--non-interactive flag
        return yield* new InstallError({
          message: formatError(
            "Cannot prompt for agent selection",
            ["stdin is not a TTY"],
            "Use --yes, --all, or --non-interactive to run without prompts.",
          ),
          retryable: false,
        });
      } else {
        const selectedAgents = yield* promptMultiselect(
          "Select agents to install skills for",
          detectedAgents,
          {
            toOption: (a) => ({
              value: a.id,
              label: a.name,
              hint: `skills: ${a.skills.projectDir}`,
            }),
            initialValues: detectedAgents.map((a) => a.id),
            required: true,
          },
        ).pipe(
          Effect.mapError(
            (error) =>
              new InstallError({
                message: "Failed to prompt for agent selection",
                cause: error,
                retryable: false,
              }),
          ),
        );
        agents = selectedAgents;
      }
    }

    if (agents.length === 0) {
      if (showOutput) {
        p.log.error("No agents selected.");
        p.outro("Nothing to do.");
      }
      return;
    }

    // Step 4: Load current state (V2)
    if (showOutput) spinnerHelper.start("Loading current state...");
    const currentState = yield* loadCurrentState(ws).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new InstallError({
            message: `Failed to load current state: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Loaded current state");

    // Step 5: Discover skills based on source type
    let skills: Skill[];
    let resolvedSource: ResolvedSource;

    if (showOutput) {
      if (parsed.type === "github" || parsed.type === "gitlab" || parsed.type === "bitbucket") {
        spinnerHelper.start("Fetching source to analyze contents...");
      } else {
        spinnerHelper.start("Discovering skills...");
      }
    }

    if (parsed.type === "github" || parsed.type === "gitlab" || parsed.type === "bitbucket") {
      const result = yield* resolveGitSource(parsed, ws.path);
      skills = result.skills;
      resolvedSource = { parsed, skillsDir: result.skillsDir, commitSha: result.commitSha };
    } else if (parsed.type === "local") {
      // Local sources: discover skills directly from the filesystem path
      // localPath is always present for local sources (set by buildLocalSource)
      const skillsDir = parsed.localPath ?? parsed.original;
      skills = yield* discoverSkills(skillsDir).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: formatError(
                `Failed to discover skills: ${error.message}`,
                [`Path: ${skillsDir}`],
                "Verify the path exists and contains directories with SKILL.md files.",
              ),
              cause: error,
              retryable: false,
            }),
        ),
      );
      resolvedSource = { parsed, skillsDir };
    } else if (parsed.type === "wellknown") {
      // Well-known URL sources: discover skills from /.well-known/skills/index.json
      const baseUrl = parsed.baseUrl ?? parsed.original;
      skills = yield* discoverWellKnownSkills(baseUrl).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: formatError(
                `Failed to discover skills from well-known URL: ${error.message}`,
                [`URL: ${baseUrl}`],
                "Verify the URL serves a valid skills index at /.well-known/skills/index.json",
              ),
              cause: error,
              retryable: error._tag === "WellKnownFetchError" && error.retryable,
            }),
        ),
      );
      // For wellknown sources, skillsDir is the base URL since files are fetched over HTTP
      resolvedSource = { parsed, skillsDir: baseUrl };
    } else if (parsed.type === "git" || parsed.type === "registry") {
      if (showOutput) spinnerHelper.stop("Source type not yet supported");
      return yield* new InstallError({
        message: `Source type "${parsed.type}" is not yet supported`,
        retryable: false,
      });
    } else {
      // Exhaustive check - should never reach here
      const _exhaustive: never = parsed.type;
      if (showOutput) spinnerHelper.stop("Unsupported source type");
      return yield* new InstallError({
        message: `Unsupported source type: ${_exhaustive}`,
        retryable: false,
      });
    }

    if (skills.length === 0) {
      if (showOutput) spinnerHelper.stop("No skills found");
      return yield* new InstallError({
        message: formatError(
          "No skills found in source",
          [`Source: ${parsed.canonical}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        retryable: false,
      });
    }

    if (showOutput) spinnerHelper.stop(`Found ${skills.length} skill(s)`);

    // Step 5b: List mode - just show skills and exit
    if (args.list) {
      if (showOutput) {
        p.log.info("Available skills:");
        for (const skill of skills) {
          const desc = skill.description ? ` - ${skill.description}` : "";
          p.log.message(`  ${skill.name}${desc}`);
        }
        p.outro(`${skills.length} skill(s) available`);
      }
      return;
    }

    // Step 6: Filter/select skills
    let selectedSkillNames: readonly string[];

    if (args.skill.length > 0) {
      // Use explicitly specified skills
      selectedSkillNames = args.skill.filter((name) => skills.some((s) => s.name === name));
      const invalidSkills = args.skill.filter((name) => !skills.some((s) => s.name === name));

      if (invalidSkills.length > 0 && showOutput) {
        p.log.warn(`Unknown skills: ${invalidSkills.join(", ")}`);
      }
    } else if (args.all || args.dryRun) {
      // Install all skills (dry-run auto-selects all)
      selectedSkillNames = skills.map((s) => s.name);
      if (showOutput && args.all) p.log.info(`Installing all ${skills.length} skill(s)`);
    } else if (!canPrompt({ yes: args.yes, nonInteractive: args.nonInteractive ?? false })) {
      // Need to prompt but can't
      return yield* new InstallError({
        message: formatError(
          "Cannot prompt for skill selection",
          ["stdin is not a TTY"],
          "Use --yes, --all, or --non-interactive to run without prompts.",
        ),
        retryable: false,
      });
    } else {
      // Interactive selection
      const selectedSkills = yield* promptMultiselect("Select skills to install", skills, {
        toOption: (s) => {
          const opt: { value: string; label: string; hint?: string } = {
            value: s.name,
            label: s.name,
          };
          if (s.description) {
            opt.hint = s.description;
          }
          return opt;
        },
        initialValues: skills.map((s) => s.name),
        required: true,
      }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: "Failed to prompt for skill selection",
              cause: error,
              retryable: false,
            }),
        ),
      );
      selectedSkillNames = selectedSkills.map((s) => s.name);
    }

    if (selectedSkillNames.length === 0) {
      if (showOutput) {
        p.log.warn("No skills selected.");
        p.outro("Nothing to install.");
      }
      return;
    }

    // Filter discovered skills to only those selected
    const filteredSkills = skills.filter((s) => selectedSkillNames.includes(s.name));

    // Step 7: Build ideal state (V2)
    if (showOutput) spinnerHelper.start("Building installation plan...");

    // Create the InstallCommand for V2 API
    const installCmd: InstallCommand = {
      _tag: "skills-install",
      source: args.source,
      agents: agents.map((a) => a.id),
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
            cause: error,
            retryable: false,
          }),
      ),
    );
    if (showOutput) spinnerHelper.stop("Built installation plan");

    // Step 8: Build plan (V2)
    const plan = buildPlan(currentState, ideal);

    // Step 9: Display plan or output JSON
    // Use the original parsed.canonical for display (e.g., "github:owner/repo")
    // instead of the cached local path
    if (args.json) {
      outputPlanJson(plan.steps);
      if (args.dryRun) {
        // JSON output for dry-run doesn't include text message
        return;
      }
    } else {
      displayPlanOutput(plan.steps, parsed.canonical);
    }

    // Step 10: Check if there are changes
    if (!planHasChanges(plan)) {
      if (showOutput) {
        p.log.info("Already up to date.");
        p.outro("No changes needed.");
      }
      return;
    }

    // Step 11: Dry-run stops here
    if (args.dryRun) {
      if (showOutput) {
        p.outro("Dry-run complete. No changes made.");
      }
      return;
    }

    // Step 12: Confirm installation (unless --yes or --non-interactive)
    if (!args.yes && !args.nonInteractive) {
      if (!isInteractive()) {
        return yield* new InstallError({
          message: formatError(
            "Cannot prompt for confirmation",
            ["stdin is not a TTY"],
            "Use --yes, --all, or --non-interactive to run without prompts.",
          ),
          retryable: false,
        });
      }
      const confirmed = yield* promptConfirm("Apply changes?").pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: "Failed to prompt for confirmation",
              cause: error,
              retryable: false,
            }),
        ),
      );
      if (!confirmed) {
        p.cancel("Installation cancelled.");
        return;
      }
    }

    // Step 13: Apply changes (V2)
    const summary = getPlanSummary(plan);
    if (showOutput) {
      spinnerHelper.start(`Applying ${summary.installed + summary.updated} change(s)...`);
    }

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
        updateLockfile: (p: { steps: ReadonlyArray<PlanStep> }) =>
          updateLockfileForPlan(ws.path, p),
        updateSettings: (p: { steps: ReadonlyArray<PlanStep> }) =>
          updateSettingsForPlan(ws.path, p),
      },
    ).pipe(
      Effect.mapError(
        (error: { message: string }) =>
          new InstallError({
            message: `Failed to apply changes: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    if (showOutput) spinnerHelper.stop(`Applied ${applyResult.applied.length} change(s)`);

    // Show results summary
    if (showOutput) {
      for (const step of applyResult.applied) {
        const agentNames = step.agents.join(", ");
        p.log.success(`${step.skill} -> ${agentNames}`);
      }

      if (applyResult.failed.length > 0) {
        for (const failure of applyResult.failed) {
          p.log.error(`${failure.step.skill}: ${failure.error.message}`);
        }
      }

      p.outro(
        `Successfully installed ${applyResult.summary.installed} skill(s) to ${agents.length} agent(s)`,
      );
    }
  });
};
