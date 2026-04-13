import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { CodingAgentRepository, detectAgentsInRoot } from "../../../agents/index.js";
import type { CodingAgent } from "../../../agents/index.js";
import type { AppError } from "../../../app-error/index.js";
import { Workspace } from "../../service-interface.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Action, type Finding } from "../types.js";

interface ConfiguredAgentState {
  readonly agentId: string;
  readonly targetDir?: string;
  readonly targetDirExists: boolean;
  readonly targetDirWritable: boolean;
  readonly resolutionProblem?: string;
  readonly detected: boolean;
}

interface AgentsConfiguredContext {
  readonly unknownAgentIds: ReadonlyArray<string>;
  readonly configuredAgents: ReadonlyArray<ConfiguredAgentState>;
  readonly detectedNotDeclaredAgentIds: ReadonlyArray<string>;
}

const EDIT_SETTINGS_ACTION: Action = {
  label: "Edit settings.json",
  description: "Fix the agent declaration and rerun doctor",
};

const SYNC_ACTION: Action = {
  label: "Run axm sync",
  description: "Create or update the agent target directories",
  command: "axm sync",
};

const FIX_PERMISSIONS_ACTION: Action = {
  label: "Fix filesystem permissions",
  description: "Grant axm access to the agent target directory",
};

const DISCOVER_ACTION: Action = {
  label: "Run axm discover",
  description: "Add detected agents to settings.json",
  command: "axm discover",
};

const sortStrings = (items: ReadonlyArray<string>): ReadonlyArray<string> => [...items].sort();

const canWrite = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.access(filePath, { writable: true }).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
  });

const prepareContext = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* Workspace;
    const agentRepo = yield* CodingAgentRepository;

    const configuredAgentIds = yield* ws
      .getConfiguredAgents()
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const configuredAgents = yield* agentRepo
      .getConfiguredAgents()
      .pipe(Effect.orElseSucceed((): ReadonlyArray<CodingAgent> => []));
    const unknownAgentIds = yield* agentRepo
      .getUnknownConfiguredAgentIds()
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const detectedAgentIds = yield* detectAgentsInRoot(ws.baseDir).pipe(
      Effect.map((agents) => agents.map((agent) => agent.id)),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );
    const detectedAgentIdSet = new Set(detectedAgentIds);
    const configuredAgentIdSet = new Set(configuredAgentIds);

    const configuredAgentStates = yield* Effect.forEach(
      configuredAgents,
      (agent) =>
        Effect.gen(function* () {
          const outcome = yield* agent
            .resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir })
            .pipe(
              Effect.catch((error: AppError) =>
                Effect.succeed({ _tag: "misconfigured" as const, reason: error.what }),
              ),
            );

          if (outcome._tag !== "supported") {
            return {
              agentId: agent.id,
              targetDirExists: false,
              targetDirWritable: false,
              resolutionProblem: outcome.reason,
              detected: detectedAgentIdSet.has(agent.id),
            } satisfies ConfiguredAgentState;
          }

          const targetDirExists = yield* fs
            .exists(outcome.dir)
            .pipe(Effect.orElseSucceed(() => false));
          const targetDirWritable = targetDirExists ? yield* canWrite(outcome.dir) : false;

          return {
            agentId: agent.id,
            targetDir: outcome.dir,
            targetDirExists,
            targetDirWritable,
            detected: detectedAgentIdSet.has(agent.id),
          } satisfies ConfiguredAgentState;
        }),
      { concurrency: "unbounded" },
    );

    return {
      unknownAgentIds: sortStrings(unknownAgentIds),
      configuredAgents: [...configuredAgentStates].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
      detectedNotDeclaredAgentIds: sortStrings(
        detectedAgentIds.filter((agentId) => !configuredAgentIdSet.has(agentId)),
      ),
    } satisfies AgentsConfiguredContext;
  });

type AgentsConfiguredDiagnostic = DiagnosticDef<AgentsConfiguredContext, never>;

const unrecognizedAgentDiagnostic: AgentsConfiguredDiagnostic = {
  id: "agents-configured.unrecognized-agent",
  run: (ctx) =>
    Effect.succeed(
      ctx.unknownAgentIds.map(
        (agentId): Finding => ({
          id: "agents-configured.unrecognized-agent",
          severity: "error",
          message: `Agent "${agentId}" is not recognized`,
          subject: { kind: "agent", ref: agentId },
          action: EDIT_SETTINGS_ACTION,
        }),
      ),
    ),
};

const targetDirMissingDiagnostic: AgentsConfiguredDiagnostic = {
  id: "agents-configured.target-dir-missing",
  run: (ctx) =>
    Effect.succeed(
      ctx.configuredAgents.flatMap((agent): ReadonlyArray<Finding> => {
        if (agent.targetDirExists) {
          return [];
        }

        if (agent.resolutionProblem !== undefined) {
          return [
            {
              id: "agents-configured.target-dir-missing",
              severity: "error",
              message: `Agent "${agent.agentId}" target directory is not available`,
              subject: { kind: "agent", ref: agent.agentId },
              details: agent.resolutionProblem,
              action: EDIT_SETTINGS_ACTION,
            } satisfies Finding,
          ];
        }

        return [
          {
            id: "agents-configured.target-dir-missing",
            severity: "error",
            message: `Agent "${agent.agentId}" target directory does not exist`,
            subject: { kind: "agent", ref: agent.agentId },
            details: agent.targetDir,
            action: SYNC_ACTION,
          } satisfies Finding,
        ];
      }),
    ),
};

const targetDirNotWritableDiagnostic: AgentsConfiguredDiagnostic = {
  id: "agents-configured.target-dir-not-writable",
  run: (ctx) =>
    Effect.succeed(
      ctx.configuredAgents.flatMap(
        (agent): ReadonlyArray<Finding> =>
          agent.targetDirExists && !agent.targetDirWritable
            ? [
                {
                  id: "agents-configured.target-dir-not-writable",
                  severity: "error",
                  message: `Agent "${agent.agentId}" target directory is not writable`,
                  subject: { kind: "agent", ref: agent.agentId },
                  details: agent.targetDir,
                  action: FIX_PERMISSIONS_ACTION,
                } satisfies Finding,
              ]
            : [],
      ),
    ),
};

const declaredNotDetectedDiagnostic: AgentsConfiguredDiagnostic = {
  id: "agents-configured.declared-not-detected",
  run: (ctx) =>
    Effect.succeed(
      ctx.configuredAgents.flatMap(
        (agent): ReadonlyArray<Finding> =>
          !agent.detected && agent.targetDirExists && agent.targetDirWritable
            ? [
                {
                  id: "agents-configured.declared-not-detected",
                  severity: "info",
                  message: `Agent "${agent.agentId}" is declared but was not detected on disk`,
                  subject: { kind: "agent", ref: agent.agentId },
                  action: SYNC_ACTION,
                } satisfies Finding,
              ]
            : [],
      ),
    ),
};

const detectedNotDeclaredDiagnostic: AgentsConfiguredDiagnostic = {
  id: "agents-configured.detected-not-declared",
  run: (ctx) =>
    Effect.succeed(
      ctx.detectedNotDeclaredAgentIds.map(
        (agentId): Finding => ({
          id: "agents-configured.detected-not-declared",
          severity: "warn",
          message: `Agent "${agentId}" was detected on disk but is not configured in settings.json`,
          subject: { kind: "agent", ref: agentId },
          action: DISCOVER_ACTION,
        }),
      ),
    ),
};

export const agentsConfiguredCheck = defineCheck({
  id: CHECK_IDS.agentsConfigured,
  title: "Agents configured",
  description:
    "Verifies declared agents are recognized, detected, and writable at their target directories.",
  dependsOn: [CHECK_IDS.workspaceReady],
  prepareContext: prepareContext(),
  diagnostics: [
    unrecognizedAgentDiagnostic,
    targetDirMissingDiagnostic,
    targetDirNotWritableDiagnostic,
    declaredNotDetectedDiagnostic,
    detectedNotDeclaredDiagnostic,
  ],
});
