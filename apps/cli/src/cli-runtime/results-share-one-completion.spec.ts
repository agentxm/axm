import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { withLiveOperation } from "../operation-lifecycle.js";
import { emitResult, ScreenMachine } from "../screen/screen.js";
import { makeTestOutputStreams } from "../screen/streams.js";
import { ProgressEventSchema } from "../screen/machine-events.js";
import { JsonEnvelopeSchema } from "./json-envelope.js";
import {
  getOperationExitCode,
  getOperationSettlement,
  OperationExitLive,
} from "./operation-exit.js";
import { CommandSemanticPropertiesLive, getCommandSemanticProperties } from "./telemetry.js";
import type { ResultCompletion } from "./result-completion.js";
import { withCliErrorHandling } from "./runtime-envelope.js";
import { makeAppError } from "../app-error/index.js";
import { TelemetryClientTest } from "../telemetry/index.js";
import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
} from "../test-support/screen-harness.js";
import {
  debugFlag,
  jsonFlag,
  nonInteractiveFlag,
  quietFlag,
  verboseFlag,
} from "../cli-flags/index.js";

export const specification = defineSpecification({
  requirement: "cli/results-share-one-completion",
  title: "Result, lifecycle and exit preserve one completion decision",
  statement:
    "Every ordinary result shall expose its producer's operation mode and outcome independently of its command verdict, derive ok exactly from exit zero, preserve the same decision in lifecycle settlement, semantic telemetry, and process status, and emit one minified JSON document with a trailing newline without changing authored strings. Failures before operation start shall retain their classified process exit without inventing an operation completion.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["contract", "example"],
  derivedFrom: ["cli/machine-progress-events-follow-the-lifecycle-schema"],
  supersedes: [],
  assumptions: [
    "Producer-specific specifications own the decision; this boundary observes the real machine writer and operation transport, not an operating-system pipe.",
  ],
  openQuestions: [],
});

const examples: ReadonlyArray<ResultCompletion> = [
  { mode: "query", outcome: "completed", exitCode: 0 },
  { mode: "query", outcome: "completed", exitCode: 6 },
  { mode: "preview", outcome: "previewed", exitCode: 1 },
  { mode: "preview", outcome: "failed", exitCode: 8 },
  { mode: "apply", outcome: "no-op", exitCode: 0 },
  { mode: "apply", outcome: "blocked", exitCode: 2 },
  { mode: "apply", outcome: "partial", exitCode: 1 },
  { mode: "apply", outcome: "pending-human", exitCode: 13 },
  { mode: "apply", outcome: "indeterminate", exitCode: 1 },
  { mode: "apply", outcome: "cancelled", exitCode: 0 },
  { mode: "apply", outcome: "interrupted", exitCode: 130 },
];

describe("Shared ordinary completion", () => {
  for (const format of ["text", "json"] as const) {
    for (const failure of [
      { code: "usage", exitCode: 2 },
      { code: "validation", exitCode: 9 },
    ] as const) {
      it.effect(
        `${format} preserves pre-operation ${failure.code} after command dispatch discards the return value`,
        () => {
          const streams = makeRecordingStreams();
          return Effect.gen(function* () {
            yield* withCliErrorHandling(
              Effect.fail(
                makeAppError({ code: failure.code, detail: "Rejected before operation start." }),
              ),
              { command: "test", format },
            ).pipe(Effect.asVoid);
            expect(yield* getOperationExitCode).toEqual(Option.some(failure.exitCode));
            expect(yield* getOperationSettlement).toEqual(Option.none());
            const stdout = streams.lines("stdout").join("\n");
            if (format === "json")
              expect(JSON.parse(stdout)).toMatchObject({ ok: false, code: failure.code });
            else expect(stdout).toBe("");
          }).pipe(
            Effect.provide(
              Layer.mergeAll(
                format === "json" ? machineScreenLayer(streams) : humanScreenLayer(streams),
                OperationExitLive,
                TelemetryClientTest,
                Layer.succeed(debugFlag, false),
                Layer.succeed(verboseFlag, false),
                Layer.succeed(quietFlag, false),
                Layer.succeed(jsonFlag, Option.some(format === "json")),
                Layer.succeed(nonInteractiveFlag, Option.some(true)),
              ),
            ),
            Effect.scoped,
          );
        },
      );
    }
  }
  for (const completion of examples) {
    it.effect(
      `${completion.mode}/${completion.outcome}/${completion.exitCode} agrees across channels`,
      () => {
        const streams = makeTestOutputStreams();
        const layer = Layer.mergeAll(
          Layer.provide(ScreenMachine(), streams.layer),
          OperationExitLive,
          CommandSemanticPropertiesLive,
        );
        return Effect.gen(function* () {
          const content = "authored  spacing\nand newline\n";
          const data = yield* withLiveOperation(
            { name: "Observe the selected operation", mode: completion.mode },
            Effect.succeed({ content }),
            () => completion,
          );
          yield* emitResult(data, Schema.Struct({ content: Schema.String }), () => []);
          const stdout = streams.state.stdout.join("");
          const wire = Schema.decodeUnknownSync(JsonEnvelopeSchema)(JSON.parse(stdout));
          expect(wire).toEqual({
            ok: completion.exitCode === 0,
            mode: completion.mode,
            outcome: completion.outcome,
            result: { content },
          });
          expect(stdout).toBe(`${JSON.stringify(wire)}\n`);
          expect(streams.state.stdout).toHaveLength(1);
          const events = streams.state.stderr.map(
            (line) => Schema.decodeUnknownSync(ProgressEventSchema)(JSON.parse(line)).event,
          );
          expect(events.filter((event) => event._tag === "OperationStarted")).toMatchObject([
            { mode: completion.mode },
          ]);
          expect(events.filter((event) => event._tag === "OperationSettled")).toMatchObject([
            { outcome: completion.outcome },
          ]);
          expect(yield* getOperationSettlement).toEqual(Option.some(completion));
          expect((yield* getCommandSemanticProperties)["cli.outcome"]).toBe(completion.outcome);
        }).pipe(Effect.provide(layer), Effect.scoped);
      },
    );
  }
});
