import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { StepFailure } from "@agentxm/workspace-kernel/operations";

import { makeAppError } from "../app-error/index.js";
import {
  ConfigurationFailure,
  recordedConfigurationFailure,
  recordingConfigurationFailure,
  type ConfigurationFailureRecord,
} from "./configuration-failure.js";

const convert = (_: StepFailure) =>
  makeAppError({ code: "validation", detail: "The workspace settings could not be read." });

/** Build under the given outcome and return what the envelope would observe. */
const observeBuild = (
  build: Effect.Effect<void, StepFailure>,
  pick: (outcome: unknown) => unknown,
) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make(Option.none<ConfigurationFailureRecord>());
    const outcome = yield* build.pipe(
      recordingConfigurationFailure(convert),
      Effect.provideService(ConfigurationFailure, { ref }),
      Effect.flip,
      Effect.catchDefect((defect) => Effect.succeed(defect)),
    );
    return { outcome, recorded: yield* recordedConfigurationFailure(ref, pick(outcome)) };
  });

describe("configuration failure record", () => {
  it.effect("names a converted failure by the failure it was raised as", () =>
    Effect.gen(function* () {
      const { outcome, recorded } = yield* observeBuild(
        Effect.fail(new StepFailure({ category: "validation", detail: "unreadable" })),
        (error) => error,
      );
      expect(outcome).toMatchObject({ _tag: "AppError", code: "validation" });
      expect(Option.getOrUndefined(recorded)).toEqual({
        kind: "step-failure",
        code: "validation",
        handled: true,
      });
    }),
  );

  it.effect("names a defect raised while building as unhandled", () =>
    Effect.gen(function* () {
      const { recorded } = yield* observeBuild(Effect.die(new RangeError("bad")), (error) => error);
      expect(Option.getOrUndefined(recorded)).toEqual({
        kind: "defect.range-error",
        code: "internal",
        handled: false,
      });
    }),
  );

  it.effect("holds no identity for any other failure", () =>
    Effect.gen(function* () {
      const { recorded } = yield* observeBuild(
        Effect.fail(new StepFailure({ category: "validation", detail: "unreadable" })),
        () => makeAppError({ code: "validation", detail: "raised by the command" }),
      );
      expect(Option.isNone(recorded)).toBe(true);
    }),
  );

  it.effect("records nothing outside a runtime envelope", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.fail(
        new StepFailure({ category: "network", detail: "offline" }),
      ).pipe(recordingConfigurationFailure(convert), Effect.flip);
      expect(failure).toMatchObject({ _tag: "AppError", code: "validation" });
    }),
  );
});
