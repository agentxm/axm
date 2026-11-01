import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";

type CandidateFailurePoint =
  "version" | "changelog" | "stamp" | "generate-skill" | "generate-cli-reference" | "validate";
class CandidatePhaseFailed extends Data.TaggedError("CandidatePhaseFailed")<{
  readonly phase: CandidateFailurePoint;
}> {}
const phases: readonly CandidateFailurePoint[] = [
  "version",
  "changelog",
  "stamp",
  "generate-skill",
  "generate-cli-reference",
  "validate",
];
const makeCandidateHost = Effect.fnUntraced(function* (failurePoint?: CandidateFailurePoint) {
  const events = yield* Ref.make<readonly string[]>([]);
  const record = (phase: CandidateFailurePoint) =>
    Ref.update(events, (entries) => [...entries, phase]).pipe(
      Effect.andThen(
        failurePoint === phase ? Effect.fail(new CandidatePhaseFailed({ phase })) : Effect.void,
      ),
    );
  const host: ReleaseCandidateHost<"version-context", CandidatePhaseFailed> = {
    version: () =>
      record("version").pipe(Effect.as({ version: "1.2.3", context: "version-context" })),
    changelog: () => record("changelog"),
    stampSkill: () => record("stamp"),
    generateSkill: () => record("generate-skill"),
    generateCliReference: () => record("generate-cli-reference"),
    validateCohort: () => record("validate"),
  };
  return { events, host };
});

describe("release candidate phase orchestration", () => {
  it.effect("generates the exact candidate before cohort validation", () =>
    Effect.gen(function* () {
      const { events, host } = yield* makeCandidateHost();
      expect(yield* runReleaseCandidatePreparation(host)).toBe("1.2.3");
      expect(yield* Ref.get(events)).toEqual(phases);
    }),
  );

  it.effect.each(phases)("stops when candidate phase %s fails", (phase) =>
    Effect.gen(function* () {
      const { events, host } = yield* makeCandidateHost(phase);
      expect(yield* Effect.flip(runReleaseCandidatePreparation(host))).toEqual(
        new CandidatePhaseFailed({ phase }),
      );
      expect(yield* Ref.get(events)).toEqual(phases.slice(0, phases.indexOf(phase) + 1));
    }),
  );

  it.effect("does not stamp or generate after interruption during changelog preparation", () =>
    Effect.gen(function* () {
      const { events, host } = yield* makeCandidateHost();
      const started = yield* Deferred.make<void>();
      const fiber = yield* runReleaseCandidatePreparation({
        ...host,
        changelog: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      }).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* Ref.get(events)).toEqual(["version"]);
    }),
  );
});
