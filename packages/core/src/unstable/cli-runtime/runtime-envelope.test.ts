import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import { CliRenderer } from "../cli-renderer/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { verboseFlag, debugFlag, quietFlag } from "../cli-flags/index.js";
import { nonInteractiveFlag } from "../cli-flags/index.js";
import { makeFoundationLayer } from "./runtime-envelope.js";

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
