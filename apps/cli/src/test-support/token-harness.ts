/**
 * Token harness for the credential-export specifications.
 *
 * Composes the real login presenter over a captured renderer with in-memory
 * stand-ins for the Registry client and the credential store. A specification
 * chooses the interactivity and output mode and whether a session exists, then
 * reads the captured credential writes and stderr documents.
 */

import { RegistryContextTest } from "@agentxm/registry-client/testing";
import * as DateTime from "effect/DateTime";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  WorkloadCredentialsTest,
} from "@agentxm/registry-access/testing";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { AuthLoginPresenterLive } from "../auth-login-presenter.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { makeTestScreen } from "./test-screen.js";

const TOKEN_REGISTRY_URL = "https://registry.agentxm.ai";
export const SESSION_ACCESS_TOKEN = "axm_ses_fixture";

export interface TokenSpecContextOptions {
  /** A person at a terminal: stdout is a TTY and the invocation is interactive. */
  readonly interactive?: boolean;
  readonly json?: boolean;
  readonly signedIn?: boolean;
}

export const makeTokenSpecContext = (options: TokenSpecContextOptions = {}) => {
  const renderer = makeTestScreen({ machine: options.interactive !== true });
  const interaction = AuthLoginInteractionTest();

  const credentials =
    options.signedIn === false
      ? CredentialStoreTest("restricted-file")
      : CredentialStoreTest("restricted-file", {
          version: 1,
          registries: {
            [TOKEN_REGISTRY_URL]: {
              accounts: {
                [normalizeHandle("@alice")]: {
                  access_token: SESSION_ACCESS_TOKEN,
                  refresh_token: "axm_ref_fixture",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                  active: true,
                },
              },
            },
          },
        });

  const layer = Layer.mergeAll(
    renderer.layer,
    TestFlagsLayer({
      nonInteractive: options.interactive !== true,
      ...(options.json === undefined ? {} : { json: options.json }),
    }),
    credentials,
    WorkloadCredentialsTest(),
    AuthClientTest(),
    interaction.layer,
    Layer.provide(AuthLoginPresenterLive, Layer.mergeAll(renderer.layer, interaction.layer)),
    RegistryContextTest(TOKEN_REGISTRY_URL),
  );

  return {
    layer,
    state: renderer.state,
    stderr: () =>
      renderer.state.docs
        .filter((entry) => entry.channel === "stderr")
        .map((entry) => JSON.stringify(entry.doc))
        .join("\n"),
  };
};
