import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { describe, expect, it } from "@effect/vitest";

import { archiveSha256Hex } from "@agentxm/registry-protocol/unstable/registry";
import {
  RegistryRequestFailed,
  type PublishExtensionArgs,
  type RegistryClient,
} from "@agentxm/registry-client";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { settlePublish } from "./settlement.js";

const args: PublishExtensionArgs = {
  owner: decodeHandleSync("@acme"),
  type: "skill",
  name: decodeExtensionNameSync("example"),
  version: decodeVersionSync("1.0.0"),
  archive: new Uint8Array([1]),
  metadata: {
    version: decodeVersionSync("1.0.0"),
    published: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
    integrity: "sha512-AAAA",
  },
  visibilityInput: { intent: null, request: null },
  condition: "condition",
  publicationSetDigest: archiveSha256Hex(new Uint8Array([1])),
  publicationDescriptorDigest: archiveSha256Hex(new Uint8Array([2])),
};

const response = {
  published: true,
  owner: args.owner,
  type: args.type,
  name: args.name,
  version: args.version,
  integrity: args.metadata.integrity,
  status: "available",
  visibility: { value: "public", disposition: "establish", source: "platform" },
  warnings: [],
} as const;

const timeout = new RegistryRequestFailed({
  category: "timeout",
  detail: "timed out",
  metadata: {
    requestPolicy: {
      retryable: true,
      attemptCount: 1,
      maxAttempts: 1,
      exhausted: true,
      stoppedBy: "replay-unsafe",
      replaySafety: "mutation",
    },
  },
});

describe("settlePublish", () => {
  it.effect("adds no readback or replay to a normal success", () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0);
      const publishes = yield* Ref.make(0);
      const client = {
        publishExtension: () =>
          Ref.update(publishes, (count) => count + 1).pipe(Effect.as(response)),
        getExactExtensionVersion: () =>
          Ref.update(reads, (count) => count + 1).pipe(Effect.as(Option.none())),
      } satisfies Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">;

      expect(yield* settlePublish(client, args)).toMatchObject({ settlement: "response" });
      expect(yield* Ref.get(publishes)).toBe(1);
      expect(yield* Ref.get(reads)).toBe(0);
    }),
  );

  it.effect("settles a timed-out upload by matching exact readback", () =>
    Effect.gen(function* () {
      const publishes = yield* Ref.make(0);
      const client = {
        publishExtension: () =>
          Ref.update(publishes, (count) => count + 1).pipe(Effect.andThen(Effect.fail(timeout))),
        getExactExtensionVersion: () =>
          Effect.succeed(
            Option.some({
              owner: args.owner,
              type: args.type,
              name: args.name,
              version: args.version,
              integrity: args.metadata.integrity,
              status: "available",
            }),
          ),
      } satisfies Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">;

      expect(yield* settlePublish(client, args)).toEqual({
        status: "published",
        settlement: "readback",
      });
      expect(yield* Ref.get(publishes)).toBe(1);
    }),
  );

  it.effect("replays once after bounded absence", () =>
    Effect.gen(function* () {
      const publishes = yield* Ref.make(0);
      const client = {
        publishExtension: () =>
          Ref.updateAndGet(publishes, (count) => count + 1).pipe(
            Effect.flatMap((attempt) =>
              attempt === 1 ? Effect.fail(timeout) : Effect.succeed(response),
            ),
          ),
        getExactExtensionVersion: () => Effect.succeed(Option.none()),
      } satisfies Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">;

      const fiber = yield* settlePublish(client, args).pipe(Effect.forkChild);
      yield* TestClock.adjust("1 second");
      expect(yield* Fiber.join(fiber)).toMatchObject({ settlement: "replay" });
      expect(yield* Ref.get(publishes)).toBe(2);
    }),
  );

  it.effect("reports unresolved after one replay and final bounded readback", () =>
    Effect.gen(function* () {
      const publishes = yield* Ref.make(0);
      const client = {
        publishExtension: () =>
          Ref.update(publishes, (count) => count + 1).pipe(Effect.andThen(Effect.fail(timeout))),
        getExactExtensionVersion: () => Effect.succeed(Option.none()),
      } satisfies Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">;

      const fiber = yield* settlePublish(client, args).pipe(Effect.forkChild);
      yield* TestClock.adjust("2 seconds");
      expect(yield* Fiber.join(fiber)).toMatchObject({
        status: "unknown",
        reason: "settlement_unresolved",
      });
      expect(yield* Ref.get(publishes)).toBe(2);
    }),
  );

  it.effect("fails on a different immutable digest", () =>
    Effect.gen(function* () {
      const client = {
        publishExtension: () => Effect.fail(timeout),
        getExactExtensionVersion: () =>
          Effect.succeed(
            Option.some({
              owner: args.owner,
              type: args.type,
              name: args.name,
              version: args.version,
              integrity: "sha512-DIFFERENT",
              status: "available",
            }),
          ),
      } satisfies Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">;

      const error = yield* settlePublish(client, args).pipe(Effect.flip);
      expect(error.category).toBe("conflict");
    }),
  );
});
