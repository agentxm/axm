/**
 * Uninitialized-directory harness for setup-driven specifications.
 *
 * Setup constructs its own workspace, so this context provides only the
 * surrounding services over a bare temporary directory: a captured renderer,
 * recorded initialization prompts with canned answers, controlled flags, and
 * no live agent-executable detection. The recorded prompt state is the
 * evidence channel for interaction claims.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { AgentExecutableResolver } from "@agentxm/extension-management/unstable/agents";
import { RegistryUrl } from "@agentxm/extension-management/unstable/registry";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import {
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/extension-management/unstable/cli-renderer";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { WorkspaceInitializationInteractionTest } from "@agentxm/extension-management/unstable/workspace-configuration";
import { ExecutionDirectory, makeEffectProvide } from "axm.sh/specification-harness";

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
}

export const makeSetupSpecContext = (options: SetupSpecContextOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-setup-spec-")));
  const renderer = options.machine === true ? TestMachineRenderer.make() : TestRenderer.make();
  const interaction = WorkspaceInitializationInteractionTest({
    ...(options.interaction?.selectAgents === undefined
      ? {}
      : { selectAgents: () => Effect.succeed(options.interaction?.selectAgents ?? []) }),
    ...(options.interaction?.confirmSetupPlan === undefined
      ? {}
      : { confirmSetupPlan: () => Effect.succeed(options.interaction?.confirmSetupPlan === true) }),
  });
  const layer = Layer.mergeAll(
    NodeServices.layer,
    FetchHttpClient.layer,
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
  );

  return {
    /** Absolute path of the bare directory setup runs against. */
    root,
    layer,
    provide: makeEffectProvide(layer),
    rendererState: renderer.state,
    promptState: interaction.state,
    exists: (relativePath: string): boolean => fs.existsSync(path.join(root, relativePath)),
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};
