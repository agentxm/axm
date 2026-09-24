import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { isNonInteractive, nonInteractiveFlag } from "./non-interactive.js";
import { isAgentSession, promptAvailability } from "./interactivity.js";
import { jsonFlag } from "./json-flag.js";

const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
const unavailable = ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError)));

describe("interaction configuration precedence", () => {
  const originalStdin = process.stdin;
  afterEach(() => Object.defineProperty(process, "stdin", { value: originalStdin }));

  it.effect.each([true, false])("explicit flag %s bypasses unreadable CI configuration", (value) =>
    Effect.gen(function* () {
      expect(yield* isNonInteractive).toBe(value);
      expect(yield* promptAvailability).toBe(!value);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(nonInteractiveFlag, Option.some(value)), unavailable),
      ),
    ),
  );

  it.effect("machine output forbids prompting without reading CI", () =>
    Effect.gen(function* () {
      expect(yield* promptAvailability).toBe(false);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(jsonFlag, Option.some(true)),
          Layer.succeed(nonInteractiveFlag, Option.some(false)),
          unavailable,
        ),
      ),
    ),
  );

  // One CI truth table: any non-empty value enables CI except the
  // conventional false spellings.
  it.effect.each([
    { ci: "true", tty: true, expected: true },
    { ci: "1", tty: true, expected: true },
    { ci: "yes", tty: true, expected: true },
    { ci: "false", tty: false, expected: true },
    { ci: "false", tty: true, expected: false },
    { ci: "0", tty: true, expected: false },
    { ci: "", tty: true, expected: false },
  ])("resolves injected CI=$ci and stdin tty=$tty", ({ ci, tty, expected }) =>
    Effect.gen(function* () {
      Object.defineProperty(process, "stdin", { value: { isTTY: tty }, configurable: true });
      expect(yield* isNonInteractive).toBe(expected);
      expect(yield* promptAvailability).toBe(!expected);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(nonInteractiveFlag, Option.none()),
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { CI: ci } })),
        ),
      ),
    ),
  );

  it.effect("keeps CI source failure typed when the fallback is required", () =>
    Effect.gen(function* () {
      for (const read of [isNonInteractive, promptAvailability]) {
        const failure = yield* Effect.flip(read);
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
      }
    }).pipe(Effect.provide(unavailable)),
  );
});

describe("agent-session detection", () => {
  it.effect.each([
    { env: { CLAUDECODE: "1" }, expected: true },
    { env: { GEMINI_CLI: "true" }, expected: true },
    { env: { CURSOR_AGENT: "x" }, expected: true },
    { env: { CLAUDECODE: "" }, expected: false },
    { env: {}, expected: false },
  ])("reads $env as agent session $expected", ({ env, expected }) =>
    Effect.gen(function* () {
      expect(yield* isAgentSession).toBe(expected);
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))),
  );

  it.effect("keeps a source failure typed", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(isAgentSession);
      expect(failure._tag).toBe("ConfigError");
    }).pipe(Effect.provide(unavailable)),
  );
});
