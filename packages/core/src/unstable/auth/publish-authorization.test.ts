import { describe, expect, it } from "@effect/vitest";
import * as NodeHttp from "node:http";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeAppError } from "../app-error/index.js";
import { TestRenderer, logsByTag } from "../cli-renderer/index.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import type { CreatePublishAuthorizationRequestParams } from "./auth-client.js";
import { AuthClientTest } from "./auth-client.js";
import { DeviceLoginInteractionTest } from "./device-login.js";
import { runPublishAuthorization } from "./publish-authorization.js";

const input = {
  registryUrl: "https://registry.agentxm.ai",
  owner: handle("@alice"),
  type: "skill" as const,
  name: extensionName("review"),
  version: exactVersion("1.2.3"),
  archive: new TextEncoder().encode("exact archive bytes"),
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
    const renderer = TestRenderer.make();
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
          accessToken: "axm_pub_capability",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
          scope: "extensions:publish:version",
          publishRequestId: "pubreq_test",
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              expect(params.code).toBe("axm_pubac_code");
              expect(params.redirectUri).toBe(created?.redirectUri);
            }),
          ),
        ),
    });
    const layer = Layer.mergeAll(renderer.layer, interaction.layer, authClient);

    return runPublishAuthorization(input).pipe(
      Effect.provide(layer),
      Effect.map((accessToken) => {
        expect(accessToken).toBe("axm_pub_capability");
        expect(created).toMatchObject({
          registryUrl: input.registryUrl,
          owner: input.owner,
          type: input.type,
          name: input.name,
          version: input.version,
          archiveSha256: "8b95564a574f626298be86c7b4ee37b52383569e254849ca99308a06da97048e",
        });
        expect(logsByTag(renderer.state).step[0]).toContain("Opening browser to review");
      }),
    );
  });

  it.effect("reports browser denial as an expected authorization failure", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const renderer = TestRenderer.make();
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
        Effect.provide(Layer.mergeAll(renderer.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map((error) => {
        expect(error.code).toBe("auth");
        expect(error.detail).toBe("Publish authorization was denied");
      }),
    );
  });

  it.effect("rejects a callback from an unexpected issuer", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const renderer = TestRenderer.make();
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
        Effect.provide(Layer.mergeAll(renderer.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map((error) => {
        expect(error.code).toBe("auth");
        expect(error.detail).toContain("issuer did not match");
      }),
    );
  });

  it.effect("preserves an expected authorization exchange failure", () => {
    let created: CreatePublishAuthorizationRequestParams | undefined;
    const renderer = TestRenderer.make();
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
          makeAppError({
            code: "auth",
            detail: "Publish authorization code expired",
          }),
        ),
    });

    return Effect.flip(
      runPublishAuthorization(input).pipe(
        Effect.provide(Layer.mergeAll(renderer.layer, interaction.layer, authClient)),
      ),
    ).pipe(
      Effect.map((error) => {
        expect(error.code).toBe("auth");
        expect(error.detail).toBe("Publish authorization code expired");
      }),
    );
  });
});
