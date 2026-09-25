/**
 * Shared helpers for workspace inspection internal tests: a decode shortcut
 * and a Registry client factory for temporary workspaces.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { RegistryClientFactory } from "@agentxm/registry-client";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";
import { makeStubRegistryClient } from "./version-currency/test-stubs.js";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export const handle = (value: string): Handle => decodeHandleSync(value);

/**
 * The composition root's Registry client factory, answering from a fixed set
 * of extension indices. An assessment that reaches no registry gets an empty
 * set and never observes a client.
 */
export const RegistryClientFactoryTestLive = (
  indices: ReadonlyArray<ExtensionIndex> = [],
): Layer.Layer<RegistryClientFactory> =>
  Layer.sync(RegistryClientFactory, () => {
    const client = makeStubRegistryClient(indices);
    return {
      forLocation: () => Effect.succeed(client),
      forDefaultRegistry: Effect.succeed(client),
    };
  });
