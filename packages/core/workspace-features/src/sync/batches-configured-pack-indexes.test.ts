import { makeOperationRequestBudget, OperationRequestBudget } from "@agentxm/host-primitives";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { ResolutionMetadataRequestSchema } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { LockfileReader, WorkspaceReadViews } from "@agentxm/workspace-kernel/workspace-state";
import { SyncWorkspace } from "./sync-workspace.js";
import { makeSyncFixture, syncRequest } from "../testing/sync-fixture.js";

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
            schemaVersion: 2,
            purpose: "select",
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
        const views = yield* WorkspaceReadViews;
        const releaseFirst = yield* Deferred.make<void>();
        const firstHeld = yield* Deferred.make<void>();
        const secondReady = yield* Deferred.make<void>();
        // Hold the first Pack's accepted-resolution read while the second
        // finishes local preparation, regardless of which accessor reads it.
        const gate = (type: string, name: string) =>
          Effect.gen(function* () {
            if (type === "pack" && name === "first") {
              yield* Deferred.succeed(firstHeld, undefined);
              yield* Deferred.await(releaseFirst);
            }
            if (type === "pack" && name === "second")
              yield* Deferred.succeed(secondReady, undefined);
          });
        const budget = yield* makeOperationRequestBudget({ invocation: 2, origin: 2 });
        const planning = yield* SyncWorkspace.prepare(syncRequest()).pipe(
          Effect.provideService(WorkspaceReadViews, {
            ...views,
            capture: (options) =>
              views.capture(options).pipe(
                Effect.map((context) => {
                  // Gate the real reader used by this preparation phase, after
                  // capture has supplied its shared document observations.
                  const lockfile = Context.get(context, LockfileReader);
                  return Context.add(context, LockfileReader, {
                    ...lockfile,
                    entry: (type, name) =>
                      Effect.tap(lockfile.entry(type, name), () => gate(type, name)),
                    acceptedEntry: (type, name) =>
                      Effect.tap(lockfile.acceptedEntry(type, name), () => gate(type, name)),
                  });
                }),
              ),
          }),
          Effect.provideService(OperationRequestBudget, budget),
          Effect.forkChild,
        );
        const reached = yield* Effect.raceFirst(
          Effect.all([Deferred.await(firstHeld), Deferred.await(secondReady)]).pipe(
            Effect.as("held-local-preparation"),
          ),
          Fiber.await(planning).pipe(Effect.as("planning-completed")),
        );
        expect(reached).toBe("held-local-preparation");
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
