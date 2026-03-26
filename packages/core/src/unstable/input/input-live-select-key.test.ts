import * as p from "@clack/prompts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliEnvironmentTest } from "../cli-flags/index.js";
import { Input } from "./input.js";
import { InputLive } from "./input-live.js";

vi.mock("@clack/prompts", () => ({
  isCancel: vi.fn(() => false),
  selectKey: vi.fn().mockResolvedValue("y"),
}));

describe("InputLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes caller-provided selectKey bindings through to Clack", async () => {
    const liveLayer = Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: false }));
    const result = await Effect.gen(function* () {
      const input = yield* Input;
      return yield* input.selectKey({
        message: "Choose:",
        options: [
          { value: "y" as const, label: "Yes" },
          { value: "n" as const, label: "No" },
        ],
        initialValue: "n",
        caseSensitive: true,
      });
    }).pipe(Effect.provide(liveLayer), Effect.runPromise);

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
