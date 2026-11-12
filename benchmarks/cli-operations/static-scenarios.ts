import type { BenchmarkOperation } from "./model.js";
import {
  assertOutput,
  configureWorkspace,
  type BenchmarkScenario,
  type ProcessResult,
} from "./fixtures.js";

const assertHasOutput = (result: ProcessResult): void => {
  if (result.stdout.trim() === "") throw new Error("Static CLI operation produced no stdout.");
};

export const buildStaticScenarios = (
  operations: ReadonlyArray<BenchmarkOperation>,
): ReadonlyArray<BenchmarkScenario> =>
  operations.flatMap((operation) =>
    operation.modes.flatMap((mode): ReadonlyArray<BenchmarkScenario> => {
      const staticMode = mode.kind === "help" || mode.kind === "topic" || mode.kind === "version";
      const helpIndex = operation.id === "help" && (mode.id === "default" || mode.id === "json");
      const group = operation.groupOnly && (mode.id === "default" || mode.id === "json");
      const agentInspection =
        operation.id === "agents list" || operation.id === "agents capabilities";
      const workspaceInspection = operation.id === "agents list" && !staticMode;
      if (!staticMode && !helpIndex && !group && !agentInspection) return [];
      return [
        {
          id: `${operation.id}/${mode.id}/static`,
          operationId: operation.id,
          modeId: mode.id,
          fixtureId: "static-cli-v1",
          dimensions: {
            scope: workspaceInspection ? "project" : "none",
            source: "none",
            selection: workspaceInspection
              ? "bulk"
              : agentInspection && !staticMode
                ? "targeted"
                : "none",
            view: workspaceInspection ? "filesystem" : "none",
            output: mode.flags.includes("--json")
              ? "json"
              : mode.format === "json-schema"
                ? "raw"
                : mode.kind === "version"
                  ? "plain"
                  : "human",
            state: workspaceInspection ? "query" : "static",
            format:
              mode.kind === "version"
                ? "semantic-version"
                : mode.flags.includes("--json")
                  ? "json"
                  : (mode.format ?? "cli-human"),
            kinds: [],
          },
          description: staticMode
            ? `Execute ${operation.id} ${mode.id} through the compiled CLI.`
            : `Execute ${operation.id} ${mode.id} against an isolated configured workspace.`,
          prepare: async (context) => {
            if (workspaceInspection) await configureWorkspace(context);
            const args = [
              ...operation.route,
              ...mode.arguments,
              ...(agentInspection && !staticMode && operation.id === "agents capabilities"
                ? ["claude-code"]
                : []),
              ...mode.flags,
            ];
            return {
              args,
              expectedExitCode: 0,
              verify: (result) => {
                assertHasOutput(result);
                if (mode.kind === "version" && !/\d+\.\d+\.\d+/u.test(result.stdout))
                  throw new Error("Version mode did not return a semantic version.");
                if (mode.kind === "help" && !mode.flags.includes("--json"))
                  assertOutput(result, "USAGE");
                if ((group || helpIndex) && !mode.flags.includes("--json"))
                  assertOutput(result, group ? "USAGE" : "help");
                if (agentInspection && !staticMode && mode.id !== "detected")
                  assertOutput(
                    result,
                    operation.id === "agents capabilities" && mode.id === "default"
                      ? "Claude Code"
                      : "claude-code",
                  );
              },
            };
          },
        },
      ];
    }),
  );
