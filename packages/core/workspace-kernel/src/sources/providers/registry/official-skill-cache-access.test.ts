import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Duration from "effect/Duration";
import * as DateTime from "effect/DateTime";
import * as ConfigProvider from "effect/ConfigProvider";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { makeRegistryClientFactory } from "@agentxm/registry-client";
import {
  passThroughRegistryAuthorization,
  testRegistryEndpoint,
} from "@agentxm/registry-client/testing";
import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { ExactContentRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolutions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { AxmSkillCandidateGate } from "../../axm-skill-gate.js";
import { RegistryResolutionPolicyTest } from "../../testing.js";
import { createRemoteRegistrySourceHostProvider } from "./host-provider.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["registry-client/cached-archives-require-current-authorization"],
  boundary: "platform",
  rationale:
    "The official-skill provider probes real cached archive bytes through the production Registry factory; controlled HTTP denial prevents the compatibility consumer from seeing cached content after access is withdrawn.",
});

it.effect(
  "official skill compatibility probing refuses cached bytes after access is withdrawn",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-official-access-" });
      const archive = zipSync({
        "skill.json": strToU8(
          JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "1.0.0" }),
        ),
        "src/SKILL.md": strToU8("---\nname: axm\ndescription: Fixture\n---\n# Fixture\n"),
      });
      const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
      const observedAt = "2026-01-01T00:00:00.000Z";
      const version = { version: "1.0.0", published: observedAt, integrity };
      let denied = false;
      let downloads = 0;
      let admissions = 0;
      let evaluations = 0;
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          const url = new URL(request.url);
          if (url.pathname.endsWith("/archive")) {
            expect(request.headers["x-agentxm-usage-purpose"]).toBe("verification");
            downloads++;
            return HttpClientResponse.fromWeb(
              request,
              new Response(archive, {
                headers: { "content-type": "application/zip", "x-integrity": integrity },
              }),
            );
          }
          if (url.pathname === "/v1/resolutions") {
            if (request.body._tag !== "Uint8Array")
              throw new Error("Expected exact authorization request");
            const input = Schema.decodeUnknownSync(
              Schema.fromJsonString(
                Schema.Union([ExactContentRequestSchema, ResolutionMetadataRequestSchema]),
              ),
            )(new TextDecoder().decode(request.body.body));
            if (input.purpose === "select") {
              return HttpClientResponse.fromWeb(
                request,
                Response.json({
                  schemaVersion: 2,
                  purpose: "select",
                  selectionPolicyVersion: "1",
                  observedAt,
                  results: input.items.map((item) => ({
                    key: item.key,
                    outcome: "metadata",
                    page: {
                      publisherBindingId: "hbnd_fixture",
                      visibility: "public",
                      archival: null,
                      deprecation: null,
                      revision: "fixture",
                      observedAt,
                      validUntil: "2099-01-01T00:00:00.000Z",
                      versions: [version],
                      continuation: null,
                    },
                  })),
                }),
              );
            }
            admissions++;
            return HttpClientResponse.fromWeb(
              request,
              Response.json({
                schemaVersion: 2,
                purpose: "authorize-exact",
                observedAt,
                results: input.items.map((item) =>
                  denied
                    ? { key: item.key, outcome: "unavailable" }
                    : {
                        key: item.key,
                        outcome: "allowed",
                        identity: item.identity,
                        publisherBindingId: item.expectedPublisherBinding,
                        accepted: item.accepted,
                        yanked: false,
                        observedAt,
                      },
                ),
              }),
            );
          }
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              owner: "@agentxm",
              name: "axm",
              type: "skill",
              publisherBindingId: "hbnd_fixture",
              description: "Fixture",
              archival: null,
              deprecation: null,
              versions: [version],
            }),
          );
        }),
      );
      const factory = yield* makeRegistryClientFactory({
        httpClient: http,
        fileSystem: fs,
        path,
        authorization: passThroughRegistryAuthorization,
      }).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ AXM_USER_HOME: home }))),
      );
      const client = yield* factory.forEndpoint(testRegistryEndpoint);
      const provider = createRemoteRegistrySourceHostProvider(client);
      const source: RegistrySource = {
        type: "registry",
        name: "test",
        location: testRegistryEndpoint,
        owner: Option.none(),
      };
      const query = provider
        .resolveNamed(source, {
          owner: decodeHandleSync("@agentxm"),
          type: "skill",
          name: "axm",
          versionRange: Option.some("1.0.0"),
          releaseAgeEvaluation: {
            minimumReleaseAge: Duration.seconds(0),
            evaluatedAt: DateTime.makeUnsafe("2026-11-13T00:00:00.000Z"),
            mode: "enforce",
          },
        })
        .pipe(
          Effect.provideService(AxmSkillCandidateGate, {
            evaluate: () =>
              Effect.sync(() => {
                evaluations++;
                return {
                  status: "compatible" as const,
                  detail: null,
                  recoveryCommand: null,
                  recoveryTarget: "@agentxm/skills/axm",
                };
              }),
          }),
        );
      expect((yield* query).kind).toBe("selected");
      expect(evaluations).toBe(1);
      expect(downloads).toBe(1);
      denied = true;
      const refusal = yield* query.pipe(Effect.result);
      expect(refusal._tag).toBe("Failure");
      expect(evaluations).toBe(1);
      expect(downloads).toBe(1);
      expect(admissions).toBe(2);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(RegistryResolutionPolicyTest, NodeServices.layer)),
    ),
);
