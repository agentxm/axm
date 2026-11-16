import type { NativeEntryRemoval } from "@agentxm/workspace-kernel/locations";
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
 * `@agentxm/workspace-kernel/projection`, the capability the reconciliation feature
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

import type * as Config from "effect/Config";
import type { NativeWriteAuthority } from "@agentxm/workspace-kernel/agent-adapters";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import {
  observationViewLayer,
  type NativeObservationView,
} from "@agentxm/workspace-kernel/locations";

import { buildPackRuleContexts, buildSkillRuleContexts } from "@agentxm/extension-content/lint";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { AxmSkillCompatibilityPolicy } from "@agentxm/cli-maintenance/official-skill/application";
import {
  CodingAgentRepository,
  WorkspaceInvariantFacts,
  expectedProjectionNames,
  observeAgentOutputs,
  observeConfiguredSkillLocations,
  workspaceOwnershipIssues,
  deriveAgentOutputAuthority,
  freezeProjectionFacts,
  instructionProjectionEffects,
  instructionReconciliationReadiness,
  withMcpInspectionReadView,
  type ProjectionInvariantFact,
} from "@agentxm/workspace-kernel/projection";
import {
  LockfileReader,
  DesiredStateReader,
  SettingsReader,
  WorkspaceLocation,
  acceptedCanonicalObservation,
  acceptedCanonicalObservationCapturing,
  freshStateLoadersFor,
  observeInstallRoot,
  withWorkspaceObservationReadView,
  workspaceReadPhaseFor,
  type CanonicalObservation,
  type DesiredExtensionNode,
  type AcceptedResolutionWriter,
} from "@agentxm/workspace-kernel/workspace-state";

import {
  assessOfficialAxmSkill,
  selectOfficialAxmSkill,
} from "@agentxm/workspace-kernel/resolution";
import { buildLintWorkspace } from "../catalog/index.js";
import type { BuildLintWorkspaceArgs } from "../catalog/workspace-read-model/lint-workspace.js";
import { nodesDeferringToObservation } from "../catalog/workspace/canonical-observation-findings.js";
import type { WorkspaceHealthFailure } from "../workspace-context.js";
import type { LintView } from "../catalog-contexts.js";
import {
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  summarizeRenderedFindings,
  toLintJsonDocument,
  toLintJsonFinding,
  type LintExitCategory,
  type LintSummary,
  type RenderedFinding,
} from "../runner.js";
import type { LintInput, LintJsonDocument } from "../json-schema.js";
import { observeAuthoredPackages, type AuthoredPackageResolution } from "./authored-packages.js";
import {
  observeProjectAgentContent,
  observeUserScope,
  type AgentContentEntry,
  type UserScopeObservation,
} from "./agent-scopes.js";
import { LintStagingFailed } from "./errors.js";
import {
  applyDeterminedRepairs,
  lintConfigFromSettings,
  remapLintSummaryPaths,
  resolveLintRoot,
} from "./settings.js";
import { materializeGitIndexWorkspace } from "./staged-workspace.js";
import { type WorkspaceTransactionScope } from "@agentxm/workspace-kernel/settlement";

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
  readonly nativeView: NativeObservationView;
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
        category: "usage",
        detail:
          "--fix cannot be combined with --staged because the index snapshot is not the working tree",
      });
    }
    if (request.view === "git-index" && request.scope === "user") {
      return yield* new LintStagingFailed({
        category: "usage",
        detail:
          "--staged cannot be combined with --scope user because Git indexes are project-scoped",
      });
    }

    if (request.scope === "user" && request.path !== undefined) {
      return yield* new LintStagingFailed({
        category: "usage",
        detail: "An explicit workspace cannot be combined with --scope user",
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
        nativeView: {
          kind: "git-index",
          readRoot: snapshot.snapshotRoot,
          displayRoot: snapshot.gitRoot,
          fingerprint: snapshot.fingerprint,
        },
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
      input: { view: "filesystem" },
      nativeView: { kind: "workspace" },
      fix: request.fix,
    } satisfies LintSelection;
  });

/** The absolute root a selection names, for the workspace layer the run needs. */
export const lintSelectionRoot = (selection: LintSelection) =>
  decodeAbsolutePathSync(selection.workspaceRoot);

/** Provide this read view before constructing the selected workspace's services. */
export const lintSelectionLayer = (selection: LintSelection) =>
  observationViewLayer(selection.nativeView);

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
  /** Findings `--fix` repaired: present before the repair and absent after it. */
  readonly repaired: ReadonlyArray<RenderedFinding>;
}

/** Every service a lint run reads the workspace and its projections through. */
export type LintWorkspaceRequirements =
  | NativeEntryRemoval
  | AxmSkillCompatibilityPolicy
  | CodingAgentRepository
  | FileSystem.FileSystem
  | LockfileReader
  | Path.Path
  | WorkspaceLocation
  | SettingsReader
  | DesiredStateReader
  | WorkspaceInvariantFacts;

/** Every failure a lint run can settle into. */
export type LintWorkspaceFailure =
  | Config.ConfigError
  | Effect.Error<ReturnType<typeof observeUserScope>>
  | LintStagingFailed
  | Effect.Error<ReturnType<typeof buildLintWorkspace>>
  | Effect.Error<ReturnType<typeof acceptedCanonicalObservation>>
  | Effect.Error<ReturnType<typeof applyDeterminedRepairs>>;

type LintStateLoaders = NonNullable<BuildLintWorkspaceArgs["stateLoaders"]>;

/**
 * The document cells lint's read model decides against while its own
 * observation phase is active. Each document is bound to one source at its
 * first demand, so its raw and decoded cells always come from one read: the
 * phase's cells while the phase is active, lint's own fresh loaders once the
 * phase has ended. An ended phase is never consulted again.
 */
const phaseSharedStateLoaders = (args: {
  readonly isActive: () => boolean;
  readonly phaseLoaders: LintStateLoaders;
  readonly ownLoaders: LintStateLoaders;
}) =>
  Effect.gen(function* () {
    const choose = Effect.sync(() => (args.isActive() ? args.phaseLoaders : args.ownLoaders));
    const settings = yield* Effect.cached(choose);
    const lockfile = yield* Effect.cached(choose);
    return {
      settings: Effect.flatMap(settings, (loaders) => loaders.settings),
      settingsRaw: Effect.flatMap(settings, (loaders) => loaders.settingsRaw),
      lockfile: Effect.flatMap(lockfile, (loaders) => loaders.lockfile),
      lockfileRaw: Effect.flatMap(lockfile, (loaders) => loaders.lockfileRaw),
    } satisfies LintStateLoaders;
  });

/**
 * The projection facts every rule of one lint run reads. A demand made while
 * the run's read phase is still active reuses the facts an earlier demand
 * evaluated entirely inside that same phase; every other demand evaluates
 * afresh, as an unshared accessor would. Demands never wait on one another,
 * so an interrupted demand leaves nothing for another to inherit.
 */
const phaseSharedProjectionFacts = (args: {
  readonly location: Parameters<typeof workspaceReadPhaseFor>[0];
  readonly evaluate: Effect.Effect<ReadonlyArray<ProjectionInvariantFact>>;
}) =>
  Effect.gen(function* () {
    const phase = yield* workspaceReadPhaseFor(args.location);
    if (phase === undefined) return args.evaluate;
    const settled = yield* Ref.make(Option.none<ReadonlyArray<ProjectionInvariantFact>>());
    const withinPhase = Effect.map(
      workspaceReadPhaseFor(args.location),
      (current) => current === phase,
    );
    return Effect.gen(function* () {
      if (!(yield* withinPhase)) return yield* args.evaluate;
      const reused = yield* Ref.get(settled);
      if (Option.isSome(reused)) return reused.value;
      const facts = freezeProjectionFacts(yield* args.evaluate);
      if (yield* withinPhase) {
        yield* Ref.update(settled, (current) =>
          Option.isSome(current) ? current : Option.some(facts),
        );
      }
      return facts;
    });
  });

const runLint = (selection: LintSelection, options: { readonly strict: boolean }) =>
  withWorkspaceObservationReadView(
    withMcpInspectionReadView(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const location = yield* WorkspaceLocation;
        const layout = yield* Ref.get(location.layout);
        const settingsReader = yield* SettingsReader;
        const desiredState = yield* DesiredStateReader;
        const lockfile = yield* LockfileReader;
        const agentRepository = yield* CodingAgentRepository;
        const axmSkillCompatibilityPolicy = yield* AxmSkillCompatibilityPolicy;
        const invariantFacts = yield* WorkspaceInvariantFacts;
        const userHome = selection.scope === "user" ? selection.workspaceRoot : selection.userHome;
        // Every rule that reports a canonical observation reads this one
        // observation of each desired node for the run. The accepted row and
        // the manifest each observation read stay with this run.
        const canonicalCaptures = yield* Effect.cached(
          Effect.gen(function* () {
            const graph = yield* desiredState.graph();
            return yield* Effect.forEach(
              graph.nodes,
              (node) =>
                acceptedCanonicalObservationCapturing({
                  type: node.type,
                  name: node.name,
                }).pipe(
                  Effect.flatMap(({ observed, manifest }) =>
                    Option.isNone(observed)
                      ? new LintStagingFailed({
                          category: "internal",
                          detail: `Desired extension disappeared while linting: ${node.type}:${node.name}`,
                        })
                      : Effect.succeed({
                          desired: node,
                          observation: observed.value.observation,
                          accepted: observed.value.accepted,
                          manifest,
                        }),
                  ),
                ),
              { concurrency: 16 },
            );
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.provideService(WorkspaceLocation, location),
            Effect.provideService(LockfileReader, lockfile),
            Effect.provideService(DesiredStateReader, desiredState),
          ),
        );
        const canonicalObservations: Effect.Effect<
          ReadonlyArray<{
            readonly desired: DesiredExtensionNode;
            readonly observation: CanonicalObservation;
          }>,
          WorkspaceHealthFailure
        > = Effect.map(canonicalCaptures, (captures) =>
          captures.map(({ desired, observation }) => ({ desired, observation })),
        );
        // A node whose canonical tree is absent has nothing for its own artifact
        // and content rules to inspect, so they defer to the one finding the
        // observation router names. Unavailable observations defer nothing.
        const captured = yield* Effect.result(canonicalCaptures);
        const deferred = Result.isFailure(captured)
          ? new Set<string>()
          : nodesDeferringToObservation(captured.success);

        // The official AXM skill is the desired node its identity selects, judged
        // from that node's canonical observation; no other copy on disk counts.
        const officialAxmSkill = yield* Effect.cached(
          canonicalObservations.pipe(
            Effect.flatMap((nodes) =>
              assessOfficialAxmSkill({
                selected: selectOfficialAxmSkill(nodes),
                policy: axmSkillCompatibilityPolicy,
              }),
            ),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
          ),
        );

        const desiredGraph = yield* desiredState.graph();
        // The read model shares this run's observation phase's document cells
        // only when the phase observes exactly the roots, scope and port lint
        // reads; equal roots name equal documents. Any other run reads its own.
        const phase = yield* workspaceReadPhaseFor(location);
        const stateLoaders =
          phase !== undefined &&
          phase.observations &&
          phase.fileSystem === fileSystem &&
          selection.workspaceRoot === location.projectRoot &&
          userHome === location.userHome &&
          selection.scope === location.scope &&
          !(selection.input.view === "git-index" && selection.scope === "user")
            ? yield* phaseSharedStateLoaders({
                isActive: phase.isActive,
                phaseLoaders: yield* phase.stateLoaders(selection.scope),
                ownLoaders: yield* freshStateLoadersFor(location, selection.scope).pipe(
                  Effect.provideService(FileSystem.FileSystem, fileSystem),
                  Effect.provideService(Path.Path, path),
                ),
              })
            : undefined;
        // Aggregate contributor selection inside the projection facts takes this
        // run's own observation of the identical desired node, only while this
        // observation phase is active and read through the port lint observed
        // through; every other selection observes for itself.
        // The authored packages this run resolves below, once they settle; a
        // facts demand before then resolves each package for itself.
        let authoredResolutions: ReadonlyArray<AuthoredPackageResolution> = [];
        const handOverObservations =
          phase !== undefined &&
          phase.observations &&
          phase.fileSystem === fileSystem &&
          Result.isSuccess(captured) &&
          invariantFacts.withCanonicalObservations !== undefined
            ? invariantFacts.withCanonicalObservations({
                phase,
                fileSystem,
                authoredPackage: (asked) =>
                  Option.map(
                    Option.fromUndefinedOr(
                      authoredResolutions.find(
                        (resolution) =>
                          resolution.type === asked.type &&
                          resolution.name === asked.name &&
                          resolution.layout === asked.layout,
                      ),
                    ),
                    ({ root, manifest, hash }) => ({ root, manifest, hash }),
                  ),
                observed: (desired) =>
                  Option.map(
                    Option.fromUndefinedOr(
                      captured.success.find((capture) => capture.desired === desired),
                    ),
                    ({ accepted, observation, manifest }) => ({
                      accepted,
                      layout,
                      observation,
                      manifest,
                    }),
                  ),
              })
            : undefined;
        const { rule: workspaceContext, view } = yield* buildLintWorkspace({
          ...(stateLoaders === undefined ? {} : { stateLoaders }),
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          platform: { fs: fileSystem, path },
          workspaceRoot: selection.workspaceRoot,
          userHome,
          scope: selection.scope,
          desiredState: desiredGraph,
          gitIndexView: selection.input.view === "git-index",
          officialAxmSkill,
          owner: settingsReader.owner.pipe(Effect.catch(() => Effect.succeed(Option.none()))),
          projections: {
            facts: yield* phaseSharedProjectionFacts({
              location,
              evaluate:
                handOverObservations === undefined
                  ? invariantFacts.projectionFacts
                  : invariantFacts.projectionFacts.pipe(handOverObservations),
            }),
          },
          defersExtensionRules: (type, name) => deferred.has(`${type}:${name}`),
        });
        // The settings document lint decides against is the one strict read the
        // workspace read model already made; lint keeps no decoder of its own.
        const settings = yield* workspaceContext.workspace.state.settings;
        const config = lintConfigFromSettings(settings);

        // Reconciliation facts: what AXM owns, and what it realized for the agents
        // this workspace configures. Both come from the shared projection
        // capability, never from the reconciliation feature.
        const configuredAgents = yield* settingsReader.configuredAgents;
        const skillNodes = desiredGraph.nodes.filter(
          (node) => node.type === "skill" && !deferred.has(`skill:${node.name}`),
        );
        const nativeSkills = yield* Effect.cached(
          observeConfiguredSkillLocations({
            type: "skill",
            state: "current",
            scope: location.scope,
            agentIds: configuredAgents,
            rows: skillNodes.map((node) => ({
              name: node.name,
              targetState: node.enabled ? "enabled" : "disabled",
              installed: true,
            })),
          }).pipe(
            Effect.map((observations) =>
              skillNodes.flatMap((node) => {
                const observation = observations.get(node.name);
                return observation === undefined
                  ? []
                  : [
                      {
                        name: node.name,
                        enabled: node.enabled,
                        implicit: !node.origins.some((origin) => origin.type === "settings"),
                        observation,
                      },
                    ];
              }),
            ),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.provideService(WorkspaceLocation, location),
            Effect.provideService(SettingsReader, settingsReader),
            Effect.provideService(LockfileReader, lockfile),
            Effect.provideService(DesiredStateReader, desiredState),
            Effect.provideService(CodingAgentRepository, agentRepository),
          ),
        );
        const outputAuthority = deriveAgentOutputAuthority({
          path,
          baseDir: location.baseDir,
          layout,
          desired: desiredGraph,
          acceptedResolutions: yield* lockfile.lockfile,
          settings: Option.getOrElse(settings, () => ({})),
        });
        const authoredSkills = {
          layout,
          entries: Option.isSome(settings) ? (settings.value.skills ?? {}) : {},
        };
        const materializationAgentIds = new Set(
          (yield* agentRepository.getMaterializationAgents()).map(({ id }) => id),
        );
        const agentOutputs = yield* observeAgentOutputs({
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          workspaceRoot: location.baseDir,
          scope: location.scope,
          desiredAgentIds: materializationAgentIds,
          expectedNames: expectedProjectionNames(desiredGraph),
          ...outputAuthority,
          authoredSkills,
        });
        // Ownership depends only on proof, never on the desired agents or the
        // expected names, so the agent-output inventory answers it as well.
        const ownership = workspaceOwnershipIssues(agentOutputs);
        // Cross-scope agent facts. The agents that read this workspace also read
        // the user scope; a project folder that is the user home has no separate
        // user scope, and a Git-index snapshot has no live agent folders.
        const liveView = selection.input.view === "filesystem";
        const realRoot = (root: string) =>
          fileSystem.realPath(root).pipe(Effect.orElseSucceed(() => path.resolve(root)));
        const projectIsUserHome =
          selection.scope === "project" &&
          (yield* realRoot(selection.workspaceRoot)) === (yield* realRoot(userHome));
        const userScope =
          liveView && !projectIsUserHome
            ? Option.some(yield* observeUserScope(userHome, location.nativeDirectoryInputs))
            : Option.none<UserScopeObservation>();
        const agentContent =
          liveView && selection.scope === "project" && !projectIsUserHome && Option.isNone(settings)
            ? Option.some(
                yield* observeProjectAgentContent({
                  projectRoot: location.baseDir,
                  outputs: agentOutputs.outputs,
                }),
              )
            : Option.none<ReadonlyArray<AgentContentEntry>>();
        // Install-root and authoring-folder facts. An unreadable lockfile leaves
        // the install root unobserved; its own rule reports the lockfile.
        const installRoot = yield* observeInstallRoot({
          layout,
          graph: desiredGraph,
          locks: lockfile,
        }).pipe(Effect.option);
        const authored = Option.isSome(settings)
          ? yield* observeAuthoredPackages({ layout, settings: settings.value })
          : undefined;
        const authoredPackages = authored?.packages ?? [];
        authoredResolutions = authored?.resolutions ?? [];
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
                nativeSkills,
                ...(Option.isSome(installRoot)
                  ? { installRoot: Effect.succeed(installRoot.value) }
                  : {}),
                authoredPackages: Effect.succeed(authoredPackages),
                ...(Option.isSome(userScope) ? { userScope: Effect.succeed(userScope.value) } : {}),
                ...(Option.isSome(agentContent)
                  ? { agentContent: Effect.succeed(agentContent.value) }
                  : {}),
                health: {
                  desiredState: desiredState.graph(),
                  canonicalObservations,
                },
              },
            ],
          },
          config,
        });
        const rawSummary = summarizeEvaluations(evaluations, config);
        const summary =
          selection.nativeView.kind !== "git-index"
            ? rawSummary
            : remapLintSummaryPaths(
                rawSummary,
                selection.nativeView.readRoot,
                selection.nativeView.displayRoot,
                path,
              );
        const officialAssessment = yield* Effect.result(officialAxmSkill);
        const axmSkillCompatibility =
          Result.isSuccess(officialAssessment) && officialAssessment.success._tag === "assessed"
            ? officialAssessment.success.compatibility
            : undefined;
        const exitCategory = summary.exitCategory;
        const outcome = resolveLintExitCategory({ category: exitCategory, strict: options.strict });
        return {
          result: {
            document: toLintJsonDocument({
              summary,
              input: selection.input,
              ...(axmSkillCompatibility === undefined ? {} : { axmSkillCompatibility }),
            }),
            summary,
            exitCategory,
            outcome,
            repaired: [],
          } satisfies LintWorkspaceResult,
          settings,
          instructionSnapshot:
            workspaceContext.instructions === undefined
              ? Option.none()
              : yield* workspaceContext.instructions.snapshot,
        };
      }),
    ),
  );

/** Report the workspace's facts without changing it. */
export const queryLintWorkspace = (
  selection: LintSelection,
  options: { readonly strict: boolean },
): Effect.Effect<LintWorkspaceResult, LintWorkspaceFailure, LintWorkspaceRequirements> =>
  runLint(selection, options).pipe(
    Effect.map(({ result }) => result),
    Effect.withSpan("LintWorkspace.query"),
  );

/**
 * Repair the state whose desired value the workspace already determines, then
 * report what remains. Only determined state is repaired: a target whose
 * content is derived from a canonical source expresses no preference, so
 * regenerating it cannot overwrite a choice.
 */
export const fixLintWorkspace = (
  selection: LintSelection,
  options: { readonly strict: boolean; readonly preview?: boolean },
): Effect.Effect<
  LintWorkspaceResult,
  LintWorkspaceFailure,
  | LintWorkspaceRequirements
  | NativeWriteAuthority
  | NativeEntryRemoval
  | AcceptedResolutionWriter
  | WorkspaceTransactionScope
> =>
  Effect.gen(function* () {
    // The reconciliation pass proves every determined instruction target
    // current after it writes. Reuse that proof instead of gathering every
    // lint catalog a second time.
    const { result: before, settings, instructionSnapshot } = yield* runLint(selection, options);
    if (options.preview === true) {
      if (Option.isSome(instructionSnapshot)) {
        const failure = yield* instructionReconciliationReadiness({
          snapshot: instructionSnapshot.value,
          workspaceRoot: instructionSnapshot.value.workspaceRoot,
        });
        if (Option.isSome(failure)) return yield* failure.value;
      }
      return {
        ...before,
        document: {
          ...before.document,
          normalization: {
            mode: "preview" as const,
            changes: Option.isSome(instructionSnapshot)
              ? instructionProjectionEffects(instructionSnapshot.value)
              : [],
          },
        },
      };
    }
    const repairedRuleIds = new Set(
      yield* applyDeterminedRepairs({
        workspaceRoot: selection.workspaceRoot,
        nativeDirectoryInputs: (yield* WorkspaceLocation).nativeDirectoryInputs,
        scope: selection.scope,
        settings,
      }),
    );
    const repaired = before.summary.findings.filter((finding) =>
      repairedRuleIds.has(finding.finding.ruleId),
    );
    const summary = summarizeRenderedFindings(
      before.summary.findings.filter((finding) => !repairedRuleIds.has(finding.finding.ruleId)),
      before.summary.driftBanner,
    );
    const exitCategory = summary.exitCategory;
    const outcome = resolveLintExitCategory({ category: exitCategory, strict: options.strict });
    return {
      ...before,
      document: {
        ...before.document,
        findings: summary.findings.map(toLintJsonFinding),
        repaired: repaired.map(toLintJsonFinding),
        summary: {
          total: summary.counts.total,
          errors: summary.counts.errors,
          warnings: summary.counts.warnings,
          infos: summary.counts.infos,
          exitCategory,
        },
      },
      summary,
      exitCategory,
      outcome,
      repaired,
    };
  }).pipe(Effect.withSpan("LintWorkspace.fix"));

/** The workspace lint use case. */
export const LintWorkspace = {
  admit: admitLintRequest,
  query: queryLintWorkspace,
  fix: fixLintWorkspace,
} as const;
