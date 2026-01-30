/**
 * Unit tests for the remove command handler.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    it("prints 'Hello Alex' to the console", async () => {
      await Effect.runPromise(handleRemove());

      expect(consoleSpy).toHaveBeenCalledWith("Hello Alex");
    });

    it("returns an Effect", () => {
      const result = handleRemove();

      // Verify it's an Effect by checking it has the expected shape
      expect(Effect.isEffect(result)).toBe(true);
    });

    it("succeeds without error", async () => {
      await expect(Effect.runPromise(handleRemove())).resolves.not.toThrow();
    });
  });
});
