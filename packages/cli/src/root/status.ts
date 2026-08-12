import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import os from "node:os";
import { Command, Flag } from "effect/unstable/cli";
import { ExitCode } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type TableView } from "@agentxm/client-core/unstable/cli-renderer";
import { effectCliExit, withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { extensionTypes } from "@agentxm/client-core/unstable/extensions";
import type { PacksLockMap, SkillsLockMap } from "@agentxm/client-core/unstable/lockfile";
import {
  isWorkspaceSourceLocator,
  printSkillLockSourceLocator,
} from "@agentxm/client-core/unstable/sources";
import {
  WorkspaceMutations,
  observeCanonicalExtension,
  type CanonicalObservation,
  type DesiredExtensionNode,
  type DesiredStateGraph,
  type WorkspaceScope,
} from "@agentxm/client-core/unstable/workspace";
import {
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilitySchema,
  type AxmSkillCompatibility,
} from "@agentxm/client-core/unstable/skills";
import { buildLintWorkspace } from "@agentxm/client-core/unstable/lint";
import { scopeFlag } from "../cli-flags.js";
import { withRuntime, withWorkspace } from "../runtime.js";
import { commandForScope } from "./shared/scoped-command.js";

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
  axmSkillCompatibility: AxmSkillCompatibilitySchema,
});

type WorkspaceHealthProblem = Schema.Schema.Type<typeof WorkspaceHealthProblemSchema>;

const axmSkillRecovery = (scope: WorkspaceScope): string =>
  commandForScope("axm skills install @agentxm/skills/axm --bundled --preview", scope);

export const axmSkillCompatibilityProblem = (
  compatibility: AxmSkillCompatibility,
  scope: WorkspaceScope,
): WorkspaceHealthProblem | undefined =>
  compatibility.status === "compatible"
    ? undefined
    : {
        code: compatibility.reasonCode ?? "axm-skill-incompatible",
        extensionType: "skill",
        identity: "@agentxm/skills/axm",
        detail: compatibility.detail ?? "The official AXM skill is incompatible.",
        blocking: true,
        recoveryAction: axmSkillRecovery(scope),
      };

export const formatAxmSkillCompatibility = (compatibility: AxmSkillCompatibility): string => {
  const facts = [
    compatibility.cliVersion === null ? undefined : `CLI ${compatibility.cliVersion}`,
    compatibility.skillVersion === null ? undefined : `skill ${compatibility.skillVersion}`,
    compatibility.declaredCliVersionRange === null
      ? undefined
      : `range ${compatibility.declaredCliVersionRange}`,
    compatibility.source === null ? undefined : `source ${compatibility.source}`,
  ].filter((fact) => fact !== undefined);
  const reason = compatibility.reasonCode === null ? "" : ` — ${compatibility.reasonCode}`;
  const details = facts.length === 0 ? "" : ` (${facts.join(", ")})`;
  return `AXM skill compatibility: ${compatibility.status}${reason}${details}`;
};

export const receiptOnlySkillProblems = (
  graph: DesiredStateGraph,
  lockedSkills: SkillsLockMap,
  lockedPacks: PacksLockMap = {},
  scope: WorkspaceScope = "project",
): ReadonlyArray<WorkspaceHealthProblem> => {
  if (!graph.complete) return [];
  const desiredSkillNames = new Set(
    graph.nodes.filter((node) => node.type === "skill").map((node) => node.name),
  );
  const desiredPackNames = new Set(
    graph.nodes.filter((node) => node.type === "pack").map((node) => node.name),
  );
  const retainedSkillIdentities = new Set(
    Object.entries(lockedPacks).flatMap(([name, entry]) =>
      desiredPackNames.has(name) ? Object.keys(entry.resolvedSkills) : [],
    ),
  );
  return Object.entries(lockedSkills).flatMap(([name, entry]) => {
    if (desiredSkillNames.has(name)) return [];
    const identity =
      entry.type === "registry" ? `${entry.owner}/skills/${entry.name}` : `skills/${name}`;
    if (retainedSkillIdentities.has(identity)) return [];
    const uninstallCommand = commandForScope(`axm skills uninstall ${name}`, scope);
    return [
      {
        code: "receipt-only-skill",
        extensionType: "skill",
        identity: name,
        detail: `The skill has receipt history but no desired-state declaration; declare it to retain the installed content or uninstall it explicitly with \`${uninstallCommand}\``,
        blocking: true,
        recoveryAction: commandForScope(
          `axm skills install ${printSkillLockSourceLocator(name, entry)}`,
          scope,
        ),
      },
    ];
  });
};

interface ProjectionInventoryRow {
  readonly installed: boolean;
  readonly origins: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
}

export const projectionIsCurrent = (
  node: Pick<DesiredExtensionNode, "type">,
  row: ProjectionInventoryRow | undefined,
  configuredAgents: ReadonlyArray<string>,
): boolean => {
  if (configuredAgents.length === 0 && (node.type === "subagent" || node.type === "mcp-server")) {
    return true;
  }
  const projectionOrigin =
    node.type === "skill"
      ? "agent-skill-dir"
      : node.type === "subagent"
        ? "agent-subagent-dir"
        : undefined;
  return (
    row?.installed === true &&
    (projectionOrigin === undefined ||
      row.origins.includes(projectionOrigin) ||
      (node.type === "mcp-server" &&
        (row.origins.includes("workspace-mcp-config") ||
          row.origins.includes("agent-mcp-config")))) &&
    configuredAgents.every((agent) => row.agents.includes(agent))
  );
};

export const canonicalHealthProblem = (
  node: DesiredExtensionNode,
  observation: CanonicalObservation,
  scope: WorkspaceScope = "project",
): WorkspaceHealthProblem | undefined => {
  if (observation.status === "usable" || observation.status === "not-applicable") {
    return undefined;
  }
  const identity = node.identity.replace(/^workspace:/, "");
  const pathDetail = observation.path === undefined ? "" : ` at ${observation.path}`;
  if (observation.status === "locally-modified" && isWorkspaceSourceLocator(node.source)) {
    return {
      code: "canonical-locally-modified",
      extensionType: node.type,
      identity,
      detail:
        scope === "project"
          ? `Canonical content was modified since its last recorded authoring/publish baseline${pathDetail}. Publishing preserves the authored content.`
          : `Canonical content is a legacy user-scope authored source${pathDetail}; authoring is project-workspace only.`,
      blocking: scope === "user",
      recoveryAction: scope === "project" ? `axm publish ${identity}` : null,
    };
  }
  if (observation.status === "locally-modified") {
    return {
      code: "canonical-locally-modified",
      extensionType: node.type,
      identity,
      detail: `Canonical content differs from its trusted source baseline${pathDetail}. Applying sync restores trusted source content and discards these local modifications.`,
      blocking: true,
      recoveryAction:
        node.type === "pack"
          ? scope === "project"
            ? `axm packs repair ${identity} --preview`
            : commandForScope(`axm sync ${identity} --preview`, scope)
          : commandForScope(`axm sync ${identity} --preview`, scope),
    };
  }
  const recoveryAction =
    observation.status === "missing-trust"
      ? commandForScope(`axm sync ${identity}`, scope)
      : observation.status === "wrong-origin" && isWorkspaceSourceLocator(node.source)
        ? scope === "project"
          ? `axm adopt ${identity} --preview`
          : null
        : observation.status === "wrong-origin"
          ? null
          : commandForScope(`axm sync ${identity} --preview`, scope);
  return {
    code: `canonical-${observation.status}`,
    extensionType: node.type,
    identity,
    detail: `Canonical content is ${observation.status}${pathDetail}`,
    blocking: true,
    recoveryAction,
  };
};

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
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const axmSkillCompatibilityPolicy = yield* AxmSkillCompatibilityPolicy;
  const lintWorkspace = yield* buildLintWorkspace({
    platform: { fs, path },
    workspaceRoot: ws.baseDir,
    userHome: ws.scope === "user" ? ws.baseDir : os.homedir(),
    scope: ws.scope,
    axmSkillCompatibilityPolicy,
  }).pipe(Effect.orDie);
  const compatibilityAccessor = lintWorkspace.rule.axmSkillCompatibility;
  if (compatibilityAccessor === undefined) {
    return yield* Effect.die("AXM skill compatibility accessor was not constructed");
  }
  const axmSkillCompatibility = yield* compatibilityAccessor;
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
          recoveryAction:
            ws.scope === "project"
              ? `axm packs repair ${problem.pack} --preview`
              : commandForScope(`axm sync ${problem.pack} --preview`, ws.scope),
        };
      case "pack-canonical-unusable":
        return {
          code: problem.type,
          extensionType: "pack",
          identity: problem.pack,
          detail: `Canonical content is ${problem.status}${problem.path === undefined ? "" : ` at ${problem.path}`}`,
          blocking: true,
          recoveryAction:
            ws.scope === "project"
              ? `axm packs repair ${problem.pack} --preview`
              : commandForScope(`axm sync ${problem.pack} --preview`, ws.scope),
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
      const identity = node.identity.replace(/^workspace:/, "");
      if (node.type === "pack" && graphPackProblems.has(identity)) return [];
      const problem = canonicalHealthProblem(node, observation, ws.scope);
      return problem === undefined ? [] : [problem];
    },
  );
  const inventories = yield* Effect.forEach(
    extensionTypes,
    (type) => ws.records.getExtensionInventory(type, {}),
    { concurrency: 9 },
  );
  const inventoryByType = new Map(
    extensionTypes.map((type, index) => [type, inventories[index]?.items ?? []]),
  );
  const configuredAgents = yield* ws.getConfiguredAgents();
  const projectionProblems: ReadonlyArray<WorkspaceHealthProblem> = graph.nodes.flatMap((node) => {
    if (
      !node.enabled ||
      (node.type !== "skill" && node.type !== "mcp-server" && node.type !== "subagent")
    ) {
      return [];
    }
    const row = inventoryByType.get(node.type)?.find((item) => item.name === node.name);
    const current = projectionIsCurrent(node, row, configuredAgents);
    if (current) return [];
    const identity = node.identity.replace(/^workspace:/, "");
    return [
      {
        code: "stale-projection",
        extensionType: node.type,
        identity,
        detail: "One or more configured agent projections are missing or stale",
        blocking: true,
        recoveryAction: commandForScope(`axm sync ${identity} --preview`, ws.scope),
      },
    ];
  });
  const [lockedSkills, lockedPacks] = yield* Effect.all([
    ws.getLockedSkills(),
    ws.getLockedPacks(),
  ]);
  const receiptProblems = receiptOnlySkillProblems(graph, lockedSkills, lockedPacks, ws.scope);
  const compatibilityProblem = axmSkillCompatibilityProblem(axmSkillCompatibility, ws.scope);
  const problems = [
    ...graphProblems,
    ...canonicalProblems,
    ...projectionProblems,
    ...receiptProblems,
    ...(compatibilityProblem === undefined ? [] : [compatibilityProblem]),
  ];
  const blockingCount = problems.filter((problem) => problem.blocking).length;
  const advisoryCount = problems.length - blockingCount;
  const hasBlockingProblems = blockingCount > 0;
  const result = {
    healthy: problems.length === 0,
    desiredGraphComplete: graph.complete,
    scope: ws.scope,
    problems,
    blockedOperations: hasBlockingProblems
      ? ["global sync", "destructive pack reconciliation"]
      : [],
    axmSkillCompatibility,
  };
  if (!(yield* renderer.result(result, WorkspaceStatusSchema, { ok: !hasBlockingProblems }))) {
    yield* renderer.message(formatAxmSkillCompatibility(axmSkillCompatibility));
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
        [
          blockingCount === 0
            ? undefined
            : `${blockingCount} blocking workspace ${blockingCount === 1 ? "problem" : "problems"}`,
          advisoryCount === 0
            ? undefined
            : `${advisoryCount} workspace ${advisoryCount === 1 ? "advisory" : "advisories"}`,
        ]
          .filter((part) => part !== undefined)
          .join(", "),
      );
    }
  }
  if (hasBlockingProblems) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});

const statusConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Inspect project (default) or user-level workspace state"),
  ),
} as const;

export const statusCommand = Command.make("status", statusConfig, ({ scope }) =>
  handleStatus().pipe(withWorkspace(scope), withRuntime("status")),
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
