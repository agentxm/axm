/**
 * Token harness for the credential-export specifications.
 *
 * Composes the real login presenter over a captured renderer with in-memory
 * stand-ins for the Registry's token endpoints and the credential store. A
 * specification chooses the interactivity and output mode, whether a session
 * exists, and whether stdout acknowledges the credential, then reads the
 * captured credential writes, stderr documents, and Registry calls.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
} from "@agentxm/registry-access/testing";
import { type AuthError } from "@agentxm/registry-access/authentication";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { RegistryUrl } from "@agentxm/registry-client";
import { AuthLoginPresenterLive } from "../auth-login-presenter.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { CredentialDeliveryFailed, Screen } from "../screen/index.js";
import { TestMachineRenderer, TestRenderer } from "./presenter-test.js";

export const TOKEN_REGISTRY_URL = "https://registry.agentxm.ai";
export const SESSION_ACCESS_TOKEN = "axm_ses_fixture";
export const ISSUED_TOKEN_ID = "token_fixture";
export const ISSUED_TOKEN_SECRET = "axmt_fixture_secret";

export const issuedToken = {
  id: ISSUED_TOKEN_ID,
  token: ISSUED_TOKEN_SECRET,
  name: "ci",
  permissions: { model: "gat", owners: [], extensions: [], permission: "read" },
  createdAt: DateTime.makeUnsafe("2026-05-15T00:00:00.000Z"),
  expiresAt: DateTime.makeUnsafe("2026-06-14T00:00:00.000Z"),
} as const;

export interface TokenSpecContextOptions {
  /** A person at a terminal: stdout is a TTY and the invocation is interactive. */
  readonly interactive?: boolean;
  readonly json?: boolean;
  readonly signedIn?: boolean;
  /** Stdout refuses the credential write. */
  readonly failDelivery?: boolean;
  /** Stdout never acknowledges the credential write, so only interruption ends it. */
  readonly stallDelivery?: boolean;
  readonly revoke?: (tokenId: string) => Effect.Effect<void, AuthError>;
}

export const makeTokenSpecContext = (options: TokenSpecContextOptions = {}) => {
  const renderer = options.interactive === true ? TestRenderer.make() : TestMachineRenderer.make();
  const creations: Array<string> = [];
  const revocations: Array<string> = [];
  const interaction = AuthLoginInteractionTest();

  const delivery =
    options.failDelivery === true
      ? Effect.fail(new CredentialDeliveryFailed({ cause: new Error("EPIPE") }))
      : options.stallDelivery === true
        ? Effect.never
        : undefined;
  const screen =
    delivery === undefined
      ? renderer.layer
      : Layer.effect(
          Screen,
          Effect.gen(function* () {
            const live = yield* Screen;
            return { ...live, credential: () => delivery };
          }),
        ).pipe(Layer.provide(renderer.layer));

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
    screen,
    TestFlagsLayer({
      nonInteractive: options.interactive !== true,
      ...(options.json === undefined ? {} : { json: options.json }),
    }),
    credentials,
    AuthClientTest({
      createToken: (params) =>
        Effect.sync(() => {
          creations.push(params.name);
          return { ...issuedToken, name: params.name };
        }),
      deleteToken: (tokenId) =>
        Effect.suspend(() => {
          revocations.push(tokenId);
          return options.revoke?.(tokenId) ?? Effect.void;
        }),
    }),
    interaction.layer,
    Layer.provide(AuthLoginPresenterLive, Layer.mergeAll(screen, interaction.layer)),
    Layer.succeed(RegistryUrl, TOKEN_REGISTRY_URL),
  );

  return {
    layer,
    state: renderer.state,
    creations,
    revocations,
    stderr: () =>
      renderer.state.docs
        .filter((entry) => entry.channel === "stderr")
        .map((entry) => JSON.stringify(entry.doc))
        .join("\n"),
  };
};
