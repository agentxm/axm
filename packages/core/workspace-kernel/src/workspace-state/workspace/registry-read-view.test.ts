import { expect, it } from "@effect/vitest";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { RegistryClientFactoryTest, testRegistryEndpoint } from "@agentxm/registry-client/testing";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { NativePlatformTest } from "../../locations/testing.js";
import { WorkspaceReadTest, handle, extensionName } from "../testing.js";
import { createDefaultSettings } from "../desired/settings/index.js";
import { LOCKFILE_VERSION } from "../desired/lockfile/index.js";
import { WorkspaceDocuments, batchableWorkspaceDocuments } from "./documents.js";
import { PackManifests } from "./pack-manifests.js";
import {
  WorkspaceReadViewsLive,
  withWorkspaceReadView,
  withWorkspaceObservationReadView,
  withFreshWorkspaceObservationReadView,
} from "./read-view.js";

it.effect(
  "shares registry metadata within a workspace view and invalidates it before writing",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      let version = "1.0.0";
      let requests = 0;
      let writes = 0;
      const observedAt = "2026-11-13T12:00:00Z";
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          requests++;
          expect(request.method).toBe("POST");
          expect(new URL(request.url).pathname).toBe("/v1/resolutions");
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              schemaVersion: 2,
              purpose: "select",
              selectionPolicyVersion: "1",
              observedAt,
              results: [
                {
                  key: "0",
                  outcome: "metadata",
                  page: {
                    publisherBindingId: "hbnd_test",
                    visibility: "public",
                    archival: null,
                    deprecation: null,
                    revision: "a".repeat(64),
                    observedAt,
                    validUntil: "2026-11-13T12:00:30Z",
                    versions: [{ version, published: observedAt, integrity: "sha512-test" }],
                    continuation: null,
                  },
                },
              ],
            }),
          );
        }),
      );
      const documents = batchableWorkspaceDocuments({
        settings: () => Effect.succeed(createDefaultSettings()),
        acceptedResolutions: Effect.succeed({ lockfileVersion: LOCKFILE_VERSION, skills: {} }),
        acceptedResolutionState: Effect.succeed("missing"),
        writeSettings: () =>
          Effect.sync(() => {
            writes++;
          }),
        commitAcceptedResolutions: () => Effect.die("This scenario only writes settings"),
      });
      const layer = WorkspaceReadViewsLive.pipe(
        Layer.provideMerge(WorkspaceReadTest({ baseDir: root })),
        Layer.provide(Layer.succeed(WorkspaceDocuments, documents)),
        Layer.provide(
          Layer.succeed(PackManifests, {
            locate: () => {
              throw new Error("No Packs in this fixture");
            },
          }),
        ),
        Layer.provideMerge(RegistryClientFactoryTest(Layer.succeed(HttpClient.HttpClient, http))),
      );
      yield* Effect.gen(function* () {
        const factory = yield* RegistryClientFactory;
        const client = yield* factory.forEndpoint(testRegistryEndpoint);
        const read = client
          .getExtensionIndex({
            owner: handle("@acme"),
            type: "skill",
            name: extensionName("shared"),
          })
          .pipe(Effect.map((index) => Option.map(index, (value) => value.versions[0]?.version)));
        yield* withWorkspaceReadView(
          Effect.gen(function* () {
            expect(yield* read).toEqual(Option.some("1.0.0"));
            version = "2.0.0";
            expect(yield* withWorkspaceObservationReadView(read)).toEqual(Option.some("1.0.0"));
            expect(requests).toBe(1);
            expect(yield* withFreshWorkspaceObservationReadView(read)).toEqual(
              Option.some("2.0.0"),
            );
            expect(requests).toBe(2);
            expect(yield* read).toEqual(Option.some("1.0.0"));
            yield* documents.writeSettings(createDefaultSettings());
            expect(writes).toBe(1);
            expect(yield* read.pipe(Effect.flip)).toMatchObject({ category: "conflict" });
            expect(yield* withWorkspaceReadView(read)).toEqual(Option.some("2.0.0"));
            expect(requests).toBe(3);
          }),
        );
        expect(yield* withWorkspaceReadView(read)).toEqual(Option.some("2.0.0"));
        expect(requests).toBe(4);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
