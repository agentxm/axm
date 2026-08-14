import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import {
  REGISTRY_EXTENSIONS_DIR,
  buildInstallOperation,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
  type ExtensionRef,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import {
  KnowledgeManager,
  type KnowledgeExtensionRef,
} from "@agentxm/client-core/unstable/knowledge";
import { installMcpServer, type McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import type { JobStepArtifact, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";

export type PackMemberRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

const registryPluralSegment = (type: ExtensionType): string => {
  switch (type) {
    case "skill":
      return "skills";
    case "pack":
      return "packs";
    case "mcp-server":
      return "mcps";
    case "subagent":
      return "subagents";
    case "rule":
      return "rules";
    case "hook":
      return "hooks";
    case "knowledge":
      return "knowledge";
  }
};

const registrySourceArtifact = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
}): JobStepArtifact => {
  const change =
    args.ref.refType === "workspace" ? "unchanged" : args.installedBefore ? "updated" : "created";
  const target = targetFromRef(args.ref);
  const sourcePath =
    args.ref.refType === "registry"
      ? `${REGISTRY_EXTENSIONS_DIR}/${args.ref.owner}/${registryPluralSegment(args.ref.type)}/${
          args.ref.name
        }`
      : args.ref.refType === "workspace"
        ? args.ref.location
        : toLabel(target);
  return {
    path: sourcePath,
    scope: args.scope,
    ...(args.ref.refType === "registry" || args.ref.refType === "workspace"
      ? { version: args.ref.version }
      : {}),
    change,
    fileCount: 1,
    targets: [{ path: sourcePath, change }],
  };
};

const registrySourceArtifactWithCoverage = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
  readonly materialization: Effect.Effect<
    {
      readonly agents: ReadonlyArray<string>;
      readonly targets: ReadonlyArray<{
        readonly path: string;
        readonly agentIds?: ReadonlyArray<string>;
      }>;
    },
    never
  >;
}) =>
  Effect.gen(function* () {
    const artifact = registrySourceArtifact(args);
    const materialization = yield* args.materialization;
    return { ...artifact, agents: materialization.agents } satisfies JobStepArtifact;
  });

export const buildPackMemberInstallStep = (args: {
  readonly ref: PackMemberRef;
  readonly graphComplete: boolean;
}): Effect.Effect<
  PlannedJobStep,
  never,
  | CodingAgentRepository
  | FileSystem.FileSystem
  | HookManager
  | KnowledgeManager
  | Path.Path
  | RuleManager
  | SkillManager
  | SubagentManager
  | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const skillManager = yield* SkillManager;
    const subagentManager = yield* SubagentManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        CodingAgentRepository | FileSystem.FileSystem | Path.Path | WorkspaceMutations
      >,
    ): Effect.Effect<A, E, never> =>
      Effect.provide(
        effect,
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          Layer.succeed(FileSystem.FileSystem, fs),
          Layer.succeed(Path.Path, path),
          Layer.succeed(CodingAgentRepository, agentRepo),
        ),
      );
    const ref = args.ref;

    if (ref.type === "skill") {
      return buildInstallOperation<SkillExtensionRef>(skillManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        installedBefore: args.graphComplete
          ? skillManager.isInstalled({ target: { type: "skill", name: ref.skill.name } })
          : Effect.succeed(false),
        buildArtifact: ({ installedBefore }) =>
          registrySourceArtifactWithCoverage({
            ref,
            scope: ws.scope,
            installedBefore,
            materialization:
              skillManager.getLastMaterialization === undefined
                ? Effect.succeed({ agents: [], targets: [] })
                : skillManager.getLastMaterialization({
                    target: { type: "skill", name: ref.skill.name },
                  }),
          }),
      });
    }

    if (ref.type === "mcp-server") {
      const base = {
        key: `mcp-server:${ref.server.name}`,
        label: toLabelWithCompanions(
          { type: "mcp-server", name: ref.server.name },
          ref.refType === "registry" ? ref.packages : [],
        ),
        run: provide(
          installMcpServer({
            name: "install-mcp-server",
            args: {
              ref,
              force: false,
              versionRange: Option.none(),
              skipSettings: Option.some(true),
              strictAgentSync: Option.some(true),
              env: Option.none(),
            },
          }),
        ),
      };
      const warnings = ref.refType === "registry" ? (ref.lifecycleWarnings ?? []) : [];
      return warnings.length === 0
        ? ({ ...base, readiness: "ready" } satisfies PlannedJobStep)
        : ({
            ...base,
            readiness: "warn",
            warnMessage: warnings.join("; "),
          } satisfies PlannedJobStep);
    }

    if (ref.type === "subagent") {
      return buildInstallOperation<SubagentExtensionRef>(subagentManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        installedBefore: args.graphComplete
          ? subagentManager.isInstalled({
              target: { type: "subagent", name: ref.subagent.name },
            })
          : Effect.succeed(false),
        buildArtifact: ({ installedBefore }) =>
          registrySourceArtifactWithCoverage({
            ref,
            scope: ws.scope,
            installedBefore,
            materialization:
              subagentManager.getLastMaterialization === undefined
                ? Effect.succeed({ agents: [], targets: [] })
                : subagentManager.getLastMaterialization({
                    target: { type: "subagent", name: ref.subagent.name },
                  }),
          }),
      });
    }

    if (ref.type === "rule") {
      return buildInstallOperation<RuleExtensionRef>(ruleManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        installedBefore: args.graphComplete
          ? ruleManager.isInstalled({ target: { type: "rule", name: ref.rule.name } })
          : Effect.succeed(false),
        buildArtifact: ({ installedBefore }) =>
          registrySourceArtifactWithCoverage({
            ref,
            scope: ws.scope,
            installedBefore,
            materialization:
              ruleManager.getLastMaterialization === undefined
                ? Effect.succeed({ agents: [], targets: [] })
                : ruleManager.getLastMaterialization({
                    target: { type: "rule", name: ref.rule.name },
                  }),
          }),
      });
    }

    if (ref.type === "hook") {
      return buildInstallOperation<HookExtensionRef>(hookManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        installedBefore: args.graphComplete
          ? hookManager.isInstalled({ target: { type: "hook", name: ref.hook.name } })
          : Effect.succeed(false),
        buildArtifact: ({ installedBefore }) =>
          registrySourceArtifactWithCoverage({
            ref,
            scope: ws.scope,
            installedBefore,
            materialization:
              hookManager.getLastMaterialization === undefined
                ? Effect.succeed({ agents: [], targets: [] })
                : hookManager.getLastMaterialization({
                    target: { type: "hook", name: ref.hook.name },
                  }),
          }),
      });
    }

    return buildInstallOperation<KnowledgeExtensionRef>(knowledgeManager, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: args.graphComplete
        ? knowledgeManager.isInstalled({
            target: { type: "knowledge", name: ref.knowledge.name },
          })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore }) =>
        Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
    });
  });
