import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { CodingAgentRepository } from "@agentxm/extension-management/unstable/agents";
import {
  buildInstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  toLabelWithCompanions,
} from "@agentxm/extension-management/unstable/extensions";
import {
  ACQUIRED_EXTENSIONS_DIR,
  acquiredExtensionDisplayPath,
  type ExtensionRef,
  type HookExtensionRef,
  type KnowledgeExtensionRef,
  type McpServerExtensionRef,
  type RuleExtensionRef,
  type SkillExtensionRef,
  type SubagentExtensionRef,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import {
  type ExtensionType,
  type ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import { KnowledgeManager } from "@agentxm/extension-management/unstable/knowledge";
import { installMcpServer } from "@agentxm/extension-management/unstable/mcps";
import type { JobStepArtifact, PlannedJobStep } from "@agentxm/extension-management/unstable/plan";
import { RuleManager } from "@agentxm/extension-management/unstable/rules";
import { SkillManager } from "@agentxm/extension-management/unstable/skills";
import { SubagentManager } from "@agentxm/extension-management/unstable/subagents";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";

export type PackMemberRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

const registryPluralSegment = (type: ExtensionType): ExtensionTypePlural => {
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
  const sourcePath =
    args.ref.refType === "workspace"
      ? args.ref.location
      : acquiredExtensionDisplayPath(
          args.scope === "project" ? ACQUIRED_EXTENSIONS_DIR : ".axm/workspace/agent_extensions",
          args.ref,
          registryPluralSegment(args.ref.type),
          args.ref.name,
        );
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
  | HttpClient.HttpClient
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
    const httpClient = yield* HttpClient.HttpClient;
    const skillManager = yield* SkillManager;
    const subagentManager = yield* SubagentManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        | HttpClient.HttpClient
        | CodingAgentRepository
        | FileSystem.FileSystem
        | Path.Path
        | WorkspaceMutations
      >,
    ): Effect.Effect<A, E, never> =>
      Effect.provide(
        effect,
        Layer.mergeAll(
          Layer.succeed(WorkspaceMutations, ws),
          Layer.succeed(FileSystem.FileSystem, fs),
          Layer.succeed(Path.Path, path),
          Layer.succeed(CodingAgentRepository, agentRepo),
          Layer.succeed(HttpClient.HttpClient, httpClient),
        ),
      );
    const ref = args.ref;

    if (ref.type === "skill") {
      return buildInstallOperation<SkillExtensionRef>(skillManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        deferObservableValidation: true,
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
              nonInteractive: yield* isNonInteractiveOptional,
              force: false,
              versionRange: Option.none(),
              skipSettings: Option.some(true),
              strictAgentSync: Option.some(true),
              env: Option.none(),
            },
          }),
        ),
      };
      const warnings = extensionRefLifecycleWarnings(ref);
      const registryLifecycle = extensionRefRegistryLifecycle(ref);
      return warnings.length === 0
        ? ({
            ...base,
            readiness: "ready",
            ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
          } satisfies PlannedJobStep)
        : ({
            ...base,
            readiness: "warn",
            warnMessage: warnings.join("; "),
            ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
          } satisfies PlannedJobStep);
    }

    if (ref.type === "subagent") {
      return buildInstallOperation<SubagentExtensionRef>(subagentManager, {
        ref,
        versionRange: Option.none(),
        skipSettings: true,
        deferObservableValidation: true,
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
        skipProjections: true,
        deferObservableValidation: true,
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
        skipProjections: true,
        deferObservableValidation: true,
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
      skipProjections: true,
      deferObservableValidation: true,
      installedBefore: args.graphComplete
        ? knowledgeManager.isInstalled({
            target: { type: "knowledge", name: ref.knowledge.name },
          })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore }) =>
        Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
    });
  });
