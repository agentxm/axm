import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vitest";
import { Output } from "./output.js";
import { OutputLive } from "./output-live.js";

// Mock @clack/prompts
vi.mock("@clack/prompts", () => ({
  log: {
    message: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    step: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  box: vi.fn(),
  stream: {
    message: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    success: vi.fn().mockResolvedValue(undefined),
    step: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  },
}));

import * as p from "@clack/prompts";

describe("OutputLive", () => {
  const layer = OutputLive();

  it.effect("delegates info to p.log.info", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.info("test message");
      expect(p.log.info).toHaveBeenCalledWith("test message");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates success to p.log.success", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.success("done");
      expect(p.log.success).toHaveBeenCalledWith("done");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates warn to p.log.warn", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.warn("careful");
      expect(p.log.warn).toHaveBeenCalledWith("careful");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates error to p.log.error", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.error("bad");
      expect(p.log.error).toHaveBeenCalledWith("bad");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates message to p.log.message", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.message("plain");
      expect(p.log.message).toHaveBeenCalledWith("plain");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates step to p.log.step", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.step("next");
      expect(p.log.step).toHaveBeenCalledWith("next");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates intro to p.intro", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.intro("title");
      expect(p.intro).toHaveBeenCalledWith("title");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates outro to p.outro", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.outro("bye");
      expect(p.outro).toHaveBeenCalledWith("bye");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates cancel to p.cancel", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.cancel("nope");
      expect(p.cancel).toHaveBeenCalledWith("nope");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates note to p.note", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.note("body", "title");
      expect(p.note).toHaveBeenCalledWith("body", "title");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("delegates box to p.box", () =>
    Effect.gen(function* () {
      const output = yield* Output;
      yield* output.box("content", "heading", { rounded: true });
      expect(p.box).toHaveBeenCalledWith("content", "heading", { rounded: true });
    }).pipe(Effect.provide(layer)),
  );
});
