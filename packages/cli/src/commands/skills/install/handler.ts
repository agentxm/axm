/**
 * Install command handler - Effect-based orchestration for `axm skills install`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as nodePath from "node:path";
import { getAxmDir } from "@agentxm/core/experimental";
import {
  type AgentConfig,
  buildCloneUrl,
  cloneRepo,
  computeContentHash,
  detectAgents,
  discoverSkills,
  ensureInitialized,
  fetchSkillFiles,
  fetchWellKnownIndex,
  getAgentById,
  getCurrentCommit,
  getOriginFromParsed,
  type InstallResult,
  installSkillToAgents,
  type LockEntry,
  type ParsedSource,
  parseSource,
  readLockfile,
  type Skill,
  updateLockEntry,
  updateSettings,
  type WellKnownSkill,
} from "@agentxm/core/experimental/skills";
import * as p from "@clack/prompts";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import { Data, Effect, pipe } from "effect";
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
 * Resolves skills from a local path source.
 */
const resolveLocalSource = (
  parsed: ParsedSource,
): Effect.Effect<{ skills: Skill[]; skillsDir: string }, InstallError, FileSystem.FileSystem> =>
  pipe(
    discoverSkills(parsed.canonical),
    Effect.map((skills) => ({
      skills,
      skillsDir: parsed.canonical,
    })),
    Effect.mapError(
      (error) =>
        new InstallError({
          message: `Failed to discover skills in ${parsed.canonical}: ${error.message}`,
          cause: error,
          retryable: false,
        }),
    ),
  );

/**
 * Resolves skills from a GitHub/GitLab source.
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
    const cloneUrl = buildCloneUrl(parsed);
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

/**
 * Resolves skills from a well-known URL source.
 */
const resolveWellKnownSource = (
  parsed: ParsedSource,
): Effect.Effect<
  { skills: Skill[]; wellKnownSkills: WellKnownSkill[] },
  InstallError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const baseUrl = parsed.url ?? parsed.canonical;

    // Fetch the well-known index
    const index = yield* fetchWellKnownIndex(baseUrl).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to fetch well-known index from ${baseUrl}: ${error.message}`,
            cause: error,
            retryable: "retryable" in error ? error.retryable : false,
          }),
      ),
    );

    // Convert to Skill objects for display/selection
    const skills: Skill[] = index.skills.map((wkSkill) => ({
      name: wkSkill.name,
      path: `${baseUrl}/.well-known/skills/${wkSkill.name}/SKILL.md`,
      description: wkSkill.description,
    }));

    return { skills, wellKnownSkills: [...index.skills] };
  });

// -----------------------------------------------------------------------------
// Installation
// -----------------------------------------------------------------------------

/**
 * Installs a single skill and returns its install results and metadata for lockfile/settings updates.
 */
const installSingleSkillFromFileSystem = (
  skill: Skill,
  agents: AgentConfig[],
  axmDir: string,
): Effect.Effect<
  { results: readonly InstallResult[]; skillName: string; skillPath: string; contentHash: string },
  InstallError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    // Install skill to all agents
    const results = yield* installSkillToAgents(skill, agents, axmDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to install skill ${skill.name}: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Compute content hash for lockfile
    const canonicalSkillPath = nodePath.join(axmDir, "skills", skill.name);
    const contentHash = yield* computeContentHash(canonicalSkillPath).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to compute content hash for ${skill.name}: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    return { results, skillName: skill.name, skillPath: skill.path, contentHash };
  });

/**
 * Installs skills from a local or git source.
 */
const installSkillsFromFileSystem = (
  skills: Skill[],
  agents: AgentConfig[],
  axmDir: string,
  parsed: ParsedSource,
  commitSha?: string,
): Effect.Effect<InstallResult[], InstallError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Install all skills in parallel
    const installResults = yield* Effect.all(
      skills.map((skill) => installSingleSkillFromFileSystem(skill, agents, axmDir)),
      { concurrency: "unbounded" },
    );

    // Collect all results
    const allResults: InstallResult[] = installResults.flatMap((r) => r.results);

    // Update lockfile and settings sequentially (after all installs complete)
    const now = new Date().toISOString();
    for (const { skillName, contentHash } of installResults) {
      // Derive origin from parsed source
      const origin = getOriginFromParsed(parsed);
      const lockEntry: LockEntry = {
        source: parsed.canonical,
        origin,
        folderHash: contentHash,
        installedAt: now,
        updatedAt: now,
      };

      yield* updateLockEntry(axmDir, skillName, lockEntry).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to update lockfile for ${skillName}: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      yield* updateSettings(axmDir, {
        skills: {
          [skillName]: "*",
        },
      }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to update settings for ${skillName}: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );
    }

    return allResults;
  });

/**
 * Installs a single skill from a well-known URL source and returns its install results and metadata.
 */
const installSingleSkillFromWellKnown = (
  skill: Skill,
  wellKnownSkills: WellKnownSkill[],
  agents: AgentConfig[],
  axmDir: string,
  baseUrl: string,
): Effect.Effect<
  {
    results: readonly InstallResult[];
    skillName: string;
    skillPath: string;
    contentHash: string;
  } | null,
  InstallError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    // Find the corresponding well-known skill
    const wkSkill = wellKnownSkills.find((wk) => wk.name === skill.name);
    if (!wkSkill) {
      return null;
    }

    // Fetch skill files to cache
    const cacheDir = nodePath.join(axmDir, "cache", "wellknown", skill.name);
    const fetchedSkill = yield* fetchSkillFiles(baseUrl, wkSkill, cacheDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to fetch skill ${skill.name}: ${error.message}`,
            cause: error,
            retryable: "retryable" in error ? error.retryable : false,
          }),
      ),
    );

    // Install skill to all agents
    const results = yield* installSkillToAgents(fetchedSkill, agents, axmDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to install skill ${skill.name}: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    // Compute content hash for lockfile
    const canonicalSkillPath = nodePath.join(axmDir, "skills", skill.name);
    const contentHash = yield* computeContentHash(canonicalSkillPath).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to compute content hash for ${skill.name}: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    return { results, skillName: skill.name, skillPath: fetchedSkill.path, contentHash };
  });

/**
 * Installs skills from a well-known URL source.
 */
const installSkillsFromWellKnown = (
  skills: Skill[],
  wellKnownSkills: WellKnownSkill[],
  agents: AgentConfig[],
  axmDir: string,
  parsed: ParsedSource,
): Effect.Effect<
  InstallResult[],
  InstallError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    const baseUrl = parsed.url ?? parsed.canonical;

    // Install all skills in parallel
    const installResults = yield* Effect.all(
      skills.map((skill) =>
        installSingleSkillFromWellKnown(skill, wellKnownSkills, agents, axmDir, baseUrl),
      ),
      { concurrency: "unbounded" },
    );

    // Filter out null results (skills not found in wellKnownSkills)
    const validResults = installResults.filter((r): r is NonNullable<typeof r> => r !== null);

    // Collect all results
    const allResults: InstallResult[] = validResults.flatMap((r) => r.results);

    // Update lockfile and settings sequentially (after all installs complete)
    const now = new Date().toISOString();
    for (const { skillName, contentHash } of validResults) {
      // Derive origin from parsed source
      const origin = getOriginFromParsed(parsed);
      const lockEntry: LockEntry = {
        source: parsed.canonical,
        origin,
        folderHash: contentHash,
        installedAt: now,
        updatedAt: now,
      };

      yield* updateLockEntry(axmDir, skillName, lockEntry).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to update lockfile for ${skillName}: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );

      yield* updateSettings(axmDir, {
        skills: {
          [skillName]: "*",
        },
      }).pipe(
        Effect.mapError(
          (error) =>
            new InstallError({
              message: `Failed to update settings for ${skillName}: ${error.message}`,
              cause: error,
              retryable: false,
            }),
        ),
      );
    }

    return allResults;
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills install` command.
 *
 * Flow:
 * 1. Parse source string to determine type
 * 2. Ensure .axm/ is initialized
 * 3. Detect installed agents (or use --agent flag)
 * 4. Discover skills from source
 * 5. Select skills (interactive or via --skill/--all flags)
 * 6. Install skills to agent directories
 * 7. Update settings.json and axm-lock.yaml
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (
  args: InstallArgs,
): Effect.Effect<void, InstallError, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> => {
  const axmDir = getAxmDir(args.global);
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // Show intro
    p.intro(`axm skills install (${scopeLabel})`);

    // Create spinner helper (auto-detects TTY)
    const spinnerHelper = createSpinnerHelper();

    // Step 1: Parse source
    spinnerHelper.start("Parsing source...");
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
    spinnerHelper.stop(`Source: ${parsed.canonical} (${parsed.type})`);

    // Step 2: Ensure initialized
    spinnerHelper.start("Checking initialization...");
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
    spinnerHelper.stop("Initialized");

    // Step 3: Detect or select agents
    spinnerHelper.start("Detecting agents...");
    let agents: AgentConfig[];

    if (args.agent.length > 0) {
      // Use explicitly specified agents
      agents = args.agent
        .map((id) => getAgentById(id))
        .filter((a): a is AgentConfig => a !== undefined);

      if (agents.length !== args.agent.length) {
        const validIds = args.agent.filter((id) => getAgentById(id) !== undefined);
        const invalidIds = args.agent.filter((id) => getAgentById(id) === undefined);
        spinnerHelper.stop(`Found ${validIds.length} agent(s), ${invalidIds.length} invalid`);

        if (invalidIds.length > 0) {
          p.log.warn(`Unknown agents: ${invalidIds.join(", ")}`);
        }
      } else {
        spinnerHelper.stop(`Using ${agents.length} specified agent(s)`);
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
        spinnerHelper.stop("No agents detected");
        p.log.error("No AI coding agents detected. Use --agent to specify agents manually.");
        p.outro("No agents available.");
        return;
      }

      spinnerHelper.stop(`Found ${detectedAgents.length} agent(s)`);

      // Select agents (interactive or auto)
      if (args.yes || args.nonInteractive) {
        agents = detectedAgents;
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
      p.log.error("No agents selected.");
      p.outro("Nothing to do.");
      return;
    }

    // Step 4: Discover skills based on source type
    let skills: Skill[];
    let wellKnownSkills: WellKnownSkill[] | undefined;
    let commitSha: string | undefined;

    spinnerHelper.start("Discovering skills...");

    if (parsed.type === "local") {
      const result = yield* resolveLocalSource(parsed);
      skills = result.skills;
    } else if (parsed.type === "github" || parsed.type === "gitlab") {
      const result = yield* resolveGitSource(parsed, axmDir);
      skills = result.skills;
      commitSha = result.commitSha;
    } else if (parsed.type === "well-known") {
      const result = yield* resolveWellKnownSource(parsed);
      skills = result.skills;
      wellKnownSkills = result.wellKnownSkills;
    } else {
      spinnerHelper.stop("Unsupported source type");
      return yield* new InstallError({
        message: `Unsupported source type: ${parsed.type}`,
        retryable: false,
      });
    }

    if (skills.length === 0) {
      spinnerHelper.stop("No skills found");
      return yield* new InstallError({
        message: formatError(
          "No skills found in source",
          [`Source: ${parsed.canonical}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        retryable: false,
      });
    }

    spinnerHelper.stop(`Found ${skills.length} skill(s)`);

    // Step 5: List mode - just show skills and exit
    if (args.list) {
      p.log.info("Available skills:");
      for (const skill of skills) {
        const desc = skill.description ? ` - ${skill.description}` : "";
        p.log.message(`  ${skill.name}${desc}`);
      }
      p.outro(`${skills.length} skill(s) available`);
      return;
    }

    // Step 6: Select skills to install
    let selectedSkills: Skill[];

    if (args.skill.length > 0) {
      // Use explicitly specified skills
      selectedSkills = skills.filter((s) => args.skill.includes(s.name));
      const invalidSkills = args.skill.filter((name) => !skills.find((s) => s.name === name));

      if (invalidSkills.length > 0) {
        p.log.warn(`Unknown skills: ${invalidSkills.join(", ")}`);
      }
    } else if (args.all) {
      // Install all skills
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skill(s)`);
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
      selectedSkills = yield* promptMultiselect("Select skills to install", skills, {
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
    }

    if (selectedSkills.length === 0) {
      p.log.warn("No skills selected.");
      p.outro("Nothing to install.");
      return;
    }

    // Step 6b: Check for conflicts (skills already installed)
    const lockfile = yield* readLockfile(axmDir).pipe(
      Effect.mapError(
        (error) =>
          new InstallError({
            message: `Failed to read lockfile: ${error.message}`,
            cause: error,
            retryable: false,
          }),
      ),
    );

    const installedSkillNames = new Set(Object.keys(lockfile.extensions.skills));
    const conflictingSkills = selectedSkills.filter((s) => installedSkillNames.has(s.name));
    const newSkills = selectedSkills.filter((s) => !installedSkillNames.has(s.name));

    // Handle conflicts based on --force flag
    if (args.force) {
      // With --force, reinstall conflicting skills
      if (conflictingSkills.length > 0) {
        p.log.info(`Overwriting ${conflictingSkills.length} existing skill(s) (--force)`);
      }
      // Keep all selected skills (both new and conflicting)
    } else {
      // Without --force, warn and skip conflicting skills
      for (const skill of conflictingSkills) {
        p.log.warn(`Skill "${skill.name}" already installed. Skipping.`);
        p.log.message("  Use --force to overwrite.");
      }

      if (newSkills.length === 0) {
        p.log.info("All selected skills are already installed.");
        p.outro("Nothing to install.");
        return;
      }

      // Continue with only new skills
      selectedSkills = newSkills;

      if (conflictingSkills.length > 0) {
        p.log.info(
          `Installing ${newSkills.length} new skill(s), skipping ${conflictingSkills.length} existing`,
        );
      }
    }

    // Step 7: Confirm installation (unless --yes or --non-interactive)
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
      const confirmed = yield* promptConfirm(
        `Install ${selectedSkills.length} skill(s) to ${agents.length} agent(s)?`,
      ).pipe(
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

    // Step 8: Install skills
    spinnerHelper.start(
      `Installing ${selectedSkills.length} skill(s) to ${agents.length} agent(s)...`,
    );

    let results: InstallResult[];

    if (parsed.type === "well-known" && wellKnownSkills) {
      results = yield* installSkillsFromWellKnown(
        selectedSkills,
        wellKnownSkills,
        agents,
        axmDir,
        parsed,
      );
    } else {
      results = yield* installSkillsFromFileSystem(
        selectedSkills,
        agents,
        axmDir,
        parsed,
        commitSha,
      );
    }

    spinnerHelper.stop(`Installed ${results.length} skill(s)`);

    // Show results summary
    const byMethod = {
      symlink: results.filter((r) => r.method === "symlink").length,
      copy: results.filter((r) => r.method === "copy").length,
    };

    if (byMethod.symlink > 0) {
      p.log.info(`Created ${byMethod.symlink} symlink(s)`);
    }
    if (byMethod.copy > 0) {
      p.log.info(`Copied ${byMethod.copy} skill(s) (symlink fallback)`);
    }

    // List installed skills
    const uniqueSkillNames = [...new Set(results.map((r) => r.skillName))];
    for (const skillName of uniqueSkillNames) {
      const skillResults = results.filter((r) => r.skillName === skillName);
      const agentNames = skillResults
        .map((r) => {
          const agentId = agents.find(
            (a) =>
              r.agentPath.includes(a.detectPath) ||
              (a.skillsDir && r.agentPath.includes(a.skillsDir)),
          )?.name;
          return agentId ?? "unknown";
        })
        .join(", ");
      p.log.success(`${skillName} -> ${agentNames}`);
    }

    p.outro(
      `Successfully installed ${uniqueSkillNames.length} skill(s) to ${agents.length} agent(s)`,
    );
  });
};
