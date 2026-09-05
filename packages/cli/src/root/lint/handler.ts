/**
 * `axm lint` handler.
 *
 * Thin surface over {@link runLint}. Responsibilities:
 *
 * 1. Resolve workspace root + scope (project: cwd (or `<path>`), user:
 *    `$AXM_USER_HOME` or `$HOME`, ignoring `<path>`).
 * 2. Load project-root `axm.json` or user-workspace `.axm/workspace/axm.json` (if
 *    present) to recover the configured `lint.rules` overrides.
 * 3. Build a `LintWorkspace` (rule context + flat projection) from the
 *    workspace read model, then assemble workspace / skill / pack rule
 *    contexts via the shared-kernel builders.
 * 4. Evaluate and render the current workspace facts.
 * 5. Emit human text / JSON output through the CLI renderer and translate
 *    the lint exit category into a process exit code.
 *
 * The lint runner primitives live in `@agentxm/workspace-lint` so the handler
 * stays a thin surface.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExitCode, makeAppError } from "../../app-error/index.js";
import { Screen } from "../../screen/index.js";
import { Verbosity } from "../../cli-flags/index.js";
import { effectCliExit } from "../../cli-runtime/index.js";
import { WorkspaceInvariantFacts, observeAgentOutputs } from "@agentxm/extension-workspace";
import { AxmSkillCompatibilityPolicy } from "@agentxm/extension-workspace";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import { inspectWorkspaceOwnership } from "@agentxm/workspace-sync";
import { syncFailureToAppError } from "../../feature-errors.js";
import {
  applyDeterminedRepairs,
  buildLintWorkspace,
  lintConfigFromSettings,
  loadSettingsDocument,
  remapLintSummaryPaths,
  resolveLintRoot,
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
  LintJsonDocumentSchema,
  type LintJsonDocument,
  type LintInput,
  type LintSummary,
} from "@agentxm/workspace-lint";
import { buildPackRuleContexts } from "@agentxm/registry-protocol/unstable/lint/catalog/pack-accessor/contexts";
import { buildSkillRuleContexts } from "@agentxm/registry-protocol/unstable/lint/catalog/skill-accessor/contexts";
import {
  WorkspaceMutations,
  resolveUserHome,
  acceptedCanonicalObservation,
} from "@agentxm/workspace-state";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import * as os from "node:os";
import { ExecutionDirectory } from "../../execution-directory.js";
import { toAppError } from "../../app-error/conversions.js";
import { lintView } from "./view.js";

// -----------------------------------------------------------------------------
// Handler args
// -----------------------------------------------------------------------------

export interface HandleLintArgs {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly strict: boolean;
  readonly details: boolean;
  /** Apply repairs whose desired state is already determined, then report. */
  readonly fix: boolean;
  readonly input: LintInput;
  readonly displayWorkspaceRoot?: string;
}

/**
 * Effectful wrapper around {@link resolveLintRoot}. The CLI handler calls this
 * once at entry.
 */
const resolveLintRootEffect = (args: {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
}) =>
  Effect.gen(function* () {
    const executionDirectory = yield* ExecutionDirectory;
    const userHome = yield* resolveUserHome();
    return resolveLintRoot({
      pathArg: args.pathArg,
      scope: args.scope,
      cwd: executionDirectory.path,
      userHome,
    });
  });

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

const LintJsonDocumentFields = {
  result: LintJsonDocumentSchema,
} satisfies Schema.Struct.Fields;
export const LintResultDocumentSchema = Schema.Struct(LintJsonDocumentFields);
export type LintResultDocument = typeof LintResultDocumentSchema.Type;

const emitJsonDocument = (doc: LintJsonDocument, ok: boolean) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    return yield* screen.document({ result: doc }, LintResultDocumentSchema, { ok });
  });

const emitHumanOutput = (args: { readonly summary: LintSummary; readonly details: boolean }) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const blocks = toLintHumanBlocks({
      summary: args.summary,
      reporter: args.details ? "full" : "grouped",
    });
    const verbosity = yield* Verbosity;
    yield* Effect.forEach(
      lintView(blocks, verbosity.level),
      (entry) => (entry.channel === "result" ? screen.result(entry.doc) : screen.note(entry.doc)),
      { discard: true },
    );
  });

// -----------------------------------------------------------------------------
// Handler entry point
// -----------------------------------------------------------------------------

export const handleLint = Effect.fn("Lint.handle")(function* (args: HandleLintArgs) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const axmSkillCompatibilityPolicy = yield* AxmSkillCompatibilityPolicy;
  const ws = yield* WorkspaceMutations;
  const agentRepo = yield* CodingAgentRepository;
  const workspaceRoot = yield* resolveLintRootEffect({
    pathArg: args.pathArg,
    scope: args.scope,
  });

  // -- Load settings + lockfile + config --
  const settings = yield* loadSettingsDocument(workspaceRoot, args.scope);

  // -- Repair before observing, so the report reflects the reconciled state --
  if (args.fix) {
    yield* applyDeterminedRepairs({ workspaceRoot, scope: args.scope, settings }).pipe(
      Effect.mapError(toAppError),
    );
  }

  const config = lintConfigFromSettings(settings);

  // -- Build WorkspaceReadModel-backed rule contexts --
  const userHome = args.scope === "user" ? workspaceRoot : yield* Effect.sync(() => os.homedir());
  const invariantFacts = yield* WorkspaceInvariantFacts;
  const { rule: workspaceContext, view } = yield* buildLintWorkspace({
    platform: { fs, path },
    workspaceRoot,
    userHome,
    scope: args.scope,
    gitIndexView: args.input.view === "git-index",
    axmSkillCompatibilityPolicy,
    owner: ws
      .getConfiguredOwner()
      .pipe(Effect.mapError(toAppError))
      .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
    projections: {
      facts: invariantFacts.projectionFacts,
    },
  }).pipe(
    Effect.catchTag("WorkspaceRootEscape", (e) =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Workspace root '${e.workspaceRoot}' escapes allowed root '${e.allowedRoot}'`,
        }),
      ),
    ),
    Effect.mapError(toAppError),
  );
  const skillContexts = buildSkillRuleContexts(view);
  const packContexts = buildPackRuleContexts(view);
  const canonicalObservations = Effect.gen(function* () {
    const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
    return yield* Effect.forEach(
      graph.nodes,
      (node) =>
        Effect.gen(function* () {
          const accepted = yield* acceptedCanonicalObservation({
            workspace: ws,
            type: node.type,
            name: node.name,
          }).pipe(Effect.mapError(toAppError));
          if (Option.isNone(accepted)) {
            return yield* makeAppError({
              code: "internal",
              detail: `Desired extension disappeared while linting: ${node.type}:${node.name}`,
            });
          }
          return { desired: node, observation: accepted.value.observation };
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      { concurrency: 16 },
    );
  });
  const ownershipIssues = yield* inspectWorkspaceOwnership().pipe(
    Effect.mapError(syncFailureToAppError),
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.provideService(WorkspaceMutations, ws),
    Effect.provideService(CodingAgentRepository, agentRepo),
  );
  const desiredGraph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError));
  const enabledNames = (extensionType: "skill" | "subagent" | "mcp-server" | "hook") =>
    new Set(
      desiredGraph.nodes
        .filter((node) => node.enabled && node.type === extensionType)
        .map(({ name }) => name),
    );
  const expectedSubagentNames = enabledNames("subagent");
  const desiredAgentIds = new Set(
    (yield* agentRepo.getMaterializationAgents()).map(({ id }) => id),
  );
  const agentOutputs = yield* observeAgentOutputs({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    desiredAgentIds,
    expectedNames: {
      skill: new Set([...enabledNames("skill"), ...expectedSubagentNames]),
      subagent: expectedSubagentNames,
      "mcp-server": enabledNames("mcp-server"),
      hook: enabledNames("hook"),
    },
    skillOwnershipRoots:
      ws.layout.scope === "project"
        ? [ws.layout.acquiredRoot, ws.layout.authoredRoot("skill")]
        : [ws.layout.acquiredRoot],
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.provideService(CodingAgentRepository, agentRepo),
  );
  const workspaceHealthContext = {
    ...workspaceContext,
    ownership: Effect.succeed(ownershipIssues),
    agentOutputs: Effect.succeed(agentOutputs),
    health: {
      desiredState: ws.getDesiredStateGraph().pipe(Effect.mapError(toAppError)),
      canonicalObservations,
    },
  };

  // -- Evaluate --
  const evaluations = yield* evaluateAllCatalogs({
    view: args.input.view,
    contexts: {
      skill: skillContexts,
      pack: packContexts,
      subagent: view.subagentContexts,
      "mcp-server": view.mcpServerContexts,
      rule: view.ruleContexts,
      hook: view.hookContexts,
      knowledge: view.knowledgeContexts,
      workspace: [workspaceHealthContext],
    },
    config,
  });
  const rawSummary = summarizeEvaluations(evaluations, config);
  const summary =
    args.displayWorkspaceRoot === undefined
      ? rawSummary
      : remapLintSummaryPaths(rawSummary, workspaceRoot, args.displayWorkspaceRoot, path);
  const axmSkillCompatibility =
    workspaceContext.axmSkillCompatibility === undefined
      ? undefined
      : Option.getOrUndefined(
          Option.flatten(yield* workspaceContext.axmSkillCompatibility.pipe(Effect.option)),
        );

  // -- Resolve the semantic outcome before emitting the machine document so
  // its `ok` field and the eventual process exit code cannot disagree. --
  const category = summary.exitCategory;
  const outcome = resolveLintExitCategory({ category, strict: args.strict });
  const ok = outcome !== "fail";

  // -- Emit output --
  const handledByMachine = yield* emitJsonDocument(
    toLintJsonDocument({
      summary,
      input: args.input,
      ...(axmSkillCompatibility === undefined ? {} : { axmSkillCompatibility }),
    }),
    ok,
  );
  if (!handledByMachine) {
    yield* emitHumanOutput({
      summary,
      details: args.details,
    });
  }

  // -- Translate exit category into exit code --
  if (outcome === "fail") {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});
