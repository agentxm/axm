/**
 * Lint-run policy over workspace settings and roots: where a lint run is
 * anchored, which configured rule overrides apply, which repairs are already
 * determined by authoritative local state, and how staged-snapshot paths map
 * back to the workspace the user named. The CLI keeps argument parsing,
 * rendering, and exit mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { reconcileInstructionTargets, resolveInstructionsConfig } from "../../projection/index.js";
import type { LintConfig } from "@agentxm/extension-content/lint";
import { composePath } from "@agentxm/extension-content/lint";
import type { Settings } from "../../desired-state/index.js";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import type { LintSummary } from "../runner.js";

export type PathRemapper = Pick<Path.Path, "isAbsolute" | "join" | "relative">;

const remapAbsolutePath = (
  value: string,
  sourceRoot: string,
  displayRoot: string,
  path: PathRemapper,
): string => {
  if (!path.isAbsolute(value)) return value;
  const relative = path.relative(sourceRoot, value);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return value;
  return relative === "" ? displayRoot : path.join(displayRoot, relative);
};

/** Replace temporary staged-snapshot roots without changing lint semantics. */
export const remapLintSummaryPaths = (
  summary: LintSummary,
  sourceRoot: string,
  displayRoot: string,
  path: PathRemapper,
): LintSummary => ({
  ...summary,
  findings: summary.findings.map((entry) => {
    const remappedDisplayRoot = remapAbsolutePath(entry.displayRoot, sourceRoot, displayRoot, path);
    const location = entry.finding.location;
    const remappedLocation =
      location === undefined
        ? undefined
        : {
            ...location,
            file: remapAbsolutePath(location.file, sourceRoot, displayRoot, path),
          };
    return {
      ...entry,
      displayRoot: remappedDisplayRoot,
      path: composePath(remappedDisplayRoot, remappedLocation),
      finding:
        remappedLocation === undefined
          ? entry.finding
          : { ...entry.finding, location: remappedLocation },
    };
  }),
});

/**
 * Resolve the workspace root for a lint run.
 *
 * - `--scope=project` (default): use the optional `<path>` argument if
 *   provided, otherwise the caller-supplied `cwd`.
 * - `--scope=user`: use the resolved user home; the read model locates its
 *   `.axm/workspace/` workspace. Ignores `<path>`.
 *
 * XDG layout: v1 honors `AXM_USER_HOME` as an override; full
 * `XDG_DATA_HOME`/`XDG_CONFIG_HOME` integration is deferred to a follow-up
 * (see design doc §10 Open Items #10).
 */
export const resolveLintRoot = (args: {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly cwd: string;
  readonly userHome: string;
}): string => {
  if (args.scope === "user") {
    return args.userHome;
  }
  return Option.match(args.pathArg, {
    onNone: () => args.cwd,
    onSome: (p) => p,
  });
};

export const lintConfigFromSettings = (settings: Option.Option<Settings>): LintConfig =>
  Option.match(settings, {
    onNone: () => ({}),
    onSome: (s) => s.lint ?? {},
  });

/**
 * Apply the repairs whose desired state is already determined by authoritative
 * local state. Instruction targets are content-derived from their canonical
 * source, so regenerating them expresses no preference.
 *
 * This delegates to the same reconciliation `axm sync` performs rather than
 * defining a second desired state. A workspace that has not enabled
 * instruction-file management has nothing determined to restore, so `--fix`
 * leaves it untouched.
 */
export const DETERMINED_REPAIR_RULE_IDS = [
  "workspace/instructions-target-current",
  "workspace/instructions-target-stale",
] as const;

export const applyDeterminedRepairs = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly settings: Option.Option<Settings>;
}) =>
  Effect.gen(function* () {
    const none: ReadonlyArray<string> = [];
    if (Option.isNone(args.settings)) return none;
    const instructionFiles = args.settings.value.instructionFiles;
    if (instructionFiles === undefined || instructionFiles === false) return none;
    yield* reconcileInstructionTargets({
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      configuredAgents: args.settings.value.agents ?? [],
      config: resolveInstructionsConfig(instructionFiles),
    });
    return DETERMINED_REPAIR_RULE_IDS;
  });
