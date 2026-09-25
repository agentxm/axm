import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { makeOperationRequestBudget, OperationRequestBudget } from "@agentxm/registry-client";
import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { LockfileReader } from "../../desired-state/index.js";
import { SyncWorkspace } from "./sync-workspace.js";
import { makeSyncFixture, syncRequest } from "./test-helpers.js";

it.effect("batches configured Pack indexes despite uneven workspace read completion", () => {
  const batches: string[][] = [];
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      if (request.body._tag !== "Uint8Array") throw new Error("Expected JSON request bytes.");
      const body = Schema.decodeUnknownSync(Schema.fromJsonString(ResolutionMetadataRequestSchema))(
        new TextDecoder().decode(request.body.body),
      );
      batches.push(body.items.map((item) => item.identity.name));
      return HttpClientResponse.fromWeb(
        request,
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            selectionPolicyVersion: "1",
            observedAt: "2026-09-22T00:00:00.000Z",
            results: body.items.map((item) => ({ key: item.key, outcome: "unavailable" })),
          }),
          { status: 200 },
        ),
      );
    }),
  );
  // The fixture's Registry clients bind this transport when its layer is built.
  const workspace = makeSyncFixture({
    httpClient: http,
    settings: {
      owner: "@test",
      minimumReleaseAge: "0s",
      defaultRegistry: "test",
      sources: [{ name: "test", type: "registry", location: "https://registry.example.test" }],
      packs: { first: "@test/packs/first", second: "@test/packs/second" },
    },
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const lockfile = yield* LockfileReader;
        const releaseFirst = yield* Deferred.make<void>();
        const secondReady = yield* Deferred.make<void>();
        let secondReads = 0;
        // Hold the first Pack's accepted-resolution read, and note when the
        // second Pack's has been read twice, whichever accessor reads it.
        const gate = (type: string, name: string) =>
          Effect.gen(function* () {
            if (type === "pack" && name === "first") yield* Deferred.await(releaseFirst);
            if (type === "pack" && name === "second" && ++secondReads === 2)
              yield* Deferred.succeed(secondReady, undefined);
          });
        const budget = yield* makeOperationRequestBudget({ invocation: 2, origin: 2 });
        const planning = yield* SyncWorkspace.prepare(syncRequest()).pipe(
          Effect.provideService(LockfileReader, {
            ...lockfile,
            entry: (type, name) => Effect.tap(lockfile.entry(type, name), () => gate(type, name)),
            acceptedEntry: (type, name) =>
              Effect.tap(lockfile.acceptedEntry(type, name), () => gate(type, name)),
          }),
          Effect.provideService(OperationRequestBudget, budget),
          Effect.forkChild,
        );
        yield* Deferred.await(secondReady);
        // Let every unblocked fiber finish its work while the first Pack's read remains held.
        yield* TestClock.adjust("1 second");
        expect(batches).toEqual([]);
        yield* Deferred.succeed(releaseFirst, undefined);
        expect(Exit.isFailure(yield* Fiber.await(planning))).toBe(true);
        expect(batches.map((batch) => [...batch].sort())).toEqual([["first", "second"]]);
      }),
    )
    .pipe(
      Effect.scoped,
      Effect.provide(NodeServices.layer),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
});
