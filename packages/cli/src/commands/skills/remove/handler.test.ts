/**
 * Unit tests for the remove command handler.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, vi } from "vitest";
import { handleRemove } from "./handler.js";

describe("remove.handler", () => {
  describe("handleRemove", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it.effect("prints 'Hello Alex' to the console", () =>
      Effect.gen(function* () {
        yield* handleRemove();

        expect(consoleSpy).toHaveBeenCalledWith("Hello Alex");
      }),
    );

    it("returns an Effect", () => {
      const result = handleRemove();

      // Verify it's an Effect by checking it has the expected shape
      expect(Effect.isEffect(result)).toBe(true);
    });

    it.effect("succeeds without error", () =>
      Effect.gen(function* () {
        yield* handleRemove();
        // If we reach here, the effect succeeded without error
        expect(true).toBe(true);
      }),
    );
  });
});
