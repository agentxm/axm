/**
 * Every mutating Registry call sends a JSON body that the contract's request
 * schema accepts with excess properties rejected. The Registry refuses
 * undeclared fields, so a body that only decodes leniently would fail there.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";

import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";

import * as Generated from "./__generated__/registry-client.js";
import {
  archiveExtension,
  deprecateExtension,
  yankAvailableExtensionVersions,
  yankExtensionVersion,
} from "./admin-client.js";
import type { RegistryClientFailure } from "./errors.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import { RegistryUrl } from "./registry-url.js";
import { exactVersion, extensionName, handle, packageUrl } from "./test-helpers.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

/** Records each request body and answers with a declared unavailable problem. */
const makeRecordingClient = () => {
  const bodies: Array<{ readonly method: string; readonly body: unknown }> = [];
  const httpClient = HttpClient.make((request: HttpClientRequest.HttpClientRequest) =>
    Effect.sync(() => {
      if (request.body._tag === "Uint8Array") {
        bodies.push({
          method: request.method,
          body: JSON.parse(new TextDecoder().decode(request.body.body)),
        });
      }
      return HttpClientResponse.fromWeb(
        request,
        Response.json(
          {
            type: `${REGISTRY_URL}/v1/problems/service_unavailable`,
            title: "Service Unavailable",
            status: 503,
            detail: "Recorded.",
            code: "service_unavailable",
          },
          { status: 503, headers: { "content-type": "application/problem+json" } },
        ),
      );
    }),
  );
  return { bodies, httpClient };
};

const sentBody = <A, E, R>(
  run: (httpClient: HttpClient.HttpClient) => Effect.Effect<A, E, R>,
): Effect.Effect<unknown, never, R> =>
  Effect.gen(function* () {
    const { bodies, httpClient } = makeRecordingClient();
    yield* run(httpClient).pipe(Effect.ignore);
    expect(bodies.length).toBeGreaterThan(0);
    return bodies[0]?.body;
  });

const strictly = <S extends Schema.Decoder<unknown>>(schema: S, body: unknown) =>
  Schema.decodeUnknownSync(schema)(body, { onExcessProperty: "error" });

const remote = (httpClient: HttpClient.HttpClient) =>
  createRemoteRegistryClient(REGISTRY_URL, httpClient, undefined, {
    requestTimeout: "1 second",
    totalDeadline: "2 seconds",
    maxAttempts: 1,
    initialBackoff: "0 millis",
    maxBackoff: "0 millis",
  });

const admin =
  <A>(effect: Effect.Effect<A, RegistryClientFailure, HttpClient.HttpClient | RegistryUrl>) =>
  (httpClient: HttpClient.HttpClient) =>
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(HttpClient.HttpClient, httpClient),
          Layer.succeed(RegistryUrl, REGISTRY_URL),
        ),
      ),
    );

const ref = { owner: "@acme", type: "skills", name: "review" };

describe("Mutating Registry calls send bodies the contract accepts strictly", () => {
  it.effect("visibility mutation", () =>
    Effect.gen(function* () {
      const body = yield* sentBody((httpClient) =>
        remote(httpClient).updateExtensionVisibility({
          target: "@acme/skills/review",
          visibility: "private",
          revision: "rev_1",
          authority: { kind: "repository", source: "manifest", fingerprint: "a".repeat(64) },
        }),
      );
      expect(() => strictly(Generated.ExtensionsUpdateVisibilityRequestJson, body)).not.toThrow();
    }),
  );

  it.effect("publish preview", () =>
    Effect.gen(function* () {
      const body = yield* sentBody((httpClient) =>
        remote(httpClient).previewExtensionPublishes({
          contract: PUBLICATION_SET_CONTRACT,
          candidates: [
            {
              target: {
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("review"),
                version: exactVersion("1.0.0"),
              },
              participation: "publish",
              archiveSha256Hex: archiveSha256Hex(new Uint8Array([1])),
              visibility: { intent: null, request: "public" },
            },
          ],
        }),
      );
      expect(() =>
        strictly(Generated.PublishPreviewsPreviewExtensionPublishesRequestJson, body),
      ).not.toThrow();
    }),
  );

  it.effect("package discovery", () =>
    Effect.gen(function* () {
      const body = yield* sentBody((httpClient) =>
        remote(httpClient).discoverPackages({
          packages: [
            {
              purl: packageUrl("pkg:npm/react@18.2.0"),
              version: "18.2.0",
              declaredExtensions: [],
            },
          ],
        }),
      );
      expect(() => strictly(Generated.DiscoveryPostDiscoveryRequestJson, body)).not.toThrow();
    }),
  );

  it.effect("archival", () =>
    Effect.gen(function* () {
      const body = yield* sentBody(
        admin(archiveExtension(ref, { revision: "rev_1", reason: "Replaced" })),
      );
      expect(() => strictly(Generated.ExtensionsPutArchivalRequestJson, body)).not.toThrow();
    }),
  );

  it.effect("deprecation", () =>
    Effect.gen(function* () {
      const body = yield* sentBody(
        admin(
          deprecateExtension(ref, {
            revision: "rev_1",
            reason: "superseded",
            message: "Use the successor.",
            replacement: { kind: "set", fqn: "@acme/skills/review-next" },
          }),
        ),
      );
      expect(() => strictly(Generated.ExtensionsPutDeprecationRequestJson, body)).not.toThrow();
    }),
  );

  it.effect("version yank", () =>
    Effect.gen(function* () {
      const body = yield* sentBody(
        admin(
          yankExtensionVersion(
            { ...ref, version: "1.0.0" },
            { category: "security", notice: "Do not install." },
          ),
        ),
      );
      expect(() => strictly(Generated.ExtensionsYankVersionRequestJson, body)).not.toThrow();
    }),
  );

  it.effect("yank of every available version", () =>
    Effect.gen(function* () {
      const body = yield* sentBody(
        admin(yankAvailableExtensionVersions(ref, { category: "broken" })),
      );
      expect(() =>
        strictly(Generated.ExtensionsYankAvailableVersionsRequestJson, body),
      ).not.toThrow();
    }),
  );

  it("rejects a body that carries an undeclared field", () => {
    expect(() =>
      strictly(Generated.ExtensionsPutArchivalRequestJson, { reason: null, archived_by: "x" }),
    ).toThrow();
  });
});
