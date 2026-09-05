import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { exactVersion, extensionName, handle } from "./test-helpers.js";
import { RegistryAuthFailed, type AuthError } from "./errors.js";

const asAuthFailed = (error: AuthError): RegistryAuthFailed => {
  if (error instanceof RegistryAuthFailed) return error;
  throw new Error(`Expected RegistryAuthFailed, got ${error._tag}`);
};
import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";
import type {
  CreatePublishAuthorizationRequestParams,
  PublishAuthorizationExchangeResponse,
  PublishCapabilityResponse,
} from "./auth-client.js";
import { AuthClientTest } from "./auth-client.js";
import { DeviceLoginInteractionTest } from "./device-login.js";
import { AuthLoginPresenterTest } from "./login-presenter.js";
import { runPublishAuthorization } from "./publish-authorization.js";

const archive = new TextEncoder().encode("exact archive bytes");
const descriptor = {
  target: {
    owner: handle("@alice"),
    type: "skill" as const,
    name: extensionName("review"),
    version: exactVersion("1.2.3"),
  },
  participation: "publish" as const,
  archiveSha256Hex: archiveSha256Hex(archive),
  visibility: { intent: null, request: "private" as const },
};
const input = {
  registryUrl: "https://registry.agentxm.ai",
  publicationSet: {
    contract: PUBLICATION_SET_CONTRACT,
    candidates: [descriptor],
  },
};
const admittedPreview = {
  contract: PUBLICATION_SET_CONTRACT,
  publicationSetDigest: publicationSetDigest([descriptor]),
  status: "admitted" as const,
  candidates: [
    {
      kind: "resolved" as const,
      target: descriptor.target,
      participation: descriptor.participation,
      descriptorDigest: publicationDescriptorDigest(descriptor),
      visibility: {
        target: "@alice/skills/review",
        intent: null,
        request: "private" as const,
        resolved: {
          value: "private" as const,
          disposition: "establish" as const,
          source: "explicit" as const,
        },
        actual: null,
        comparison: "not-established" as const,
        findings: [],
      },
      condition: '"pv2-reviewed"',
    },
  ],
  packs: [],
};

const scheduleCallback = (url: string) => {
  setTimeout(() => {
    const request = NodeHttp.get(url, (response) => response.resume());
    request.on("error", () => undefined);
  }, 10);
};

describe("runPublishAuthorization", () => {
  it.effect("binds the exact archive and returns the in-memory capability", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          if (created === undefined) return false;
          const callback = new URL(created.redirectUri);
          callback.searchParams.set("code", "axm_pubac_code");
          callback.searchParams.set("state", created.state);
          callback.searchParams.set("iss", "https://agentxm.ai");
          scheduleCallback(callback.href);
          return true;
        }),
    });
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: (params) => {
        created = params;
        return Effect.succeed({
          requestId: "pubreq_test",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_test",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        });
      },
      exchangePublishAuthorizationCode: (params) =>
        Effect.succeed({
          status: "admitted",
          preview: admittedPreview,
          grants: [
            {
              accessToken: "axm_pub_capability",
              expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
              scope: "extensions:publish:version",
              publishRequestId: "pubreq_test",
              visibilityContract: "v2",
              visibility: {
                value: "private",
                disposition: "establish",
                source: "explicit",
              },
              condition: '"pv2-reviewed"',
              publicationSetDigest: publicationSetDigest([descriptor]),
              publicationDescriptorDigest: publicationDescriptorDigest(descriptor),
            } satisfies PublishCapabilityResponse,
          ],
        } satisfies PublishAuthorizationExchangeResponse).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              expect(params.code).toBe("axm_pubac_code");
              expect(params.redirectUri).toBe(created?.redirectUri);
            }),
          ),
        ),
    });
    const layer = Layer.mergeAll(presenter.layer, interaction.layer, authClient);

    return runPublishAuthorization(input).pipe(
      Effect.provide(layer),
      Effect.map((exchange) => {
        expect(exchange).toMatchObject({
          status: "admitted",
          grants: [
            {
              accessToken: "axm_pub_capability",
              visibilityContract: "v2",
              condition: '"pv2-reviewed"',
            },
          ],
        });
        expect(created).toMatchObject({
          registryUrl: input.registryUrl,
          publicationSet: input.publicationSet,
        });
        expect(presenter.state.publishReviews).toEqual([
          {
            browserOpened: true,
            candidateCount: 1,
            authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_test",
          },
        ]);
      }),
    );
  });

  it.effect("reports browser denial as an expected authorization failure", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          if (created === undefined) return false;
          const callback = new URL(created.redirectUri);
          callback.searchParams.set("error", "access_denied");
          callback.searchParams.set("state", created.state);
          callback.searchParams.set("iss", "https://agentxm.ai");
          scheduleCallback(callback.href);
          return true;
        }),
    });
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: (params) => {
        created = params;
        return Effect.succeed({
          requestId: "pubreq_denied",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_denied",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        });
      },
    });

    return Effect.flip(
      runPublishAuthorization(input).pipe(
        Effect.provide(Layer.mergeAll(presenter.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map(asAuthFailed),
      Effect.map((error) => {
        expect(error.category).toBe("auth");
        expect(error.detail).toBe("Publish authorization was denied");
      }),
    );
  });

  it.effect("rejects a callback from an unexpected issuer", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          if (created === undefined) return false;
          const callback = new URL(created.redirectUri);
          callback.searchParams.set("code", "axm_pubac_code");
          callback.searchParams.set("state", created.state);
          callback.searchParams.set("iss", "https://attacker.example");
          scheduleCallback(callback.href);
          return true;
        }),
    });
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: (params) => {
        created = params;
        return Effect.succeed({
          requestId: "pubreq_wrong_issuer",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_wrong_issuer",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        });
      },
    });

    return Effect.flip(
      runPublishAuthorization(input).pipe(
        Effect.provide(Layer.mergeAll(presenter.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map(asAuthFailed),
      Effect.map((error) => {
        expect(error.category).toBe("auth");
        expect(error.detail).toContain("issuer did not match");
      }),
    );
  });

  it.effect("preserves an expected authorization exchange failure", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const presenter = AuthLoginPresenterTest();
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          if (created === undefined) return false;
          const callback = new URL(created.redirectUri);
          callback.searchParams.set("code", "axm_pubac_expired");
          callback.searchParams.set("state", created.state);
          callback.searchParams.set("iss", "https://agentxm.ai");
          scheduleCallback(callback.href);
          return true;
        }),
    });
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: (params) => {
        created = params;
        return Effect.succeed({
          requestId: "pubreq_exchange_failure",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_exchange_failure",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
        });
      },
      exchangePublishAuthorizationCode: () =>
        Effect.fail(
          new RegistryAuthFailed({
            category: "auth",
            detail: "Publish authorization code expired",
          }),
        ),
    });

    return Effect.flip(
      runPublishAuthorization(input).pipe(
        Effect.provide(Layer.mergeAll(presenter.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map(asAuthFailed),
      Effect.map((error) => {
        expect(error.category).toBe("auth");
        expect(error.detail).toBe("Publish authorization code expired");
      }),
    );
  });
});
