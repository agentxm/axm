import { WorkspaceTransactionScopesLive } from "../transitions/settlement/live.js";
/**
 * @agentxm/workspace/configuration deterministic fixtures and ports.
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

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";

import { AgentExecutableResolver } from "../projection/agent-adapters/index.js";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { RuleManagerLive } from "../materialization/live.js";
import {
  ResolvePlanInteractionTest,
  type ResolvePlanInteractionTestState,
} from "../transitions/planning/testing.js";
import { ProjectionParticipants, emptyProjectionParticipants } from "../projection/index.js";
import { CodingAgentRepositoryLive, WorkspaceInvariantFactsLive } from "../projection/live.js";

import {
  makeWorkspaceDirectories,
  makeWorkspaceWorld,
  refusingSourceProviders,
} from "../testing/workspace-world.js";
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
  const interaction = ResolvePlanInteractionTest();
  // Configuration owns a Rule manager but has no aggregate participant registry.
  const participants = Layer.succeed(ProjectionParticipants, emptyProjectionParticipants);
  const world = makeWorkspaceWorld({
    prefix: "axm-configuration-",
    scope: options.scope,
    settings: options.settings,
    lockfile: options.lockfile,
    files: options.files,
    homeFiles: options.homeFiles,
    installedExecutables: options.installedExecutables,
    ports: Layer.mergeAll(interaction.layer, participants, refusingSourceProviders),
  });
  const services = Layer.provideMerge(
    RuleManagerLive,
    Layer.provideMerge(WorkspaceInvariantFactsLive, world.projection),
  ).pipe(Layer.provideMerge(WorkspaceFileWriteLocksLive));
  const {
    root,
    home,
    workspaceRoot,
    writeFile,
    writeHomeFile,
    readFile,
    exists,
    snapshot,
    homeSnapshot,
    cleanup,
  } = world;

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    writeHomeFile,
    readFile,
    exists,
    /** Every file under the project root. */
    snapshot,
    /** Every file under the pinned user home. */
    homeSnapshot,
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: (): ResolvePlanInteractionTestState => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup,
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
  const directories = makeWorkspaceDirectories({
    prefix: "axm-setup-",
    bare: true,
    files: options.files,
    homeFiles: options.homeFiles,
  });
  const {
    root,
    home,
    writeFile,
    writeHomeFile,
    readFile,
    exists,
    snapshot,
    homeSnapshot,
    cleanup,
  } = directories;

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
    WorkspaceFileWriteLocksLive,
    WorkspaceTransactionScopesLive,
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
    readFile,
    exists,
    /** Every file under the bare project directory. */
    snapshot,
    /** Every file under the pinned user home. */
    homeSnapshot,
    /** What the initialization interaction port was asked. */
    promptState: () => interaction.state,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup,
  };
};

export type SetupFixture = ReturnType<typeof makeSetupFixture>;
