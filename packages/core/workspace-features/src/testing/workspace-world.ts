import { ArtifactHttpClient } from "@agentxm/workspace-kernel/sources";
/** Shared filesystem and service world for state-changing workspace fixtures. */

import { WorkspaceBoundaryClaimsTest } from "@agentxm/workspace-kernel/settlement/testing";

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { layer as WorkspaceLayerLive } from "@agentxm/workspace-kernel/workspace-state/live";
import {
  snapshotTree,
  withTestRegistryDefault,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import {
  HookManagerLive,
  KnowledgeManagerLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "@agentxm/extension-kinds/live";
import {
  ProjectionParticipantsLive,
  ConfiguredAgentOutcomesProviderLive,
} from "@agentxm/workspace-kernel/reconciliation/live";
import { AgentExecutableResolver } from "@agentxm/workspace-kernel/agent-adapters";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceInvariantFactsLive,
} from "@agentxm/workspace-kernel/projection/live";
import {
  AxmSkillCandidateGateLive,
  RegistryResolutionPolicyLive,
} from "@agentxm/workspace-kernel/resolution/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import {
  SourceHostProvidersLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-kernel/sources/live";
import { PlanInvocationTest } from "@agentxm/workspace-kernel/planning/testing";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";

export interface WorkspaceDirectoriesOptions {
  /** Borrow one coordinator for related workspaces; the supplying fixture owns cleanup. */
  readonly boundaryClaimsDirectory?: string | undefined;
  readonly prefix: string;
  readonly scope?: WorkspaceScope | undefined;
  readonly settings?: Readonly<Record<string, unknown>> | undefined;
  readonly lockfile?: Readonly<Record<string, unknown>> | undefined;
  readonly files?: Readonly<Record<string, string>> | undefined;
  readonly homeFiles?: Readonly<Record<string, string>> | undefined;
  /** Setup begins with bare directories; other fixtures begin with workspace roots. */
  readonly bare?: boolean | undefined;
}

/** A pinned home and project root with the workspace documents a test authored. */
export const makeWorkspaceDirectories = (options: WorkspaceDirectoriesOptions) => {
  const scope = options.scope ?? "project";
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), options.prefix)));
  const home = fs.realpathSync(
    fs.mkdtempSync(nodePath.join(os.tmpdir(), `${options.prefix}home-`)),
  );
  const boundaryClaimsDirectory =
    options.boundaryClaimsDirectory ??
    fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), `${options.prefix}claims-`)));
  const workspaceRoot = scope === "user" ? nodePath.join(home, ".axm", "workspace") : root;
  if (!options.bare) {
    fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
    fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });
  }

  const writeUnder =
    (base: string) =>
    (relativePath: string, contents: string): void => {
      const file = nodePath.join(base, relativePath);
      fs.mkdirSync(nodePath.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    };
  const writeFile = writeUnder(root);
  const writeHomeFile = writeUnder(home);
  const readFile = (relativePath: string): string =>
    fs.readFileSync(nodePath.join(root, relativePath), "utf8");
  const exists = (relativePath: string): boolean =>
    fs.existsSync(nodePath.join(root, relativePath));
  const remove = (relativePath: string): void => {
    fs.rmSync(nodePath.join(root, relativePath), { recursive: true, force: true });
  };
  const writeSettings = (settings: Readonly<Record<string, unknown>>): void => {
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm.json"),
      `${JSON.stringify({ agents: [], ...withTestRegistryDefault(settings) }, null, 2)}\n`,
    );
  };
  if (options.settings !== undefined) {
    writeSettings(options.settings);
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm-lock.yaml"),
      JSON.stringify({ lockfileVersion: 9, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(options.homeFiles ?? {})) {
    writeHomeFile(relativePath, contents);
  }

  return {
    boundaryClaimsDirectory,
    root,
    home,
    workspaceRoot,
    writeFile,
    writeHomeFile,
    readFile,
    exists,
    remove,
    writeSettings,
    readSettings: (): Readonly<Record<string, unknown>> => {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(nodePath.join(workspaceRoot, "axm.json"), "utf8"),
      );
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Expected the workspace settings document to be an object");
      }
      return { ...parsed };
    },
    snapshot: () => snapshotTree(root),
    homeSnapshot: () => snapshotTree(home),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
      if (options.boundaryClaimsDirectory === undefined)
        fs.rmSync(boundaryClaimsDirectory, { recursive: true, force: true });
    },
  };
};

export const refusingSourceProviders = Layer.succeed(SourceHostProviders, {
  find: () => Effect.succeed([]),
  resolveNamedRegistry: () => Effect.die("no named registry in this fixture"),
  fetch: () => Effect.die("no source fetch in this fixture"),
  acquireForTransition: () => Effect.die("no source acquisition in this fixture"),
  cloneUrl: () => Option.none(),
  origin: () => "fixture",
});

export const refusingHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(() => Effect.die("no HTTP request in this fixture")),
);

/** One projection and transport over the same workspace and test ports. */
export const makeWorkspaceWorld = <P>(
  options: WorkspaceDirectoriesOptions & {
    readonly installedExecutables?: ReadonlyArray<string> | undefined;
    readonly httpClient?: Layer.Layer<HttpClient.HttpClient> | undefined;
    /** Wrap the isolated configuration provider before workspace capture. */
    readonly configureConfigProvider?:
      ((provider: ConfigProvider.ConfigProvider) => ConfigProvider.ConfigProvider) | undefined;
    readonly ports: Layer.Layer<P>;
  },
) => {
  const directories = makeWorkspaceDirectories(options);
  const transport = options.httpClient ?? refusingHttpClient;
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const executables = Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
  });
  const isolatedConfig = ConfigProvider.fromEnv({ env: { AXM_USER_HOME: directories.home } });
  const base = Layer.provideMerge(
    Layer.provideMerge(
      Layer.mergeAll(
        CodingAgentRepositoryLive,
        NativeWriteAuthorityLive,
        transport,
        Layer.provide(Layer.effect(ArtifactHttpClient, HttpClient.HttpClient), transport),
        RegistryClientFactoryTest(transport),
        executables,
        PlanInvocationTest,
        options.ports,
      ),
      WorkspaceLayerLive({
        scope: options.scope ?? "project",
        projectRoot: decodeAbsolutePathSync(directories.root),
        allowUninitialized: options.settings === undefined,
      }).pipe(Layer.provide(WorkspaceBoundaryClaimsTest(directories.boundaryClaimsDirectory))),
    ),
    ConfigProvider.layer(options.configureConfigProvider?.(isolatedConfig) ?? isolatedConfig),
  );
  const projection = Layer.provideMerge(WorkspaceCatalogLive, base);
  return { ...directories, transport, projection };
};

export const withLiveSources = <P>(
  projection: ReturnType<typeof makeWorkspaceWorld<P>>["projection"],
  cliVersion: string,
) => {
  const sourceProviders = Layer.provide(
    SourceHostProvidersLive,
    Layer.mergeAll(
      projection,
      Layer.provide(AxmSkillCandidateGateLive, makeAxmSkillCompatibilityPolicyLayer(cliVersion)),
      RegistryResolutionPolicyLive,
    ),
  );
  return Layer.provideMerge(sourceProviders, projection);
};

/**
 * Every kind's manager over the given services. The leaf managers are
 * independent; the MCP and Pack managers drive their members through them.
 * The caller chooses where MCP credentials live.
 */
export const withKindManagers = <A, E, R>(services: Layer.Layer<A, E, R>) => {
  const leafManagers = Layer.provideMerge(
    Layer.mergeAll(
      RuleManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      SkillManagerLive,
      SubagentManagerLive,
    ),
    services,
  );
  return Layer.provideMerge(
    PackManagerLive,
    Layer.provideMerge(McpServerManagerLive, leafManagers),
  );
};

export const withAllManagers = <P>(layer: ReturnType<typeof withLiveSources<P>>) => {
  const managers = withKindManagers(layer);
  const observed = Layer.provideMerge(ConfiguredAgentOutcomesProviderLive, managers);
  const withParticipants = Layer.provideMerge(ProjectionParticipantsLive, observed);
  return Layer.provideMerge(WorkspaceInvariantFactsLive, withParticipants).pipe(
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
  );
};
