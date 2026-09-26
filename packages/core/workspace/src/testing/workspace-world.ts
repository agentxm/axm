/** Shared filesystem and service world for state-changing workspace fixtures. */

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

import { layer as WorkspaceLayerLive } from "../desired-state/live.js";
import { snapshotTree, withTestRegistryDefault } from "../desired-state/testing.js";
import {
  HookManagerLive,
  KnowledgeManagerLive,
  McpSecretStoreLive,
  McpServerManagerLive,
  PackManagerLive,
  ProjectionParticipantsLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "../materialization/live.js";
import { AgentExecutableResolver } from "../projection/agent-adapters/index.js";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
  WorkspaceInvariantFactsLive,
} from "../projection/live.js";
import { AxmSkillCandidateGateLive, RegistryResolutionPolicyLive } from "../resolution/live.js";
import { SourceHostProviders } from "../resolution/sources/index.js";
import { SourceHostProvidersLive } from "../resolution/sources/live.js";
import { PlanInvocationTest } from "../transitions/planning/testing.js";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";

export interface WorkspaceDirectoriesOptions {
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
      JSON.stringify({ lockfileVersion: 8, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(options.homeFiles ?? {})) {
    writeHomeFile(relativePath, contents);
  }

  return {
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
    readonly ports: Layer.Layer<P>;
  },
) => {
  const directories = makeWorkspaceDirectories(options);
  const transport = options.httpClient ?? refusingHttpClient;
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const executables = Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
  });
  const base = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceLayerLive({
        scope: options.scope ?? "project",
        projectRoot: decodeAbsolutePathSync(directories.root),
        allowUninitialized: options.settings === undefined,
      }),
      CodingAgentRepositoryLive,
      NativeWriteAuthorityLive,
      transport,
      RegistryClientFactoryTest(transport),
      executables,
      PlanInvocationTest,
      options.ports,
    ),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: directories.home } })),
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

export const withAllManagers = <P>(layer: ReturnType<typeof withLiveSources<P>>) => {
  const leafManagers = Layer.provideMerge(
    Layer.mergeAll(
      RuleManagerLive,
      HookManagerLive,
      KnowledgeManagerLive,
      SkillManagerLive,
      SubagentManagerLive,
      McpSecretStoreLive,
    ),
    layer,
  );
  const withMcp = Layer.provideMerge(McpServerManagerLive, leafManagers);
  const withPack = Layer.provideMerge(PackManagerLive, withMcp);
  const withParticipants = Layer.provideMerge(ProjectionParticipantsLive, withPack);
  return Layer.provideMerge(WorkspaceInvariantFactsLive, withParticipants).pipe(
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
  );
};
