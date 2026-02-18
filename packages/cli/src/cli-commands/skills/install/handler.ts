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
  SourceHostProviders,
  parseInputPattern,
  registryGuard,
  type SkillExtensionRef,
} from "../../../sources/index.js";
import { resolveSkillInstallSource } from "./resolve-skill-install-source.js";
import { determineSkillsToInstall } from "./select-skills.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner, type LogService } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildSkillInstallPlan } from "./build-plan.js";
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

const listSkills = ({
  discoveredSkills,
  log,
}: {
  readonly discoveredSkills: ReadonlyArray<SkillExtensionRef>;
  readonly log: LogService;
}) =>
  Effect.gen(function* () {
    yield* log.info("Available skills:");
    yield* Effect.forEach(
      discoveredSkills,
      (ref) => {
        const desc = Option.match(ref.skill.description, {
          onNone: () => "",
          onSome: (d) => ` - ${d}`,
        });
        return log.message(`  ${ref.skill.name}${desc}`);
      },
      { discard: true },
    );
    yield* log.success(`${discoveredSkills.length} skill(s) available`);
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
 * 10. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstall = (args: InstallHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    const ws = yield* Workspace;
    const sources = yield* SourceHostProviders;
    // Get TUI services
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;

    // Show intro
    yield* log.info(`axm skills install (${scopeLabel})`);

    // Step 1: Parse source
    const parseHandle = yield* spinnerSvc.start("Parsing source...");
    const parsedSourceOption = parseInputPattern(args.source.trim());
    if (Option.isNone(parsedSourceOption)) {
      return yield* makeCliError({
        code: "INVALID_SOURCE",
        what: "Invalid source: Unable to parse source",
        details: [`Provided: ${args.source || "(empty)"}`],
        howToFix:
          "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
      });
    }
    const parsedSource = parsedSourceOption.value;
    const versionConstraint =
      parsedSource.pattern.pattern === "registry-pattern-input"
        ? parsedSource.pattern.versionConstraint
        : Option.none<string>();
    const source = yield* resolveSkillInstallSource(parsedSource).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "INVALID_SOURCE",
          what: `Invalid source: ${error.message}`,
          details: [`Provided: ${args.source || "(empty)"}`],
          howToFix:
            "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
          cause: error,
        }),
      ),
    );
    yield* parseHandle.stop(`Source: ${sources.origin(source)} (${source.type})`);

    // Step 2: Registry guard — ensure a registry source is configured
    if (source.type === "registry") {
      yield* registryGuard;
    }

    // Step 3: Discover skills from source via SourceHostProviders
    const discoverHandle = yield* spinnerSvc.start("Discovering skills...");
    // Determine requested skill filters in priority order:
    // 1) explicit positional names (`args.skills`) for all source types
    // 2) parsed single name from registry-pattern input (e.g. @scope/skills/name)
    // 3) none (discover all)
    const requestedSkills: ReadonlyArray<string> =
      args.skills.length > 0
        ? args.skills
        : parsedSource.pattern.pattern === "registry-pattern-input"
          ? Option.isSome(parsedSource.pattern.name)
            ? [parsedSource.pattern.name.value]
            : []
          : [];

    /*
    TODO: what about registry sources? If user provided a scope, should we filter by that?
    */
    const discoveredSkills = yield* sources
      .find(source, {
        skillNames: requestedSkills,
        type: "skill" as const,
        versionConstraint,
      })
      .pipe(
        Effect.map(Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
        Effect.mapError((error) =>
          makeCliError({
            code: "DISCOVER_FAILED",
            what: `Failed to discover skills: ${error.message}`,
            details: [`Source: ${sources.origin(source)}`],
            howToFix: "Verify the source path contains directories with SKILL.md files.",
            cause: error,
          }),
        ),
        Effect.tapError(() => discoverHandle.stop("Failed")),
      );
    if (!Array.isNonEmptyReadonlyArray(discoveredSkills)) {
      yield* discoverHandle.stop("No skills found");
      return yield* Effect.fail(
        makeCliError({
          code: "NO_SKILLS_FOUND",
          what: "No skills found in source",
          details: [`Source: ${sources.origin(source)}`],
          howToFix: "Verify the source path contains directories with SKILL.md files.",
        }),
      );
    }
    yield* discoverHandle.stop(`Found ${discoveredSkills.length} skill(s)`);

    // Step 6: List mode -> display and exit
    if (args.list) {
      yield* listSkills({ discoveredSkills, log });
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

    const plan = yield* buildSkillInstallPlan({
      selectedSkills,
      source,
      force: args.force,
      versionConstraint,
    });

    yield* ws.resolvePlan(plan, { "install-skill": installSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Install.handle"));
};
