import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import { CliRenderer } from "../cli-renderer/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { verboseFlag, debugFlag, quietFlag } from "../cli-flags/index.js";
import { nonInteractiveFlag } from "../cli-flags/index.js";
import { makeFoundationLayer, writeDefect } from "./runtime-envelope.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Provide the global flag settings that the foundation layer expects.
 * The Effect CLI framework normally provides these at command dispatch.
 */
const globalFlagLayer = Layer.mergeAll(
  Layer.succeed(nonInteractiveFlag, Option.some(true)),
  Layer.succeed(verboseFlag, false),
  Layer.succeed(debugFlag, false),
  Layer.succeed(quietFlag, false),
);

const testLayer = (
  format: Parameters<typeof makeFoundationLayer>[0],
  options?: Parameters<typeof makeFoundationLayer>[1],
) => Layer.provide(makeFoundationLayer(format, options), globalFlagLayer);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("makeFoundationLayer", () => {
  it.effect("provides CliRenderer service in text mode (interactive)", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.asEffect().pipe(Effect.provide(testLayer("text")));
      expect(renderer).toBeDefined();
      expect(renderer.intro).toBeDefined();
      expect(renderer.table).toBeDefined();
    }),
  );

  it.effect("provides CliRenderer as MachineRenderer in json mode", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.asEffect().pipe(Effect.provide(testLayer("json")));
      expect(renderer).toBeDefined();
      // Machine renderer: result() returns true
      const emitted = yield* renderer.result("test", Schema.String);
      expect(emitted).toBe(true);
    }),
  );

  it.effect("provides CliRenderer as InteractiveRenderer when format is text", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.asEffect().pipe(Effect.provide(testLayer("text")));
      // Interactive renderer: result() returns false (no machine output)
      const emitted = yield* renderer.result("test", Schema.String);
      expect(emitted).toBe(false);
    }),
  );

  it.effect("provides Verbosity service with default level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(Effect.provide(testLayer("text")));
      expect(v.level).toBe("normal");
      expect(v.isAtLeast("normal")).toBe(true);
      expect(v.isAtLeast("verbose")).toBe(false);
    }),
  );

  it.effect("provides Verbosity service with custom level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(
        Effect.provide(testLayer("text", { verbosityLevel: "verbose" })),
      );
      expect(v.level).toBe("verbose");
      expect(v.isAtLeast("verbose")).toBe(true);
      expect(v.isAtLeast("debug")).toBe(false);
    }),
  );

  it.effect("provides Verbosity at debug level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.asEffect().pipe(
        Effect.provide(testLayer("text", { verbosityLevel: "debug" })),
      );
      expect(v.level).toBe("debug");
      expect(v.isAtLeast("debug")).toBe(true);
    }),
  );

  it.effect("provides all services together", () =>
    Effect.gen(function* () {
      const layer = testLayer("text", { verbosityLevel: "verbose" });

      const renderer = yield* CliRenderer.asEffect().pipe(Effect.provide(layer));
      const verbosity = yield* Verbosity.asEffect().pipe(Effect.provide(layer));

      expect(renderer).toBeDefined();
      expect(verbosity.level).toBe("verbose");
    }),
  );
});

// ---------------------------------------------------------------------------
// writeDefect — JSON-mode channel contract for unhandled defects
// ---------------------------------------------------------------------------

describe("writeDefect", () => {
  let stdoutWrites: Array<string>;
  let stderrWrites: Array<string>;
  let stdoutWriteSpy: MockInstance;
  let stderrWriteSpy: MockInstance;

  beforeEach(() => {
    stdoutWrites = [];
    stderrWrites = [];
    stdoutWriteSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((...args: Array<unknown>) => {
        stdoutWrites.push(String(args[0]));
        return true;
      });
    stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((...args: Array<unknown>) => {
        stderrWrites.push(String(args[0]));
        return true;
      });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  it("text mode: writes human-readable defect to stderr only, leaving stdout untouched", () => {
    writeDefect(Cause.die(new Error("boom")), "text");

    expect(stdoutWrites).toEqual([]);
    expect(stderrWrites).toHaveLength(1);
    expect(stderrWrites[0]).toContain("boom");
  });

  it("json mode: emits one JSON envelope on stdout and pure NDJSON on stderr", () => {
    writeDefect(Cause.die(new Error("boom")), "json");

    expect(stdoutWrites).toHaveLength(1);
    const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
    expect(stdoutDoc).toMatchObject({
      ok: false,
      code: "internal",
      title: "Internal Error",
      detail: "boom",
    });

    expect(stderrWrites).toHaveLength(1);
    for (const line of stderrWrites) {
      const event: unknown = JSON.parse(line.trim());
      expect(event).toMatchObject({
        type: "error",
        code: "internal",
        title: "Internal Error",
        detail: "boom",
      });
    }
  });

  it("json mode: stringifies non-Error defects via String()", () => {
    writeDefect(Cause.die("kaboom"), "json");

    expect(stdoutWrites).toHaveLength(1);
    const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
    expect(stdoutDoc).toMatchObject({
      ok: false,
      code: "internal",
      title: "Internal Error",
      detail: "kaboom",
    });
  });
});
