import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PendingPublishAuthorizationStore,
  PendingPublishAuthorizationStoreLive,
  type PendingPublishAuthorization,
} from "./pending-publish-authorization-store.js";

const pending: PendingPublishAuthorization = {
  version: 1,
  purpose: "publish",
  registryUrl: "https://registry.example.test",
  requestId: "pubreq_01h455vb4pexka56gq5w2r7cpc",
  requestRef:
    "https://registry.example.test/v1/auth/publish-requests/pubreq_01h455vb4pexka56gq5w2r7cpc",
  authorizationUrl: "https://auth.example.test/publish/authorize/pubreq_01h455vb4pexka56gq5w2r7cpc",
  expiresAt: DateTime.makeUnsafe("2099-01-01"),
  interval: 2,
  publicationSetDigest: "a".repeat(64),
  initiatorProof: "private-proof-".repeat(5),
};

const withPrivateHome = <A, E, R>(run: (home: string) => Effect.Effect<A, E, R>) =>
  Effect.suspend(() => {
    const home = mkdtempSync(join(tmpdir(), "axm-publish-proof-"));
    const previous = process.env["AXM_USER_HOME"];
    process.env["AXM_USER_HOME"] = home;
    return run(home).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previous === undefined) delete process.env["AXM_USER_HOME"];
          else process.env["AXM_USER_HOME"] = previous;
          rmSync(home, { recursive: true, force: true });
        }),
      ),
    );
  });
const live = () => PendingPublishAuthorizationStoreLive.pipe(Layer.provide(NodeServices.layer));

describe("Private publish authorization persistence", () => {
  it.effect("survives a new store instance with restrictive permissions and no partial file", () =>
    withPrivateHome((home) =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const store = yield* PendingPublishAuthorizationStore;
          yield* store.save(pending);
        }).pipe(Effect.provide(live()));
        yield* Effect.gen(function* () {
          const store = yield* PendingPublishAuthorizationStore;
          expect(yield* store.load(pending.requestRef)).toEqual(Option.some(pending));
        }).pipe(Effect.provide(live()));
        const directory = join(home, ".axm", "publish-authorizations");
        const files = readdirSync(directory);
        expect(files).toHaveLength(1);
        const file = files[0];
        if (file === undefined) throw new Error("Missing proof file");
        expect(file).toMatch(/^[a-f0-9]{64}\.json$/);
        if (process.platform !== "win32") {
          expect(statSync(directory).mode & 0o777).toBe(0o700);
          expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
        }
        expect(JSON.parse(readFileSync(join(directory, file), "utf8"))).toMatchObject({
          initiatorProof: pending.initiatorProof,
          requestRef: pending.requestRef,
        });
      }),
    ),
  );

  it.effect("keeps concurrent requests independent and refuses to replace an existing proof", () =>
    withPrivateHome(() =>
      Effect.gen(function* () {
        const store = yield* PendingPublishAuthorizationStore;
        const second = {
          ...pending,
          requestRef: `${pending.requestRef}2`,
          requestId: `${pending.requestId}2`,
          initiatorProof: "different-proof-".repeat(4),
        };
        yield* Effect.all([store.save(pending), store.save(second)], { concurrency: 2 });
        const failure = yield* store
          .save({ ...pending, initiatorProof: second.initiatorProof })
          .pipe(Effect.flip);
        expect(failure._tag).toBe("RegistryAuthFailed");
        expect(yield* store.load(pending.requestRef)).toEqual(Option.some(pending));
        yield* store.clear(pending.requestRef);
        expect(yield* store.load(pending.requestRef)).toEqual(Option.none());
        expect(yield* store.load(second.requestRef)).toEqual(Option.some(second));
      }).pipe(Effect.provide(live())),
    ),
  );
});
