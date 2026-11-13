import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import { RegistryAuthorityContext, RegistryRequestFailed } from "@agentxm/registry-client";
import { testRegistryEndpoint } from "@agentxm/registry-client/testing";
import { extensionName, handle } from "../../test-helpers.js";
import { makeRegistryIndexMemo } from "./index-memo.js";

const identity = { owner: handle("@acme"), type: "skill" as const, name: extensionName("member") };
const authority = (id: string, generation: number) =>
  new RegistryAuthorityContext({ id, generation });

it.effect("shares only within the same authority identity and generation", () =>
  Effect.gen(function* () {
    const context = yield* Ref.make(authority("first", 0));
    let reads = 0;
    const memo = yield* makeRegistryIndexMemo(
      () => Ref.get(context),
      () =>
        Effect.sync(() => {
          reads += 1;
          return Option.none();
        }),
    );
    yield* memo.get(testRegistryEndpoint, identity);
    yield* memo.get(testRegistryEndpoint, identity);
    expect(reads).toBe(1);
    yield* Ref.set(context, authority("first", 1));
    yield* memo.get(testRegistryEndpoint, identity);
    expect(reads).toBe(2);
    yield* Ref.set(context, authority("second", 1));
    yield* memo.get(testRegistryEndpoint, identity);
    expect(reads).toBe(3);
  }),
);

it.effect(
  "discards metadata observed across credential refresh and reads with the new generation",
  () =>
    Effect.gen(function* () {
      const context = yield* Ref.make(authority("first", 0));
      const generations: number[] = [];
      const memo = yield* makeRegistryIndexMemo(
        () => Ref.get(context),
        (key) =>
          Effect.gen(function* () {
            generations.push(key.authority.generation);
            if (key.authority.generation === 0) yield* Ref.set(context, authority("first", 1));
            return Option.none();
          }),
      );
      yield* memo.get(testRegistryEndpoint, identity);
      yield* memo.get(testRegistryEndpoint, identity);
      expect(generations).toEqual([0, 1]);
    }),
);

it.effect("fails closed on unreadable credentials even with a cached result", () =>
  Effect.gen(function* () {
    const readable = yield* Ref.make(true);
    let reads = 0;
    const memo = yield* makeRegistryIndexMemo(
      () =>
        Ref.get(readable).pipe(
          Effect.flatMap((value) =>
            value
              ? Effect.succeed(authority("first", 0))
              : Effect.fail(
                  new RegistryRequestFailed({ category: "auth", detail: "Credential unavailable" }),
                ),
          ),
        ),
      () =>
        Effect.sync(() => {
          reads += 1;
          return Option.none();
        }),
    );
    yield* memo.get(testRegistryEndpoint, identity);
    yield* Ref.set(readable, false);
    expect(yield* memo.get(testRegistryEndpoint, identity).pipe(Effect.flip)).toMatchObject({
      category: "auth",
    });
    expect(reads).toBe(1);
  }),
);

it.effect("bounds retries when credentials keep changing during selection", () =>
  Effect.gen(function* () {
    const context = yield* Ref.make(authority("first", 0));
    let reads = 0;
    const memo = yield* makeRegistryIndexMemo(
      () => Ref.get(context),
      (key) =>
        Effect.gen(function* () {
          reads += 1;
          yield* Ref.set(context, authority("first", key.authority.generation + 1));
          return Option.none();
        }),
    );
    expect(yield* memo.get(testRegistryEndpoint, identity).pipe(Effect.flip)).toMatchObject({
      category: "conflict",
    });
    expect(reads).toBe(3);
  }),
);
