import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";
import { ExitCode } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { effectCliExit, withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { extensionTypes } from "@agentxm/client-core/unstable/extensions";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
  observeCanonicalExtension,
} from "@agentxm/client-core/unstable/workspace";
import { withRuntime, withWorkspace } from "../runtime.js";

const WorkspaceHealthProblemSchema = Schema.Struct({
  code: Schema.String,
  extensionType: Schema.NullOr(Schema.String),
  identity: Schema.String,
  detail: Schema.String,
  blocking: Schema.Boolean,
  recoveryAction: Schema.NullOr(Schema.String),
});

export const WorkspaceStatusSchema = Schema.Struct({
  healthy: Schema.Boolean,
  desiredGraphComplete: Schema.Boolean,
  scope: Schema.String,
  problems: Schema.Array(WorkspaceHealthProblemSchema),
  blockedOperations: Schema.Array(Schema.String),
});

type WorkspaceHealthProblem = Schema.Schema.Type<typeof WorkspaceHealthProblemSchema>;

const HealthTable = {
  columns: {
    code: { header: "Problem" },
    identity: { header: "Identity" },
    detail: { header: "Detail" },
    recovery: { header: "Recovery" },
  },
} as const satisfies TableView<{
  readonly code: string;
  readonly identity: string;
  readonly detail: string;
  readonly recovery: string;
}>;

export const handleStatus = Effect.fn("Status.handle")(function* () {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const graph = yield* ws.getDesiredStateGraph();
  const graphProblems: ReadonlyArray<WorkspaceHealthProblem> = graph.problems.map((problem) => {
    switch (problem.type) {
      case "pack-manifest-unavailable":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: `Manifest unavailable at ${problem.path}`,
          blocking: true,
          recoveryAction: null,
        };
      case "pack-manifest-invalid":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: `Manifest invalid at ${problem.path}`,
          blocking: true,
          recoveryAction: null,
        };
      case "pack-identity-mismatch":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: problem.detail,
          blocking: true,
          recoveryAction: null,
        };
      case "pack-trust-unavailable":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: problem.detail,
          blocking: true,
          recoveryAction: `axm packs repair ${problem.pack} --preview`,
        };
      case "pack-canonical-unusable":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: `Canonical content is ${problem.status}${problem.path === undefined ? "" : ` at ${problem.path}`}`,
          blocking: true,
          recoveryAction: `axm packs repair ${problem.pack} --preview`,
        };
      case "projection-collision":
        return {
          code: problem.type,
          extensionType: problem.extensionType,
          identity: problem.name,
          detail: `Competing identities: ${problem.identities.join(", ")}`,
          blocking: true,
          recoveryAction: null,
        };
      case "constraint-conflict":
        return {
          code: problem.type,
          extensionType: problem.extensionType,
          identity: problem.name,
          detail: `Incompatible constraints: ${problem.constraints.join(", ")}`,
          blocking: true,
          recoveryAction: null,
        };
    }
  });
  const trust = yield* ws.getTrustState();
  const observations = yield* Effect.forEach(
    graph.nodes,
    (node) =>
      observeCanonicalExtension({
        baseDir: ws.baseDir,
        desired: node,
        trust: trust.records[`${node.type}:${node.name}`],
      }).pipe(Effect.map((observation) => ({ node, observation }))),
    { concurrency: 16 },
  );
  const graphPackProblems = new Set(
    graphProblems
      .filter((problem) => problem.extensionType === "pack")
      .map((problem) => problem.identity.replace(/^workspace:/, "")),
  );
  const canonicalProblems: ReadonlyArray<WorkspaceHealthProblem> = observations.flatMap(
    ({ node, observation }) => {
      if (observation.status === "usable" || observation.status === "not-applicable") return [];
      const identity = node.identity.replace(/^workspace:/, "");
      if (node.type === "pack" && graphPackProblems.has(identity)) return [];
      return [
        {
          code: `canonical-${observation.status}`,
          extensionType: node.type,
          identity,
          detail: `Canonical content is ${observation.status}${observation.path === undefined ? "" : ` at ${observation.path}`}`,
          blocking: true,
          recoveryAction:
            node.type === "pack" && observation.status === "locally-modified"
              ? `axm packs repair ${identity} --preview`
              : observation.status === "wrong-origin"
                ? null
                : `axm sync ${identity} --dry-run`,
        },
      ];
    },
  );
  const inventories = yield* Effect.forEach(
    extensionTypes,
    (type) => ws.records.getExtensionInventory(type, { includeIgnored: false }),
    { concurrency: 9 },
  );
  const inventoryByType = new Map(
    extensionTypes.map((type, index) => [type, inventories[index]?.items ?? []]),
  );
  const configuredAgents = yield* ws.getConfiguredAgents();
  const projectionProblems: ReadonlyArray<WorkspaceHealthProblem> = graph.nodes.flatMap((node) => {
    if (
      !node.enabled ||
      (node.type !== "skill" &&
        node.type !== "command" &&
        node.type !== "mcp-server" &&
        node.type !== "subagent")
    ) {
      return [];
    }
    const row = inventoryByType.get(node.type)?.find((item) => item.name === node.name);
    const projectionOrigin =
      node.type === "skill"
        ? "agent-skill-dir"
        : node.type === "command"
          ? "agent-command-dir"
          : node.type === "subagent"
            ? "agent-subagent-dir"
            : undefined;
    const current =
      row?.installed === true &&
      (projectionOrigin === undefined ||
        row.origins.includes(projectionOrigin) ||
        (node.type === "mcp-server" &&
          (row.origins.includes("workspace-mcp-config") ||
            row.origins.includes("agent-mcp-config")))) &&
      configuredAgents.every((agent) => row.agents.includes(agent));
    if (current) return [];
    const identity = node.identity.replace(/^workspace:/, "");
    return [
      {
        code: "stale-projection",
        extensionType: node.type,
        identity,
        detail: "One or more configured agent projections are missing or stale",
        blocking: true,
        recoveryAction: `axm sync ${identity} --dry-run`,
      },
    ];
  });
  const problems = [...graphProblems, ...canonicalProblems, ...projectionProblems];
  const hasBlockingProblems = problems.some((problem) => problem.blocking);
  const result = {
    healthy: problems.length === 0,
    desiredGraphComplete: graph.complete,
    scope: ws.scope,
    problems,
    blockedOperations:
      problems.length === 0 ? [] : ["global sync", "destructive pack reconciliation"],
  };
  if (!(yield* renderer.result(result, WorkspaceStatusSchema, { ok: !hasBlockingProblems }))) {
    if (problems.length === 0) {
      yield* renderer.success("Workspace health is current");
    } else {
      yield* renderer.table(
        problems.map((problem) => ({
          code: problem.code,
          identity: problem.identity,
          detail: problem.detail,
          recovery: problem.recoveryAction ?? "",
        })),
        HealthTable,
        `${problems.length} blocking workspace ${problems.length === 1 ? "problem" : "problems"}`,
      );
    }
  }
  if (hasBlockingProblems) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});

const statusConfig = {} as const;

export const statusCommand = Command.make("status", statusConfig, () =>
  handleStatus().pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("status")),
).pipe(
  withArgvTracking(statusConfig),
  Command.withDescription("Inspect local workspace health and reconciliation blockers"),
  Command.withExamples([
    {
      command: "axm status",
      description: "Inspect workspace health and local reconciliation blockers",
    },
    {
      command: "axm status --json",
      description: "Emit structured workspace health",
    },
  ]),
);
