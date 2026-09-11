/**
 * @agentxm/workspace-configuration deterministic fixtures and ports.
 *
 * A throwaway workspace with settings, lockfile, and agent-native files
 * written as the product writes them, plus every service a configuration use
 * case reads or writes through: the workspace state and its transaction
 * scope, the projection capability, the rule manager, and the plan pipeline's
 * per-invocation services with a recording interaction port. Production
 * source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { AgentExecutableResolver } from "@agentxm/agent-integration";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { RuleManagerLive } from "@agentxm/extension-materialization/live";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
  type ResolvePlanInteractionTestState,
} from "@agentxm/workspace-operations/testing";
import { ProjectionParticipants, emptyProjectionParticipants } from "@agentxm/workspace-projection";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
  WorkspaceInvariantFactsLive,
} from "@agentxm/workspace-projection/live";
import { layer as WorkspaceLayerLive } from "@agentxm/workspace-state/live";

import {
  WorkspaceInitializationInteractionTest,
  type WorkspaceInitializationInteractionTestState,
} from "./setup/initialization-interaction.js";

export { WorkspaceInitializationInteractionTest, type WorkspaceInitializationInteractionTestState };

export interface ConfigurationFixtureOptions {
  readonly scope?: WorkspaceScope;
  /** Settings document for the selected scope; written as authored. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Lockfile document for the selected scope; `lockfileVersion` is supplied. */
  readonly lockfile?: Readonly<Record<string, unknown>>;
  /** Extra files written into the project root, keyed by relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Extra files written into the pinned user home, keyed by relative path. */
  readonly homeFiles?: Readonly<Record<string, string>>;
  /**
   * Agent executables the machine reports as present. Detection consults this
   * alongside the workspace's own marker directories, so a fixture that leaves
   * it empty observes detection from workspace evidence alone.
   */
  readonly installedExecutables?: ReadonlyArray<string>;
}

/**
 * A throwaway workspace with every service a configuration use case needs
 * over it, and a pinned user home so a project-scope run can be shown to
 * leave the user scope alone.
 */
export const makeConfigurationFixture = (options: ConfigurationFixtureOptions = {}) => {
  const scope = options.scope ?? "project";
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-configuration-")));
  const home = fs.realpathSync(
    fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-configuration-home-")),
  );
  const workspaceRoot = scope === "user" ? nodePath.join(home, ".axm", "workspace") : root;
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });

  const writeUnder = (base: string) => (relativePath: string, contents: string) => {
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

  /** Every file, symlink, and directory under a root, so purity can be proven. */
  const snapshotUnder = (base: string): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(base, absolute);
        if (entry.isSymbolicLink()) {
          entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
          continue;
        }
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(absolute);
          continue;
        }
        entries.push([relative, fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(base);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  if (options.settings !== undefined) {
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm.json"),
      JSON.stringify({ agents: [], ...options.settings }, null, 2),
    );
    // JSON is valid YAML, so the lockfile fixture needs no emitter.
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm-lock.yaml"),
      JSON.stringify({ lockfileVersion: 7, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(options.homeFiles ?? {})) {
    writeHomeFile(relativePath, contents);
  }

  const interaction = ResolvePlanInteractionTest();
  const environment = ConfigProvider.layer(
    ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } }),
  );
  // Configuration flows never fetch a source; a fixture that could would be
  // describing a different use case.
  const sourceProviders = Layer.succeed(SourceHostProviders, {
    find: () => Effect.succeed([]),
    resolveNamedRegistry: () => Effect.die("no named registry in this fixture"),
    fetch: () => Effect.die("no source fetch in this fixture"),
    cloneUrl: () => Option.none(),
    origin: () => "fixture",
  });
  // No configuration flow reaches a network; a fixture that could would be
  // describing a different use case.
  const transport = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("no HTTP request in this fixture")),
  );
  // Configuration flows plan their own rule projection through the rule
  // manager; the aggregate participant registry is a reconciliation concern
  // these fixtures do not exercise, so it is present but empty.
  const participants = Layer.succeed(ProjectionParticipants, emptyProjectionParticipants);
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const executables = Layer.succeed(AgentExecutableResolver, {
    exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
  });
  // One environment, built outward: the workspace state and the ports over
  // it, then the projection services that read them, then the rule manager
  // that reads both. `provideMerge` keeps every layer's output in the result,
  // so a service a manager keeps in `R` is still there when it is reached.
  const base = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceLayerLive({
        scope,
        projectRoot: decodeAbsolutePathSync(root),
        allowUninitialized: options.settings === undefined,
      }),
      CodingAgentRepositoryLive,
      NativeWriteAuthorityLive,
      participants,
      sourceProviders,
      transport,
      interaction.layer,
      executables,
      PlanInvocationTest,
    ),
    environment,
  );
  const withProjection = Layer.provideMerge(
    Layer.mergeAll(WorkspaceInvariantFactsLive, WorkspaceCatalogLive),
    base,
  );
  const services = Layer.provideMerge(RuleManagerLive, withProjection);

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    writeHomeFile,
    readFile,
    exists,
    /** Every file under the project root. */
    snapshot: () => snapshotUnder(root),
    /** Every file under the pinned user home. */
    homeSnapshot: () => snapshotUnder(home),
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type ConfigurationFixture = ReturnType<typeof makeConfigurationFixture>;

export interface SetupFixtureOptions {
  /** Canned answers for the prompts an interactive setup raises. */
  readonly selectAgents?: ReadonlyArray<string>;
  readonly confirmSetupPlan?: boolean;
  readonly confirmInstructionSync?: boolean;
  /** Files written into the bare project directory before setup runs. */
  readonly files?: Readonly<Record<string, string>>;
  /** Files written into the pinned user home before setup runs. */
  readonly homeFiles?: Readonly<Record<string, string>>;
  /** Agent executables the machine reports as present. */
  readonly installedExecutables?: ReadonlyArray<string>;
}

/**
 * A bare directory and the services setup needs to turn it into a workspace.
 *
 * Setup builds its own workspace, so this fixture deliberately provides no
 * workspace state: only the platform-adjacent ports it reads — the pinned
 * user home, the coding-agent catalog and executable probe, and a recording
 * initialization-interaction port whose calls are the evidence channel for
 * every claim about what setup asked.
 */
export const makeSetupFixture = (options: SetupFixtureOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-setup-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-setup-home-")));

  const writeUnder = (base: string) => (relativePath: string, contents: string) => {
    const file = nodePath.join(base, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const writeFile = writeUnder(root);
  const writeHomeFile = writeUnder(home);
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }
  for (const [relativePath, contents] of Object.entries(options.homeFiles ?? {})) {
    writeHomeFile(relativePath, contents);
  }

  const snapshotUnder = (base: string): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(base, absolute);
        if (entry.isSymbolicLink()) {
          entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
          continue;
        }
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(absolute);
          continue;
        }
        entries.push([relative, fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(base);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  const interaction = WorkspaceInitializationInteractionTest({
    ...(options.selectAgents === undefined
      ? {}
      : { selectAgents: () => Effect.succeed(options.selectAgents ?? []) }),
    ...(options.confirmSetupPlan === undefined
      ? {}
      : { confirmSetupPlan: () => Effect.succeed(options.confirmSetupPlan ?? true) }),
    ...(options.confirmInstructionSync === undefined
      ? {}
      : { confirmInstructionSync: () => Effect.succeed(options.confirmInstructionSync ?? true) }),
  });
  const installedExecutables = new Set(options.installedExecutables ?? []);
  const services = Layer.mergeAll(
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home, HOME: home } })),
    CodingAgentRepositoryLive,
    Layer.succeed(AgentExecutableResolver, {
      exists: (name: string) => Effect.succeed(installedExecutables.has(name)),
    }),
    interaction.layer,
  );

  return {
    root,
    home,
    writeFile,
    writeHomeFile,
    readFile: (relativePath: string): string =>
      fs.readFileSync(nodePath.join(root, relativePath), "utf8"),
    exists: (relativePath: string): boolean => fs.existsSync(nodePath.join(root, relativePath)),
    /** Every file under the bare project directory. */
    snapshot: () => snapshotUnder(root),
    /** Every file under the pinned user home. */
    homeSnapshot: () => snapshotUnder(home),
    /** What the initialization interaction port was asked. */
    promptState: () => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type SetupFixture = ReturnType<typeof makeSetupFixture>;
