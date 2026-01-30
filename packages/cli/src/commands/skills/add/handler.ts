/**
 * Add command handler - Effect-based orchestration for `axm skills add`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as os from "node:os";
import * as nodePath from "node:path";
import {
  type AgentConfig,
  cloneRepo,
  computeContentHash,
  detectAgents,
  discoverSkills,
  ensureInitialized,
  fetchSkillFiles,
  fetchWellKnownIndex,
  getAgentById,
  getCurrentCommit,
  type InstallResult,
  installSkillToAgents,
  type LockEntry,
  type ParsedSource,
  parseSource,
  type Skill,
  updateLockEntry,
  updateSettings,
  type WellKnownSkill,
} from "@agentxm/core/experimental/skills";
import * as p from "@clack/prompts";
import type { FileSystem, HttpClient, Path } from "@effect/platform";
import { Data, Effect, pipe } from "effect";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the add command.
 */
export interface AddArgs {
  /** Source to add skills from */
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
 * Error that occurs during skill addition.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class AddError extends Data.TaggedError("AddError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Determines the .axm directory path based on global flag.
 */
const getAxmDir = (global: boolean): string =>
  global ? nodePath.join(os.homedir(), ".axm") : nodePath.join(process.cwd(), ".axm");

/**
 * Builds the Git clone URL for GitHub/GitLab sources.
 */
const buildCloneUrl = (parsed: ParsedSource): string => {
  if (parsed.type === "github") {
    return `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  }
  if (parsed.type === "gitlab") {
    return `https://gitlab.com/${parsed.owner}/${parsed.repo}.git`;
  }
  throw new Error(`Cannot build clone URL for source type: ${parsed.type}`);
};

/**
 * Wraps @clack/prompts multiselect in an Effect for agent selection.
 */
const promptAgentSelection = (agents: readonly AgentConfig[]): Effect.Effect<string[], AddError> =>
  Effect.tryPromise({
    try: async () => {
      const options = agents.map((a) => {
        const opt: { value: string; label: string; hint?: string } = {
          value: a.id,
          label: a.name,
        };
        if (a.skillsDir) {
          opt.hint = `skills: ${a.skillsDir}`;
        }
        return opt;
      });

      const result = await p.multiselect({
        message: "Select agents to install skills for",
        options,
        initialValues: agents.map((a) => a.id),
        required: true,
      });

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      return result as string[];
    },
    catch: (error) =>
      new AddError({
        message: "Failed to prompt for agent selection",
        cause: error,
      }),
  });

/**
 * Wraps @clack/prompts multiselect in an Effect for skill selection.
 */
const promptSkillSelection = (skills: readonly Skill[]): Effect.Effect<string[], AddError> =>
  Effect.tryPromise({
    try: async () => {
      const options = skills.map((s) => {
        const opt: { value: string; label: string; hint?: string } = {
          value: s.name,
          label: s.name,
        };
        if (s.description) {
          opt.hint = s.description;
        }
        return opt;
      });

      const result = await p.multiselect({
        message: "Select skills to install",
        options,
        initialValues: skills.map((s) => s.name),
        required: true,
      });

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      return result as string[];
    },
    catch: (error) =>
      new AddError({
        message: "Failed to prompt for skill selection",
        cause: error,
      }),
  });

/**
 * Wraps @clack/prompts confirm in an Effect for installation confirmation.
 */
const promptConfirmInstall = (
  skillCount: number,
  agentCount: number,
): Effect.Effect<boolean, AddError> =>
  Effect.tryPromise({
    try: async () => {
      const result = await p.confirm({
        message: `Install ${skillCount} skill(s) to ${agentCount} agent(s)?`,
        initialValue: true,
      });

      if (p.isCancel(result)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      return result;
    },
    catch: (error) =>
      new AddError({
        message: "Failed to prompt for confirmation",
        cause: error,
      }),
  });

// -----------------------------------------------------------------------------
// Source Resolution
// -----------------------------------------------------------------------------

/**
 * Resolves skills from a local path source.
 */
const resolveLocalSource = (
  parsed: ParsedSource,
): Effect.Effect<{ skills: Skill[]; skillsDir: string }, AddError, FileSystem.FileSystem> =>
  pipe(
    discoverSkills(parsed.canonical),
    Effect.map((skills) => ({
      skills,
      skillsDir: parsed.canonical,
    })),
    Effect.mapError(
      (error) =>
        new AddError({
          message: `Failed to discover skills in ${parsed.canonical}: ${error.message}`,
          cause: error,
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
  AddError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const cloneUrl = buildCloneUrl(parsed);
    const cacheDir = nodePath.join(axmDir, "cache", "git", `${parsed.owner}-${parsed.repo}`);

    // Clone repository
    yield* cloneRepo(cloneUrl, cacheDir, parsed.ref).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Failed to clone repository: ${error.message}`,
            cause: error,
          }),
      ),
    );

    // Get current commit SHA
    const commitSha = yield* getCurrentCommit(cacheDir).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Failed to get commit SHA: ${error.message}`,
            cause: error,
          }),
      ),
    );

    // Determine skills directory (with optional subpath)
    const skillsDir = parsed.path ? nodePath.join(cacheDir, parsed.path) : cacheDir;

    // Discover skills
    const skills = yield* discoverSkills(skillsDir).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Failed to discover skills in ${skillsDir}: ${error.message}`,
            cause: error,
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
  AddError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const baseUrl = parsed.url ?? parsed.canonical;

    // Fetch the well-known index
    const index = yield* fetchWellKnownIndex(baseUrl).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Failed to fetch well-known index from ${baseUrl}: ${error.message}`,
            cause: error,
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
 * Installs skills from a local or git source.
 */
const installSkillsFromFileSystem = (
  skills: Skill[],
  agents: AgentConfig[],
  axmDir: string,
  parsed: ParsedSource,
  commitSha?: string,
): Effect.Effect<InstallResult[], AddError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const results: InstallResult[] = [];

    for (const skill of skills) {
      // Install skill to all agents
      const installResults = yield* installSkillToAgents(skill, agents, axmDir).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to install skill ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      results.push(...installResults);

      // Compute content hash for lockfile
      const canonicalSkillPath = nodePath.join(axmDir, "skills", skill.name);
      const contentHash = yield* computeContentHash(canonicalSkillPath).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to compute content hash for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Update lockfile
      const now = new Date().toISOString();
      const lockEntry: LockEntry = {
        source: parsed.canonical,
        skillPath: skill.path,
        ...(commitSha !== undefined ? { commitSha } : {}),
        contentHash,
        installedAt: now,
        updatedAt: now,
      };

      yield* updateLockEntry(axmDir, skill.name, lockEntry).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to update lockfile for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Update settings
      yield* updateSettings(axmDir, {
        skills: {
          [skill.name]: {
            source: parsed.canonical,
            agents: agents.map((a) => a.id),
          },
        },
      }).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to update settings for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );
    }

    return results;
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
  AddError,
  FileSystem.FileSystem | HttpClient.HttpClient | Path.Path
> =>
  Effect.gen(function* () {
    const baseUrl = parsed.url ?? parsed.canonical;
    const results: InstallResult[] = [];

    for (const skill of skills) {
      // Find the corresponding well-known skill
      const wkSkill = wellKnownSkills.find((wk) => wk.name === skill.name);
      if (!wkSkill) {
        continue;
      }

      // Fetch skill files to cache
      const cacheDir = nodePath.join(axmDir, "cache", "wellknown", skill.name);
      const fetchedSkill = yield* fetchSkillFiles(baseUrl, wkSkill, cacheDir).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to fetch skill ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Install skill to all agents
      const installResults = yield* installSkillToAgents(fetchedSkill, agents, axmDir).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to install skill ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      results.push(...installResults);

      // Compute content hash for lockfile
      const canonicalSkillPath = nodePath.join(axmDir, "skills", skill.name);
      const contentHash = yield* computeContentHash(canonicalSkillPath).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to compute content hash for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Update lockfile
      const now = new Date().toISOString();
      const lockEntry: LockEntry = {
        source: parsed.canonical,
        skillPath: fetchedSkill.path,
        contentHash,
        installedAt: now,
        updatedAt: now,
      };

      yield* updateLockEntry(axmDir, skill.name, lockEntry).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to update lockfile for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );

      // Update settings
      yield* updateSettings(axmDir, {
        skills: {
          [skill.name]: {
            source: parsed.canonical,
            agents: agents.map((a) => a.id),
          },
        },
      }).pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to update settings for ${skill.name}: ${error.message}`,
              cause: error,
            }),
        ),
      );
    }

    return results;
  });

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills add` command.
 *
 * Flow:
 * 1. Parse source string to determine type
 * 2. Ensure .axm/ is initialized
 * 3. Detect installed agents (or use --agent flag)
 * 4. Discover skills from source
 * 5. Select skills (interactive or via --skill/--all flags)
 * 6. Install skills to agent directories
 * 7. Update settings.json and axm.lock
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleAdd = (
  args: AddArgs,
): Effect.Effect<void, AddError, FileSystem.FileSystem | HttpClient.HttpClient | Path.Path> => {
  const axmDir = getAxmDir(args.global);
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    // Show intro
    p.intro(`axm skills add (${scopeLabel})`);

    const spinner = p.spinner();

    // Step 1: Parse source
    spinner.start("Parsing source...");
    const parsed = yield* parseSource(args.source).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Invalid source: ${error.message}`,
            cause: error,
          }),
      ),
    );
    spinner.stop(`Source: ${parsed.canonical} (${parsed.type})`);

    // Step 2: Ensure initialized
    spinner.start("Checking initialization...");
    yield* ensureInitialized({ axmDir }).pipe(
      Effect.mapError(
        (error) =>
          new AddError({
            message: `Failed to initialize: ${error.message}`,
            cause: error,
          }),
      ),
    );
    spinner.stop("Initialized");

    // Step 3: Detect or select agents
    spinner.start("Detecting agents...");
    let agents: AgentConfig[];

    if (args.agent.length > 0) {
      // Use explicitly specified agents
      agents = args.agent
        .map((id) => getAgentById(id))
        .filter((a): a is AgentConfig => a !== undefined);

      if (agents.length !== args.agent.length) {
        const validIds = args.agent.filter((id) => getAgentById(id) !== undefined);
        const invalidIds = args.agent.filter((id) => getAgentById(id) === undefined);
        spinner.stop(`Found ${validIds.length} agent(s), ${invalidIds.length} invalid`);

        if (invalidIds.length > 0) {
          p.log.warn(`Unknown agents: ${invalidIds.join(", ")}`);
        }
      } else {
        spinner.stop(`Using ${agents.length} specified agent(s)`);
      }
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents().pipe(
        Effect.mapError(
          (error) =>
            new AddError({
              message: `Failed to detect agents: ${error.message}`,
              cause: error,
            }),
        ),
      );

      if (detectedAgents.length === 0) {
        spinner.stop("No agents detected");
        p.log.error("No AI coding agents detected. Use --agent to specify agents manually.");
        p.outro("No agents available.");
        return;
      }

      spinner.stop(`Found ${detectedAgents.length} agent(s)`);

      // Select agents (interactive or auto)
      if (args.yes) {
        agents = detectedAgents;
        p.log.info(`Auto-selecting all detected agents: ${agents.map((a) => a.name).join(", ")}`);
      } else {
        const selectedIds = yield* promptAgentSelection(detectedAgents);
        agents = detectedAgents.filter((a) => selectedIds.includes(a.id));
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

    spinner.start("Discovering skills...");

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
      spinner.stop("Unsupported source type");
      return yield* Effect.fail(
        new AddError({
          message: `Unsupported source type: ${parsed.type}`,
        }),
      );
    }

    if (skills.length === 0) {
      spinner.stop("No skills found");
      p.log.warn("No SKILL.md files found in the source.");
      p.outro("Nothing to install.");
      return;
    }

    spinner.stop(`Found ${skills.length} skill(s)`);

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
    } else {
      // Interactive selection
      const selectedNames = yield* promptSkillSelection(skills);
      selectedSkills = skills.filter((s) => selectedNames.includes(s.name));
    }

    if (selectedSkills.length === 0) {
      p.log.warn("No skills selected.");
      p.outro("Nothing to install.");
      return;
    }

    // Step 7: Confirm installation (unless --yes)
    if (!args.yes) {
      const confirmed = yield* promptConfirmInstall(selectedSkills.length, agents.length);
      if (!confirmed) {
        p.cancel("Installation cancelled.");
        return;
      }
    }

    // Step 8: Install skills
    spinner.start(`Installing ${selectedSkills.length} skill(s) to ${agents.length} agent(s)...`);

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

    spinner.stop(`Installed ${results.length} skill(s)`);

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
