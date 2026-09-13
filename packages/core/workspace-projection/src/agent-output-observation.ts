/**
 * Read-only inventory of agent-native outputs and their ownership proofs.
 *
 * Output containers may be shared by several coding agents. An output is
 * desired when at least one claimant for its resolved container is desired and
 * its managed unit name is expected for that extension type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  resolveWorkspaceExtensionRef,
  type SkillEntry,
  type WorkspaceLayout,
} from "@agentxm/workspace-state";
import { AGENTS as CAPABILITY_AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  ExtensionNameSchema,
  type PerAgentType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import {
  extensionNameFromFilename,
  hasAxmManagedMarker,
  safeReadDirectory,
  safeReadFileString,
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";
import { collectManagedAgentMcpServers } from "./mcps/inspection.js";
import { readAmbiguousHookCommands, readManagedHookUnits } from "@agentxm/agent-integration";

export type AgentOutputOwnershipProof =
  "storage-root-symlink" | "managed-banner" | "managed-mcp-entry" | "managed-hook-group";

export interface AgentOutputObservation {
  readonly extensionType: PerAgentType;
  readonly containerPath: string;
  readonly path: string;
  readonly entryName: string;
  readonly claimantAgentIds: ReadonlyArray<string>;
  readonly ownership: "owned" | "unowned";
  readonly proof?: AgentOutputOwnershipProof;
  readonly desired: boolean;
}

export interface AgentOutputInventory {
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
  readonly ownedResidue: ReadonlyArray<AgentOutputObservation>;
  readonly unownedFootprints: ReadonlyArray<AgentOutputObservation>;
}

export interface ObserveAgentOutputsArgs {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly desiredAgentIds: ReadonlySet<string>;
  readonly expectedNames: Readonly<Record<PerAgentType, ReadonlySet<string>>>;
  readonly skillOwnershipRoots: ReadonlyArray<string>;
  /**
   * The layout whose skill authoring folder holds authored packages, and local
   * declarations (including disabled skills) that mark bundled entries.
   */
  readonly authoredSkills: {
    readonly layout: WorkspaceLayout;
    readonly entries: Readonly<Record<string, SkillEntry>>;
  };
}

interface ResolvedContainer {
  readonly path: string;
  readonly agentId: string;
}

const isWithin = (path: Path.Path, parent: string, child: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const groupContainers = (
  containers: ReadonlyArray<ResolvedContainer>,
): ReadonlyArray<{ readonly path: string; readonly claimantAgentIds: ReadonlyArray<string> }> => {
  const grouped = new Map<string, Set<string>>();
  for (const container of containers) {
    const claimants = grouped.get(container.path) ?? new Set<string>();
    claimants.add(container.agentId);
    grouped.set(container.path, claimants);
  }
  return [...grouped].map(([path, claimants]) => ({
    path,
    claimantAgentIds: [...claimants].sort(),
  }));
};

const containerIsDesired = (
  claimantAgentIds: ReadonlyArray<string>,
  desiredAgentIds: ReadonlySet<string>,
): boolean => claimantAgentIds.some((agentId) => desiredAgentIds.has(agentId));

/**
 * A valid authored package — declared or not — is authored source, never an
 * agent output eligible for retirement or an unowned footprint.
 */
const isAuthoredSkillPackage = (
  args: ObserveAgentOutputsArgs["authoredSkills"],
  artifactPath: string,
  name: string,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (
      args.layout.scope !== "project" ||
      args.entries[name]?.origin === "bundled" ||
      !Schema.is(ExtensionNameSchema)(name) ||
      artifactPath !== path.join(args.layout.authoredRoot("skill"), name)
    )
      return false;

    // Failed validation supplies no exclusion: a lookalike remains visible to
    // ownership diagnostics and the package's own canonical-content diagnostics.
    const source = yield* resolveWorkspaceExtensionRef({
      settingsName: name,
      source: "workspace",
      expectedType: "skill",
      layout: args.layout,
      scope: args.layout.scope,
    }).pipe(Effect.option);
    return Option.isSome(source);
  });

/** Observe every known agent output without writing to the workspace. */
export const observeAgentOutputs = (
  args: ObserveAgentOutputsArgs,
): Effect.Effect<
  AgentOutputInventory,
  never,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const agents = yield* agentRepo.all;
    const outputs: Array<AgentOutputObservation> = [];
    const ownershipRoots = yield* Effect.forEach(args.skillOwnershipRoots, (root) =>
      fs.realPath(root).pipe(Effect.orElseSucceed(() => path.resolve(root))),
    );

    const skillContainers = yield* Effect.forEach(agents, (agent) =>
      agent.resolveEffectiveSkillsDir({ workspaceRoot: args.workspaceRoot }).pipe(
        Effect.map((resolved) =>
          resolved._tag === "supported"
            ? [{ path: path.resolve(resolved.dir), agentId: agent.id }]
            : [],
        ),
        Effect.catch(() => Effect.succeed<ReadonlyArray<ResolvedContainer>>([])),
      ),
    ).pipe(Effect.map((containers) => containers.flat()));

    for (const container of groupContainers(skillContainers)) {
      const desiredContainer = containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* safeReadDirectory(fs, container.path)) {
        const artifactPath = path.join(container.path, entry);
        const linkTarget = yield* fs.readLink(artifactPath).pipe(Effect.option);
        let proof: AgentOutputOwnershipProof | undefined;
        if (linkTarget._tag === "Some") {
          const resolvedTarget = path.resolve(container.path, linkTarget.value);
          const canonicalTarget = yield* fs
            .realPath(resolvedTarget)
            .pipe(Effect.orElseSucceed(() => resolvedTarget));
          if (ownershipRoots.some((root) => isWithin(path, root, canonicalTarget))) {
            proof = "storage-root-symlink";
          }
        } else {
          const stat = yield* fs.stat(artifactPath).pipe(Effect.option);
          if (stat._tag === "Some" && stat.value.type === "Directory") {
            if (yield* isAuthoredSkillPackage(args.authoredSkills, artifactPath, entry)) continue;
            const content = yield* safeReadFileString(fs, path.join(artifactPath, "SKILL.md"));
            if (hasAxmManagedMarker(content)) proof = "managed-banner";
          }
        }
        outputs.push({
          extensionType: "skill",
          containerPath: container.path,
          path: artifactPath,
          entryName: entry,
          claimantAgentIds: container.claimantAgentIds,
          ownership: proof === undefined ? "unowned" : "owned",
          ...(proof === undefined ? {} : { proof }),
          desired: desiredContainer && args.expectedNames.skill.has(entry),
        });
      }
    }

    const subagentContainers = yield* Effect.forEach(agents, (agent) =>
      agent
        .resolveEffectiveSubagentsDir({ workspaceRoot: args.workspaceRoot, scope: args.scope })
        .pipe(
          Effect.map((resolved) =>
            resolved._tag === "supported"
              ? [{ path: path.resolve(resolved.dir), agentId: agent.id }]
              : [],
          ),
          Effect.catch(() => Effect.succeed<ReadonlyArray<ResolvedContainer>>([])),
        ),
    ).pipe(Effect.map((containers) => containers.flat()));

    for (const container of groupContainers(subagentContainers)) {
      const desiredContainer = containerIsDesired(container.claimantAgentIds, args.desiredAgentIds);
      for (const entry of yield* safeReadDirectory(fs, container.path)) {
        const artifactPath = path.join(container.path, entry);
        const stat = yield* fs.stat(artifactPath).pipe(Effect.option);
        if (stat._tag === "None" || stat.value.type !== "File") continue;
        const content = yield* safeReadFileString(fs, artifactPath);
        const managed = hasAxmManagedMarker(content);
        const entryName = extensionNameFromFilename(entry);
        outputs.push({
          extensionType: "subagent",
          containerPath: container.path,
          path: artifactPath,
          entryName,
          claimantAgentIds: container.claimantAgentIds,
          ownership: managed ? "owned" : "unowned",
          ...(managed ? { proof: "managed-banner" } : {}),
          desired: desiredContainer && args.expectedNames.subagent.has(entryName),
        });
      }
    }

    const capabilityAgentIds = CAPABILITY_AGENTS.map(({ id }) => id);
    const managedMcpServers = yield* collectManagedAgentMcpServers({
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      agentIds: capabilityAgentIds,
    }).pipe(Effect.catch(() => Effect.succeed([])));
    const mcpGroups = new Map<
      string,
      { readonly path: string; readonly name: string; readonly claimants: Set<string> }
    >();
    for (const server of managedMcpServers) {
      const key = `${server.absolutePath}\u0000${server.serverName}`;
      const group = mcpGroups.get(key) ?? {
        path: server.absolutePath,
        name: server.serverName,
        claimants: new Set<string>(),
      };
      group.claimants.add(server.agentId);
      mcpGroups.set(key, group);
    }
    for (const group of mcpGroups.values()) {
      const claimants = [...group.claimants].sort();
      outputs.push({
        extensionType: "mcp-server",
        containerPath: group.path,
        path: `${group.path}#${group.name}`,
        entryName: group.name,
        claimantAgentIds: claimants,
        ownership: "owned",
        proof: "managed-mcp-entry",
        desired:
          containerIsDesired(claimants, args.desiredAgentIds) &&
          args.expectedNames["mcp-server"].has(group.name),
      });
    }

    const hookContainers = new Map<
      string,
      { readonly path: string; readonly settingsKey: string; readonly claimants: Set<string> }
    >();
    for (const agent of CAPABILITY_AGENTS) {
      const writer = agent.capabilities.hook.axm.writer;
      if (writer === null) continue;
      for (const file of writer.configFiles.filter(
        (candidate) => candidate.scope === args.scope && candidate.format === "json",
      )) {
        const configPath = path.resolve(args.workspaceRoot, file.path);
        const key = `${configPath}\u0000${writer.settingsKey}`;
        const group = hookContainers.get(key) ?? {
          path: configPath,
          settingsKey: writer.settingsKey,
          claimants: new Set<string>(),
        };
        group.claimants.add(agent.id);
        hookContainers.set(key, group);
      }
    }
    for (const group of hookContainers.values()) {
      const exists = yield* fs.exists(group.path).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) continue;
      const raw = yield* safeReadFileString(fs, group.path);
      const claimants = [...group.claimants].sort();
      const units = yield* readManagedHookUnits(group.path, group.settingsKey, raw).pipe(
        Effect.catch(() => Effect.succeed([])),
      );
      for (const unit of units) {
        outputs.push({
          extensionType: "hook",
          containerPath: group.path,
          path: `${group.path}#${unit.name}`,
          entryName: unit.name,
          claimantAgentIds: claimants,
          ownership: "owned",
          proof: "managed-hook-group",
          desired:
            containerIsDesired(claimants, args.desiredAgentIds) &&
            args.expectedNames.hook.has(unit.name),
        });
      }
      const ambiguous = yield* readAmbiguousHookCommands(group.path, group.settingsKey, raw).pipe(
        Effect.catch(() => Effect.succeed([])),
      );
      for (const command of ambiguous) {
        outputs.push({
          extensionType: "hook",
          containerPath: group.path,
          path: group.path,
          entryName: command,
          claimantAgentIds: claimants,
          ownership: "unowned",
          desired: false,
        });
      }
    }

    return {
      outputs,
      ownedResidue: outputs.filter((output) => output.ownership === "owned" && !output.desired),
      unownedFootprints: outputs.filter((output) => output.ownership === "unowned"),
    };
  });

/**
 * The ownership problems a workspace's agent-native outputs present, with no
 * expectation of what should be there.
 *
 * Reporting ownership is a different question from reconciling it: the
 * reporter must not need a desired graph, because the workspaces most in need
 * of the answer are the ones whose desired state cannot be resolved. Every
 * expected-name set is therefore empty, and the answer is only about proof —
 * a file that sits where AXM writes but carries no ownership marker, and a
 * hook command pointed at an AXM canonical path without one.
 */
export const observeWorkspaceOwnershipIssues = (args: {
  readonly workspaceRoot: string;
  readonly scope: WorkspaceScope;
  readonly configuredAgentIds: ReadonlySet<string>;
  readonly skillOwnershipRoots: ReadonlyArray<string>;
  readonly authoredSkills: ObserveAgentOutputsArgs["authoredSkills"];
}): Effect.Effect<
  ReadonlyArray<WorkspaceOwnershipIssue>,
  never,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  observeAgentOutputs({
    workspaceRoot: args.workspaceRoot,
    scope: args.scope,
    desiredAgentIds: args.configuredAgentIds,
    expectedNames: {
      skill: new Set<string>(),
      subagent: new Set<string>(),
      "mcp-server": new Set<string>(),
      hook: new Set<string>(),
    },
    skillOwnershipRoots: args.skillOwnershipRoots,
    authoredSkills: args.authoredSkills,
  }).pipe(
    Effect.map((observed) =>
      observed.unownedFootprints.map((output) => ({
        kind:
          output.extensionType === "hook"
            ? ("hook-ownership-ambiguous" as const)
            : ("managed-file-unowned" as const),
        path: output.path,
        detail:
          output.extensionType === "hook"
            ? `Hook command targets an AXM canonical extension path without x-axm ownership metadata: ${output.entryName}`
            : `Agent ${output.extensionType} artifact has no AXM ownership proof.`,
      })),
    ),
  );
