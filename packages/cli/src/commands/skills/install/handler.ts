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
import { getAxmDir } from "@agentxm/core/experimental/paths";
import {
  type AgentConfig,
  buildCloneUrl,
  cloneRepo,
  detectAgents,
  discoverSkills,
  ensureInitialized,
  getAgentById,
  getCurrentCommit,
  type ParsedSource,
  parseSource,
  type Skill,
} from "@agentxm/core/experimental/skills";
import {
  applyDiff,
  buildIdealForInstall,
  computeDiff,
  type DiffSummary,
  hasChanges,
  type SkillSource as LegacySkillSource,
  loadSkillsState,
  type ResolvedSource,
  type SkillChange,
  type SkillsDiff,
  skillsDiffToJson,
} from "@agentxm/core/experimental/skills/state";
import * as p from "@clack/prompts";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import { Data, Effect, Option } from "effect";
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
 * Uses legacy SkillSource type which includes WellKnown variant.
 */
const formatSource = (source: LegacySkillSource): string => {
  switch (source._tag) {
    case "Local":
      return source.path;
    case "Git":
      return Option.isSome(source.ref) ? `${source.url}@${source.ref.value}` : source.url;
    case "WellKnown":
      return source.baseUrl;
    case "Registry":
      return `${source.name}@${source.version}`;
  }
};

/**
 * Format hash for display (first 7 characters).
 */
const formatHash = (hash: string): string => {
  // Remove prefix like "sha256:" if present
  const stripped = hash.includes(":") ? (hash.split(":")[1] ?? hash) : hash;
  return stripped.slice(0, 7);
};

/**
 * Get symbol for change type.
 */
const getChangeSymbol = (tag: SkillChange["_tag"]): string => {
  switch (tag) {
    case "Add":
      return "+";
    case "Update":
      return "~";
    case "Remove":
      return "-";
    case "Repair":
      return "!";
    case "Unchanged":
      return " ";
    default: {
      // Exhaustive check
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
};

/**
 * Format a single change for display.
 */
const formatChange = (name: string, change: SkillChange): string => {
  const symbol = getChangeSymbol(change._tag);

  switch (change._tag) {
    case "Add": {
      const source = formatSource(change.skill.source);
      return `  ${symbol} ${name.padEnd(20)} ${source}`;
    }
    case "Update": {
      const fromHash = Option.isSome(change.from.actual)
        ? formatHash(change.from.actual.value.gitTreeFolderHash)
        : "???????";
      const toHash = formatHash(change.to.gitTreeFolderHash);
      return `  ${symbol} ${name.padEnd(20)} ${fromHash} -> ${toHash}`;
    }
    case "Remove":
      return `  ${symbol} ${name.padEnd(20)} (remove)`;
    case "Repair":
      return `  ${symbol} ${name.padEnd(20)} (repair)`;
    case "Unchanged":
      return `  ${symbol} ${name.padEnd(20)} (unchanged)`;
    default: {
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
};

/**
 * Format summary line.
 */
const formatSummary = (summary: DiffSummary): string => {
  const parts: string[] = [];
  if (summary.add > 0) parts.push(`${summary.add} to add`);
  if (summary.update > 0) parts.push(`${summary.update} to update`);
  if (summary.repair > 0) parts.push(`${summary.repair} to repair`);
  if (summary.remove > 0) parts.push(`${summary.remove} to remove`);
  return parts.length > 0 ? parts.join(", ") : "No changes";
};

/**
 * Display the diff/plan in human-readable format.
 */
const displayDiff = (diff: SkillsDiff): void => {
  // Filter out unchanged
  const changes: Array<[string, SkillChange]> = Object.entries(diff.changes).filter(
    (entry): entry is [string, SkillChange] => entry[1]._tag !== "Unchanged",
  );

  if (changes.length === 0) {
    return;
  }

  p.log.info("Plan:");
  p.log.message("");
  p.log.message("  Skills:");

  for (const [name, change] of changes) {
    p.log.message(formatChange(name, change));
  }

  p.log.message("");
  p.log.message(`  Summary: ${formatSummary(diff.summary)}`);
};

/**
 * Output diff as JSON.
 */
const outputDiffJson = (diff: SkillsDiff): void => {
  const json = skillsDiffToJson(diff);
  console.log(JSON.stringify(json, null, 2));
};

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
 * 6. Compute diff (the plan)
 * 7. Display plan (dry-run stops here)
 * 8. Confirm and apply changes
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (
  args: InstallArgs,
): Effect.Effect<void, InstallError, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> => {
  const axmDir = getAxmDir(args.global);
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // JSON mode should suppress non-JSON output
    const showOutput = !args.json;

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
    yield* ensureInitialized({ axmDir }).pipe(
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
        .filter((a): a is AgentConfig => a !== undefined);

      if (agents.length !== args.agent.length) {
        const validIds = args.agent.filter((id) => getAgentById(id) !== undefined);
        const invalidIds = args.agent.filter((id) => getAgentById(id) === undefined);
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
            toOption: (a) => {
              const opt: { value: string; label: string; hint?: string } = {
                value: a.id,
                label: a.name,
              };
              if (a.skillsDir) {
                opt.hint = `skills: ${a.skillsDir}`;
              }
              return opt;
            },
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

    // Step 4: Load current state
    if (showOutput) spinnerHelper.start("Loading current state...");
    const currentState = yield* loadSkillsState(axmDir).pipe(
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
      const result = yield* resolveGitSource(parsed, axmDir);
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

    // Step 7: Build ideal state
    if (showOutput) spinnerHelper.start("Building installation plan...");
    const ideal = yield* buildIdealForInstall(currentState, resolvedSource, {
      global: args.global,
      agents: agents.map((a) => a.id),
      force: args.force,
      skills: [...selectedSkillNames],
      all: args.all,
    }).pipe(
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

    // Step 8: Compute diff
    const diff = computeDiff(currentState, ideal);

    // Step 9: Display plan or output JSON
    if (args.json) {
      outputDiffJson(diff);
      if (args.dryRun) {
        // JSON output for dry-run doesn't include text message
        return;
      }
    } else {
      displayDiff(diff);
    }

    // Step 10: Check if there are changes
    if (!hasChanges(diff)) {
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

    // Step 13: Apply changes
    if (showOutput) {
      spinnerHelper.start(`Applying ${diff.summary.add + diff.summary.update} change(s)...`);
    }

    const applyResult = yield* applyDiff(diff, { axmDir, agents }).pipe(
      Effect.mapError(
        (error) =>
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
      for (const result of applyResult.applied) {
        const methods = result.agentResults.map((r) => r.method);
        const symlinkCount = methods.filter((m) => m === "symlink").length;
        const copyCount = methods.filter((m) => m === "copy").length;

        const methodInfo: string[] = [];
        if (symlinkCount > 0) methodInfo.push(`${symlinkCount} symlink(s)`);
        if (copyCount > 0) methodInfo.push(`${copyCount} copy(ies)`);

        const agentNames = result.agentResults
          .map((r) => {
            const agent = agents.find((a) => a.id === r.agentId);
            return agent?.name ?? r.agentId;
          })
          .join(", ");

        p.log.success(
          `${result.skillName} -> ${agentNames}${methodInfo.length > 0 ? ` (${methodInfo.join(", ")})` : ""}`,
        );
      }

      if (applyResult.failed.length > 0) {
        for (const failure of applyResult.failed) {
          p.log.error(`${failure.skillName}: ${failure.error.message}`);
        }
      }

      p.outro(
        `Successfully installed ${applyResult.applied.length} skill(s) to ${agents.length} agent(s)`,
      );
    }
  });
};
