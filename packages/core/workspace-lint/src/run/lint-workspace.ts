/**
 * Linting a workspace: admitting the request, gathering the facts every rule
 * catalog decides against, and reporting what the workspace actually is.
 *
 * Lint answers one question — is this workspace's state coherent — and it
 * answers it from facts, not from a plan. The facts come from the workspace
 * read model, the shared projection capability, and the content rule
 * catalogs; assembling them here rather than in an adapter is what makes the
 * answer the same however lint is invoked. In particular the reconciliation
 * facts (ownership proofs and realized agent outputs) come from
 * `@agentxm/workspace-projection`, the capability the reconciliation feature
 * also reads them from, so lint and sync cannot disagree about what AXM owns.
 *
 * Two decisions about lint's inputs live here because they are decisions
 * about what lint can honestly report, not about flag grammar: repairing
 * determined state means writing to the working tree, so it cannot be
 * combined with a Git-index view that is a snapshot of something else; and a
 * Git index is a property of a repository, so it cannot be combined with the
 * user scope.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { buildPackRuleContexts, buildSkillRuleContexts } from "@agentxm/extension-content/lint";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { AxmSkillCompatibilityPolicy } from "@agentxm/cli-maintenance/official-skill/application";
import {
  CodingAgentRepository,
  WorkspaceInvariantFacts,
  expectedProjectionNames,
  observeAgentOutputs,
  observeWorkspaceOwnershipIssues,
} from "@agentxm/workspace-projection";
import {
  WorkspaceMutations,
  acceptedCanonicalObservation,
  type CanonicalObservation,
  type DesiredExtensionNode,
} from "@agentxm/workspace-state";

import { buildLintWorkspace } from "../catalog/index.js";
import type { WorkspaceHealthFailure } from "../workspace-context.js";
import type { LintView } from "../catalog-contexts.js";
import {
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintJsonDocument,
  type LintExitCategory,
  type LintSummary,
} from "../cli.js";
import type { LintInput, LintJsonDocument } from "../json-schema.js";
import { LintStagingFailed } from "./errors.js";
import {
  applyDeterminedRepairs,
  lintConfigFromSettings,
  loadSettingsDocument,
  remapLintSummaryPaths,
  resolveLintRoot,
} from "./settings.js";
import { materializeGitIndexWorkspace } from "./staged-workspace.js";

// -----------------------------------------------------------------------------
// Admission
// -----------------------------------------------------------------------------

export interface LintWorkspaceRequest {
  /** An explicit workspace directory to lint; the working directory otherwise. */
  readonly path?: string;
  readonly scope: WorkspaceScope;
  readonly view: LintView;
  /** Repair the state whose desired value is already determined, then report. */
  readonly fix: boolean;
  readonly cwd: string;
  readonly userHome: string;
}

/**
 * The workspace lint will read, and the view it reads it through. For a
 * Git-index run this names the materialized snapshot rather than the working
 * tree, together with the root findings are reported against.
 */
export interface LintSelection {
  readonly workspaceRoot: string;
  /** The home the alternate scope's root is validated against. */
  readonly userHome: string;
  readonly scope: WorkspaceScope;
  readonly input: LintInput;
  /** The root findings are reported against, when it differs from the one read. */
  readonly displayWorkspaceRoot?: string;
  readonly fix: boolean;
}

/**
 * Admit a lint request: refuse the input combinations lint cannot honestly
 * answer, and materialize the Git index when that is the selected view.
 */
export const admitLintRequest = (request: LintWorkspaceRequest) =>
  Effect.gen(function* () {
    if (request.fix && request.view === "git-index") {
      return yield* new LintStagingFailed({
        category: "validation",
        detail:
          "--fix cannot be combined with --view git-index because the index snapshot is not the working tree",
      });
    }
    if (request.view === "git-index" && request.scope === "user") {
      return yield* new LintStagingFailed({
        category: "validation",
        detail:
          "--view git-index cannot be combined with --scope user because Git indexes are project-scoped",
      });
    }

    if (request.view === "git-index") {
      const snapshot = yield* materializeGitIndexWorkspace(request.path ?? request.cwd, {
        selectRepositoryRoot: request.path === undefined,
      });
      return {
        workspaceRoot: snapshot.workspaceRoot,
        userHome: request.userHome,
        scope: "project",
        input: { view: "git-index", fingerprint: snapshot.fingerprint },
        displayWorkspaceRoot: snapshot.displayWorkspaceRoot,
        fix: false,
      } satisfies LintSelection;
    }

    return {
      workspaceRoot: resolveLintRoot({
        pathArg: request.path === undefined ? Option.none() : Option.some(request.path),
        scope: request.scope,
        cwd: request.cwd,
        userHome: request.userHome,
      }),
      userHome: request.userHome,
      scope: request.scope,
      input: { view: "workspace" },
      fix: request.fix,
    } satisfies LintSelection;
  });

/** The absolute root a selection names, for the workspace layer the run needs. */
export const lintSelectionRoot = (selection: LintSelection) =>
  decodeAbsolutePathSync(selection.workspaceRoot);

// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------

export interface LintWorkspaceResult {
  /** The machine document: findings, counts, input, and compatibility state. */
  readonly document: LintJsonDocument;
  readonly summary: LintSummary;
  /** The severity verdict before any process mapping. */
  readonly exitCategory: LintExitCategory;
  /** Whether this run passes, under the run's strictness. */
  readonly outcome: "success" | "fail";
}

/** Every service a lint run reads the workspace and its projections through. */
export type LintWorkspaceRequirements =
  | AxmSkillCompatibilityPolicy
  | CodingAgentRepository
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceInvariantFacts
  | WorkspaceMutations;

/** Every failure a lint run can settle into. */
export type LintWorkspaceFailure =
  | LintStagingFailed
  | Effect.Error<ReturnType<typeof buildLintWorkspace>>
  | Effect.Error<ReturnType<typeof acceptedCanonicalObservation>>
  | Effect.Error<ReturnType<typeof applyDeterminedRepairs>>;

const runLint = (selection: LintSelection, options: { readonly strict: boolean }) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspace = yield* WorkspaceMutations;
    const agentRepository = yield* CodingAgentRepository;
    const axmSkillCompatibilityPolicy = yield* AxmSkillCompatibilityPolicy;
    const invariantFacts = yield* WorkspaceInvariantFacts;
    const settings = yield* loadSettingsDocument(selection.workspaceRoot, selection.scope);

    // Repair before observing, so the report reflects the reconciled state.
    if (selection.fix) {
      yield* applyDeterminedRepairs({
        workspaceRoot: selection.workspaceRoot,
        scope: selection.scope,
        settings,
      });
    }

    const config = lintConfigFromSettings(settings);
    const userHome = selection.scope === "user" ? selection.workspaceRoot : selection.userHome;
    const { rule: workspaceContext, view } = yield* buildLintWorkspace({
      platform: { fs: fileSystem, path },
      workspaceRoot: selection.workspaceRoot,
      userHome,
      scope: selection.scope,
      gitIndexView: selection.input.view === "git-index",
      axmSkillCompatibilityPolicy,
      owner: workspace.getConfiguredOwner().pipe(Effect.catch(() => Effect.succeed(Option.none()))),
      projections: { facts: invariantFacts.projectionFacts },
    });

    // Reconciliation facts: what AXM owns, and what it realized for the agents
    // this workspace configures. Both come from the shared projection
    // capability, never from the reconciliation feature.
    const configuredAgents = yield* workspace.getConfiguredAgents();
    const skillOwnershipRoots =
      workspace.layout.scope === "project"
        ? [workspace.layout.acquiredRoot, workspace.layout.authoredRoot("skill")]
        : [workspace.layout.acquiredRoot];
    const authoredSkills = {
      layout: workspace.layout,
      entries: Option.isSome(settings) ? (settings.value.skills ?? {}) : {},
    };
    const ownership = yield* observeWorkspaceOwnershipIssues({
      workspaceRoot: workspace.baseDir,
      scope: workspace.scope,
      configuredAgentIds: new Set(configuredAgents),
      skillOwnershipRoots,
      authoredSkills,
    });
    const desiredGraph = yield* workspace.getDesiredStateGraph();
    const materializationAgentIds = new Set(
      (yield* agentRepository.getMaterializationAgents()).map(({ id }) => id),
    );
    const agentOutputs = yield* observeAgentOutputs({
      workspaceRoot: workspace.baseDir,
      scope: workspace.scope,
      desiredAgentIds: materializationAgentIds,
      expectedNames: expectedProjectionNames(desiredGraph),
      skillOwnershipRoots,
      authoredSkills,
    });
    const canonicalObservations: Effect.Effect<
      ReadonlyArray<{
        readonly desired: DesiredExtensionNode;
        readonly observation: CanonicalObservation;
      }>,
      WorkspaceHealthFailure
    > = Effect.gen(function* () {
      const graph = yield* workspace.getDesiredStateGraph();
      return yield* Effect.forEach(
        graph.nodes,
        (node) =>
          acceptedCanonicalObservation({
            workspace,
            type: node.type,
            name: node.name,
          }).pipe(
            Effect.flatMap((accepted) =>
              Option.isNone(accepted)
                ? new LintStagingFailed({
                    category: "internal",
                    detail: `Desired extension disappeared while linting: ${node.type}:${node.name}`,
                  })
                : Effect.succeed({ desired: node, observation: accepted.value.observation }),
            ),
          ),
        { concurrency: 16 },
      );
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );

    const evaluations = yield* evaluateAllCatalogs({
      view: selection.input.view,
      contexts: {
        skill: buildSkillRuleContexts(view),
        pack: buildPackRuleContexts(view),
        subagent: view.subagentContexts,
        "mcp-server": view.mcpServerContexts,
        rule: view.ruleContexts,
        hook: view.hookContexts,
        knowledge: view.knowledgeContexts,
        workspace: [
          {
            ...workspaceContext,
            ownership: Effect.succeed(ownership),
            agentOutputs: Effect.succeed(agentOutputs),
            health: {
              desiredState: workspace.getDesiredStateGraph(),
              canonicalObservations,
            },
          },
        ],
      },
      config,
    });
    const rawSummary = summarizeEvaluations(evaluations, config);
    const summary =
      selection.displayWorkspaceRoot === undefined
        ? rawSummary
        : remapLintSummaryPaths(
            rawSummary,
            selection.workspaceRoot,
            selection.displayWorkspaceRoot,
            path,
          );
    const axmSkillCompatibility =
      workspaceContext.axmSkillCompatibility === undefined
        ? undefined
        : Option.getOrUndefined(
            Option.flatten(yield* workspaceContext.axmSkillCompatibility.pipe(Effect.option)),
          );
    const exitCategory = summary.exitCategory;
    const outcome = resolveLintExitCategory({ category: exitCategory, strict: options.strict });
    return {
      document: toLintJsonDocument({
        summary,
        input: selection.input,
        ...(axmSkillCompatibility === undefined ? {} : { axmSkillCompatibility }),
      }),
      summary,
      exitCategory,
      outcome,
    } satisfies LintWorkspaceResult;
  });

/** Report the workspace's facts without changing it. */
export const queryLintWorkspace = (
  selection: LintSelection,
  options: { readonly strict: boolean },
): Effect.Effect<LintWorkspaceResult, LintWorkspaceFailure, LintWorkspaceRequirements> =>
  runLint({ ...selection, fix: false }, options);

/**
 * Repair the state whose desired value the workspace already determines, then
 * report what remains. Only determined state is repaired: a target whose
 * content is derived from a canonical source expresses no preference, so
 * regenerating it cannot overwrite a choice.
 */
export const fixLintWorkspace = (
  selection: LintSelection,
  options: { readonly strict: boolean },
): Effect.Effect<LintWorkspaceResult, LintWorkspaceFailure, LintWorkspaceRequirements> =>
  runLint({ ...selection, fix: true }, options);

/** The workspace lint use case. */
export const LintWorkspace = {
  admit: admitLintRequest,
  query: queryLintWorkspace,
  fix: fixLintWorkspace,
} as const;
