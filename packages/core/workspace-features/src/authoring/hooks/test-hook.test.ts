import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { collectBounded, HOOK_TEST_MAX_BYTES } from "./test-hook.js";

describe("hook fixture output collection", () => {
  it.effect("preserves UTF-8 characters split across process chunks", () =>
    Effect.gen(function* () {
      const bytes = new TextEncoder().encode("before 😀 é after");
      const output = yield* collectBounded(
        Stream.fromIterable(Array.from(bytes, (byte) => Uint8Array.of(byte))),
      );
      expect(output).toBe("before 😀 é after");
    }),
  );

  it.effect("enforces the raw byte limit across chunks", () =>
    Effect.gen(function* () {
      const failure = yield* collectBounded(
        Stream.make(new Uint8Array(HOOK_TEST_MAX_BYTES), Uint8Array.of(0)),
      ).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "AuthoringFailed",
        detail: "Hook output exceeded the 1 MiB limit",
      });
    }),
  );

  it.effect("gives each execution an independent decoder and byte budget", () =>
    Effect.gen(function* () {
      const execution = collectBounded(Stream.make(new TextEncoder().encode("é")));
      expect(yield* execution).toBe("é");
      expect(yield* execution).toBe("é");
    }),
  );
});
