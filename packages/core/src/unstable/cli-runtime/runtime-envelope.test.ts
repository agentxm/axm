import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CliRenderer } from "../cli-renderer/index.js";
import { CliPrompt } from "../cli-prompt/index.js";
import { Verbosity } from "../verbosity/index.js";
import { CliEnvironment, verboseFlag, debugFlag, quietFlag } from "../cli-flags/index.js";
import { nonInteractiveFlag } from "../utils/environment.js";
import { Output } from "../output/output.js";
import { Activity } from "../activity/activity.js";
import { Input } from "../input/index.js";
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("makeFoundationLayer", () => {
  describe("old services (backward compatibility)", () => {
    it.effect("provides Output service in text mode", () =>
      Effect.gen(function* () {
        const output = yield* Output.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text")),
          Effect.provide(globalFlagLayer),
        );
        expect(output).toBeDefined();
      }),
    );

    it.effect("provides Activity service in text mode", () =>
      Effect.gen(function* () {
        const activity = yield* Activity.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text")),
          Effect.provide(globalFlagLayer),
        );
        expect(activity).toBeDefined();
      }),
    );

    it.effect("provides Input service in text mode", () =>
      Effect.gen(function* () {
        const input = yield* Input.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text")),
          Effect.provide(globalFlagLayer),
        );
        expect(input).toBeDefined();
      }),
    );

    it.effect("provides CliEnvironment service", () =>
      Effect.gen(function* () {
        const env = yield* CliEnvironment.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text")),
          Effect.provide(globalFlagLayer),
        );
        expect(env).toBeDefined();
        expect(env.verbose).toBe(false);
        expect(env.debug).toBe(false);
      }),
    );

    it.effect("provides Output service in json mode", () =>
      Effect.gen(function* () {
        const output = yield* Output.asEffect().pipe(
          Effect.provide(makeFoundationLayer("json")),
          Effect.provide(globalFlagLayer),
        );
        expect(output).toBeDefined();
      }),
    );
  });

  describe("new services", () => {
    it.effect("provides CliRenderer service in text mode (interactive)", () =>
      Effect.gen(function* () {
        const renderer = yield* CliRenderer.asEffect().pipe(
          Effect.provide(
            makeFoundationLayer("text", {
              json: false,
              terminalCapabilities: { canRender: true, isInteractive: true },
            }),
          ),
          Effect.provide(globalFlagLayer),
        );
        expect(renderer).toBeDefined();
        expect(renderer.intro).toBeDefined();
        expect(renderer.table).toBeDefined();
      }),
    );

    it.effect("provides CliRenderer service when json is true (machine)", () =>
      Effect.gen(function* () {
        const renderer = yield* CliRenderer.asEffect().pipe(
          Effect.provide(
            makeFoundationLayer("json", {
              json: true,
              terminalCapabilities: { canRender: true, isInteractive: true },
            }),
          ),
          Effect.provide(globalFlagLayer),
        );
        expect(renderer).toBeDefined();
        // Machine renderer: result() returns true
        const emitted = yield* renderer.result("test", {} as never);
        expect(emitted).toBe(true);
      }),
    );

    it.effect("provides CliRenderer as InteractiveRenderer when json is false", () =>
      Effect.gen(function* () {
        const renderer = yield* CliRenderer.asEffect().pipe(
          Effect.provide(
            makeFoundationLayer("text", {
              json: false,
              terminalCapabilities: { canRender: true, isInteractive: true },
            }),
          ),
          Effect.provide(globalFlagLayer),
        );
        // Interactive renderer: result() returns false (no machine output)
        const emitted = yield* renderer.result("test", {} as never);
        expect(emitted).toBe(false);
      }),
    );

    it.effect("provides CliPrompt service", () =>
      Effect.gen(function* () {
        const prompt = yield* CliPrompt.asEffect().pipe(
          Effect.provide(
            makeFoundationLayer("text", {
              json: false,
              terminalCapabilities: { canRender: true, isInteractive: true },
            }),
          ),
          Effect.provide(globalFlagLayer),
        );
        expect(prompt).toBeDefined();
        expect(prompt.text).toBeDefined();
        expect(prompt.confirm).toBeDefined();
      }),
    );

    it.effect("provides Verbosity service with default level", () =>
      Effect.gen(function* () {
        const v = yield* Verbosity.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text")),
          Effect.provide(globalFlagLayer),
        );
        expect(v.level).toBe("normal");
        expect(v.isAtLeast("normal")).toBe(true);
        expect(v.isAtLeast("verbose")).toBe(false);
      }),
    );

    it.effect("provides Verbosity service with custom level", () =>
      Effect.gen(function* () {
        const v = yield* Verbosity.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text", { verbosityLevel: "verbose" })),
          Effect.provide(globalFlagLayer),
        );
        expect(v.level).toBe("verbose");
        expect(v.isAtLeast("verbose")).toBe(true);
        expect(v.isAtLeast("debug")).toBe(false);
      }),
    );

    it.effect("provides Verbosity at debug level", () =>
      Effect.gen(function* () {
        const v = yield* Verbosity.asEffect().pipe(
          Effect.provide(makeFoundationLayer("text", { verbosityLevel: "debug" })),
          Effect.provide(globalFlagLayer),
        );
        expect(v.level).toBe("debug");
        expect(v.isAtLeast("debug")).toBe(true);
      }),
    );
  });

  describe("dual-provide — both old and new available simultaneously", () => {
    it.effect("provides all old and new services together", () =>
      Effect.gen(function* () {
        const foundation = makeFoundationLayer("text", {
          json: false,
          terminalCapabilities: { canRender: true, isInteractive: true },
          verbosityLevel: "verbose",
        });

        // Old services
        const output = yield* Output.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );
        const activity = yield* Activity.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );
        const input = yield* Input.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );
        const cliEnv = yield* CliEnvironment.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );

        // New services
        const renderer = yield* CliRenderer.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );
        const prompt = yield* CliPrompt.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );
        const verbosity = yield* Verbosity.asEffect().pipe(
          Effect.provide(foundation),
          Effect.provide(globalFlagLayer),
        );

        expect(output).toBeDefined();
        expect(activity).toBeDefined();
        expect(input).toBeDefined();
        expect(cliEnv).toBeDefined();
        expect(renderer).toBeDefined();
        expect(prompt).toBeDefined();
        expect(verbosity.level).toBe("verbose");
      }),
    );
  });
});
