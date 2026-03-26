import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("passes caller-provided selectKey bindings through to Clack", async () => {
    const result = await Effect.gen(function* () {
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
    }).pipe(Effect.provide(makeInteractivePrompt(false)), Effect.runPromise);

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
  });
});
