/**
 * Uninitialized-directory harness for setup-driven specifications.
 *
 * Setup constructs its own workspace, so this context provides only the
 * surrounding services over a bare temporary directory: a captured renderer,
 * recorded initialization prompts with canned answers, controlled flags, a
 * pinned user home, and no live agent-executable detection. The recorded
 * prompt state is the evidence channel for interaction claims; the recorded
 * file-system writes are the evidence channel for purity claims.
 *
 * The user home is pinned to a fresh temporary directory for the lifetime of
 * the context: user-scope setup writes beneath it, and coding-agent detection
 * reads its workstation markers from it, so neither the developer's real home
 * nor its installed agents reach a specification.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import {
  AgentExecutableResolver,
  RegistryUrl,
  TestFlagsLayer,
  TestMachineRenderer,
  TestRenderer,
  recordingFileSystemLayer,
  type FileSystemWriteEvent,
} from "axm.sh/specification-harness";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { WorkspaceInitializationInteractionTest } from "@agentxm/workspace-configuration/testing";
import {
  CodingAgentRepositoryLive,
  ExecutionDirectory,
  makeEffectProvide,
} from "axm.sh/specification-harness";

export interface SetupSpecContextOptions {
  /** Render through the machine (JSON) renderer instead of the human one. */
  readonly machine?: boolean;
  readonly flags?: {
    readonly nonInteractive?: boolean;
    readonly json?: boolean;
    readonly quiet?: boolean;
  };
  /** Canned answers for prompts the interactive flow is expected to raise. */
  readonly interaction?: {
    readonly selectAgents?: ReadonlyArray<string>;
    readonly confirmSetupPlan?: boolean;
  };
  /**
   * Record every mutating file-system call the application makes, so a
   * specification can show that an assessment attempted no write beneath its
   * protected state. The recorded events are returned as `writes`.
   */
  readonly recordWrites?: boolean;
}

const environmentWithHome = (home: string): Record<string, string> =>
  Object.fromEntries([
    ...Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
    ["HOME", home] as const,
    ["AXM_USER_HOME", home] as const,
    ["AXM_TELEMETRY", "0"] as const,
    ["AXM_REGISTRY_LOCATION", "https://registry.invalid"] as const,
  ]);

export const makeSetupSpecContext = (options: SetupSpecContextOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-setup-spec-")));
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-setup-spec-home-")));
  // Agent detection resolves the workstation home through the platform, which
  // reads the live environment; configuration reads a snapshot, so the pinned
  // home is supplied both ways and restored on cleanup.
  const previousHome = process.env["HOME"];
  process.env["HOME"] = home;
  const renderer = options.machine === true ? TestMachineRenderer.make() : TestRenderer.make();
  const interaction = WorkspaceInitializationInteractionTest({
    ...(options.interaction?.selectAgents === undefined
      ? {}
      : { selectAgents: () => Effect.succeed(options.interaction?.selectAgents ?? []) }),
    ...(options.interaction?.confirmSetupPlan === undefined
      ? {}
      : { confirmSetupPlan: () => Effect.succeed(options.interaction?.confirmSetupPlan === true) }),
  });
  const writes: Array<FileSystemWriteEvent> = [];
  const platformLayer =
    options.recordWrites === true
      ? Layer.provideMerge(
          recordingFileSystemLayer((event) => void writes.push(event)),
          NodeServices.layer,
        )
      : NodeServices.layer;
  const layer = Layer.mergeAll(
    platformLayer,
    FetchHttpClient.layer,
    CodingAgentRepositoryLive,
    renderer.layer,
    interaction.layer,
    TestFlagsLayer({
      nonInteractive: options.flags?.nonInteractive ?? false,
      json: options.flags?.json ?? options.machine === true,
      quiet: options.flags?.quiet ?? false,
    }),
    Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(root) }),
    Layer.succeed(RegistryUrl, "https://registry.invalid"),
    Layer.succeed(AgentExecutableResolver, {
      exists: () => Effect.succeed(false),
    }),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: environmentWithHome(home) })),
  );

  return {
    /** Absolute path of the bare directory setup runs against. */
    root,
    /** Absolute path of the pinned user home. */
    home,
    /** Absolute path of the user-scope workspace root beneath the pinned home. */
    userWorkspaceRoot: path.join(home, ".axm", "workspace"),
    layer,
    provide: makeEffectProvide(layer),
    rendererState: renderer.state,
    promptState: interaction.state,
    /** Every mutating file-system call recorded when `recordWrites` was requested. */
    writes,
    exists: (relativePath: string): boolean => fs.existsSync(path.join(root, relativePath)),
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
      if (previousHome === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = previousHome;
      }
    },
  };
};
