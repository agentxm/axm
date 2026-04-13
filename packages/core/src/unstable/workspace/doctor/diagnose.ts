import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import { CodingAgentRepository, CodingAgentRepositoryLive } from "../../agents/index.js";
import { SourceHostProviders, SourceHostProvidersLive } from "../../source-resolution/index.js";
import { locateWorkspace } from "../paths.js";
import { Workspace } from "../service-interface.js";
import type { WorkspaceContextOptions } from "../service-interface.js";
import { loadWorkspace } from "../service.js";
import type { CheckDef } from "./check-def.js";
import { agentsConfiguredCheck } from "./checks/agents-configured.js";
import { extensionsInstalledCheck } from "./checks/extensions-installed.js";
import { makeWorkspaceReadyCheck } from "./checks/workspace-ready.js";
import { summarize } from "./rollup.js";
import type { Check } from "./types.js";
import { runCheckGraph } from "./runner.js";

type DoctorCheckDeps =
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | Workspace
  | CodingAgentRepository
  | SourceHostProviders;

const dependentChecks = [
  agentsConfiguredCheck,
  extensionsInstalledCheck,
] as const satisfies ReadonlyArray<CheckDef<unknown>>;

const skipCheck = (check: CheckDef<unknown>, failedTitle: string): Check => ({
  id: check.id,
  title: check.title,
  description: check.description,
  dependsOn: check.dependsOn,
  status: "skip",
  skipReason: `Depends on "${failedTitle}", which failed.`,
  findings: [],
});

export const diagnoseWorkspaceDoctor = (
  options: Pick<WorkspaceContextOptions, "scope" | "builtInSources">,
) =>
  Effect.gen(function* () {
    const workspace = yield* locateWorkspace(options.scope);
    const workspaceReadyCheck = makeWorkspaceReadyCheck(workspace);
    const rootReport = yield* runCheckGraph([workspaceReadyCheck], workspace);
    const rootCheck = rootReport.checks[0];

    if (rootCheck !== undefined && rootCheck.status === "fail") {
      const checks = [
        rootCheck,
        ...dependentChecks.map((check) => skipCheck(check, rootCheck.title)),
      ] satisfies ReadonlyArray<Check>;
      const summary = summarize(checks);

      return {
        scope: workspace.scope,
        workspacePath: workspace.path,
        healthy: summary.findings.errors === 0,
        summary,
        checks,
      };
    }

    const workspaceService = yield* loadWorkspace(options);
    const workspaceLayer = Workspace.layer(workspaceService);
    const sourceProviders = yield* Effect.serviceOption(SourceHostProviders);
    const codingAgentRepository = yield* Effect.serviceOption(CodingAgentRepository);
    const sourceProvidersLayer = Option.match(sourceProviders, {
      onNone: () => Layer.provide(SourceHostProvidersLive, workspaceLayer),
      onSome: (service) => Layer.succeed(SourceHostProviders, service),
    });
    const codingAgentRepositoryLayer = Option.match(codingAgentRepository, {
      onNone: () => CodingAgentRepositoryLive,
      onSome: (service) => Layer.succeed(CodingAgentRepository, service),
    });
    const checks: ReadonlyArray<CheckDef<DoctorCheckDeps>> = [
      workspaceReadyCheck,
      agentsConfiguredCheck,
      extensionsInstalledCheck,
    ];

    return yield* runCheckGraph(checks, workspace).pipe(
      Effect.provide(
        Layer.mergeAll(workspaceLayer, sourceProvidersLayer, codingAgentRepositoryLayer),
      ),
    );
  });
