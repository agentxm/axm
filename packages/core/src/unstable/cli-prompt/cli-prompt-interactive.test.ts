import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import { beforeEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { CliPrompt } from "./cli-prompt.js";
import { makeInteractivePrompt } from "./cli-prompt-interactive.js";

vi.mock("@clack/prompts", () => ({
  isCancel: vi.fn(() => false),
  selectKey: vi.fn().mockResolvedValue("y"),
}));

describe("makeInteractivePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.effect("passes caller-provided selectKey bindings through to Clack", () =>
    Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        const prompt = yield* CliPrompt;
        return yield* prompt.selectKey({
          message: "Choose:",
          options: [
            { value: "y" as const, label: "Yes" },
            { value: "n" as const, label: "No" },
          ],
          initialValue: "n",
          caseSensitive: true,
        });
      }).pipe(Effect.provide(makeInteractivePrompt(false)));

      expect(result).toBe("y");
      expect(p.selectKey).toHaveBeenCalledWith({
        message: "Choose:",
        options: [
          { value: "y", label: "Yes" },
          { value: "n", label: "No" },
        ],
        initialValue: "n",
        caseSensitive: true,
      });
    }),
  );
});
