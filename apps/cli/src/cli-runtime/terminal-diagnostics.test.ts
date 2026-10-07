import { makeAppError } from "../app-error/app-error.js";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import type { TelemetryFailureReport } from "../telemetry/payloads.js";
import {
  DIAGNOSTIC_LIMITS,
  TerminalDiagnostics,
  appErrorWithDiagnostic,
  makeTerminalDiagnostics,
  writeLocalFailureRecord,
  type TerminalFailureRecord,
} from "./terminal-diagnostics.js";

const EVENT_ID = "00000000-0000-4000-8000-000000000001";
const failure: TelemetryFailureReport = {
  kind: "registry.response-decode",
  operation: "publish.upload",
  phase: "command",
  category: "internal",
  errorClass: "internal",
  handled: true,
};

describe("terminal diagnostics", () => {
  it.effect("preserves non-enumerable causes when adding the diagnostic identity", () =>
    Effect.gen(function* () {
      const cause = new Error("original transport failure");
      const error = makeAppError({ code: "network", detail: "Registry unreachable", cause });
      expect(Object.keys(error)).not.toContain("cause");
      const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
      const annotated = yield* appErrorWithDiagnostic(error, {
        kind: "registry.network-unreachable",
        operation: "registry.index",
        code: "network",
        handled: true,
        phase: "command",
      }).pipe(Effect.provideService(TerminalDiagnostics, diagnostics));
      expect(annotated.cause).toBe(cause);
      expect(annotated.diagnosticId).toBe(EVENT_ID);
      expect(Option.getOrUndefined(yield* diagnostics.current)?.causes[0]?.message).toBe(
        "original transport failure",
      );
    }),
  );
  it.effect("correlates retained request causes and prioritizes the terminal failure", () =>
    Effect.gen(function* () {
      const requestId = "00000000-0000-4000-8000-000000000002";
      const unrelated = "00000000-0000-4000-8000-000000000003";
      const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
      yield* diagnostics.rememberCause(new Error("recovered request"), undefined, unrelated);
      yield* diagnostics.rememberCause(
        new Error("terminal request transport"),
        undefined,
        requestId,
      );
      const correlated = yield* diagnostics.prepare(
        { ...failure, request: { service: "registry", requestId } },
        new Error("terminal producer"),
      );
      expect(correlated.causes[0]?.message).toBe("terminal producer");
      expect(
        correlated.causes.some((entry) => entry.message === "terminal request transport"),
      ).toBe(true);
      expect(correlated.causes.some((entry) => entry.message === "recovered request")).toBe(false);

      const distinct = yield* diagnostics.prepare(
        { ...failure, kind: "output-write-failed", operation: "runtime.output" },
        new Error("unrelated output failure"),
      );
      expect(distinct.causes.map((entry) => entry.message)).toEqual(["unrelated output failure"]);

      const batch = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
      for (let index = 0; index < 20; index += 1)
        yield* batch.rememberCause(new Error(`request cause ${index}`), undefined, requestId);
      const saturated = yield* batch.prepare(
        {
          ...failure,
          related: [
            {
              kind: failure.kind,
              operation: failure.operation,
              request: { service: "registry", requestId },
              count: 1,
            },
          ],
        },
        new Error("original aggregate"),
      );
      expect(saturated.causes).toHaveLength(16);
      expect(saturated.causes[0]?.message).toBe("original aggregate");
    }),
  );

  it.effect(
    "limits retained UUID records without pruning unrelated files or the current record",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const directory = yield* fs.makeTempDirectoryScoped();
          for (let index = 0; index < DIAGNOSTIC_LIMITS.records + 5; index += 1) {
            const id = `00000000-0000-4000-8000-${(index + 2).toString(16).padStart(12, "0")}`;
            const filename = path.join(directory, `${id}.json`);
            yield* fs.writeFileString(filename, "{}", { mode: 0o600 });
            yield* fs.utimes(filename, 2, 2);
          }
          yield* fs.writeFileString(path.join(directory, "unrelated.json"), "keep");
          const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
          yield* writeLocalFailureRecord(yield* diagnostics.prepare(failure), directory);
          const names = yield* fs.readDirectory(directory);
          expect(names.filter((name) => name !== "unrelated.json")).toHaveLength(
            DIAGNOSTIC_LIMITS.records,
          );
          expect(names).toContain(`${EVENT_ID}.json`);
          expect(yield* fs.readFileString(path.join(directory, "unrelated.json"))).toBe("keep");
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("retains redacted original causes from a mixed aggregate and terminates cycles", () =>
    Effect.gen(function* () {
      const secret = "SYNTHETIC_CREDENTIAL_74";
      const first = Object.assign(new Error(`provider returned ${secret}`), {
        metadata: { accessToken: secret },
      });
      const second = new TypeError("local implementation failure");
      const causes: Array<unknown> = [first, second];
      causes.push(causes);
      const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
      const record = yield* diagnostics.prepare(failure, new Error("batch", { cause: causes }));
      expect(record.causes.some((entry) => entry.message === "local implementation failure")).toBe(
        true,
      );
      expect(
        record.causes.some((entry) => entry.stack?.includes("terminal-diagnostics.test.ts")),
      ).toBe(true);
      expect(JSON.stringify(record.causes)).not.toContain(secret);
      expect(record.causes.length).toBeLessThanOrEqual(16);
    }),
  );

  it.effect("retains one report identity across preparation, finalization and output failure", () =>
    Effect.gen(function* () {
      const written = yield* Ref.make<ReadonlyArray<TerminalFailureRecord>>([]);
      const diagnostics = yield* makeTerminalDiagnostics({
        eventIdFactory: () => EVENT_ID,
        write: (record) => Ref.update(written, (all) => [...all, record]),
      });
      const original = yield* diagnostics.prepare(failure, new Error("local detail"));
      const finalized = yield* diagnostics.prepare(failure);
      const output = yield* diagnostics.prepare({
        ...failure,
        kind: "output-write-failed",
        operation: "runtime.output",
        phase: "output",
      });
      expect(finalized.eventId).toBe(original.eventId);
      expect(output.eventId).toBe(EVENT_ID);
      expect(output.occurredAt).toBe(original.occurredAt);
      expect(output.causes.some((cause) => cause.message === "local detail")).toBe(true);
      expect((yield* Ref.get(written)).length).toBe(3);
      expect(Option.getOrUndefined(yield* diagnostics.current)?.failure.phase).toBe("output");
    }),
  );

  it.effect("redacts known credentials and tolerates storage and serialization defects", () =>
    Effect.gen(function* () {
      const diagnostics = yield* makeTerminalDiagnostics({
        eventIdFactory: () => EVENT_ID,
        write: () => Effect.die(new Error("disk unavailable")),
      });
      const record = yield* diagnostics.prepare(
        failure,
        new Error("token SYNTHETIC_CREDENTIAL_74"),
        { accessToken: "SYNTHETIC_CREDENTIAL_74" },
      );
      expect(JSON.stringify(record.causes)).not.toContain("SYNTHETIC_CREDENTIAL_74");
      const throwingCause = {
        get message(): string {
          throw new Error("bad accessor");
        },
      };
      const uninspectable = yield* diagnostics.prepare(failure, throwingCause);
      expect(uninspectable.eventId).toBe(EVENT_ID);
    }),
  );

  it.effect(
    "writes bounded atomic files with restricted permissions and removes only its own expired records",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const directory = yield* fs.makeTempDirectoryScoped();
          const oldName = "00000000-0000-4000-8000-000000000002.json";
          const old = path.join(directory, oldName);
          yield* fs.writeFileString(old, "{}", { mode: 0o600 });
          yield* fs.utimes(old, 0, 0);
          yield* TestClock.setTime(DIAGNOSTIC_LIMITS.ageMillis + 1);
          yield* fs.writeFileString(path.join(directory, "unrelated.json"), "keep");
          const diagnostics = yield* makeTerminalDiagnostics({ eventIdFactory: () => EVENT_ID });
          const cause = new Error("x".repeat(100000));
          const record = yield* diagnostics.prepare(
            failure,
            Array.from({ length: 30 }, () => cause),
          );
          yield* writeLocalFailureRecord(record, directory);
          const names = yield* fs.readDirectory(directory);
          expect(names.sort()).toEqual([`${EVENT_ID}.json`, "unrelated.json"]);
          const stat = yield* fs.stat(path.join(directory, `${EVENT_ID}.json`));
          expect(Number(stat.size)).toBeLessThanOrEqual(DIAGNOSTIC_LIMITS.bytes);
          if (process.platform !== "win32") {
            expect(stat.mode & 0o777).toBe(0o600);
            expect((yield* fs.stat(directory)).mode & 0o777).toBe(0o700);
          }
          expect(
            JSON.parse(yield* fs.readFileString(path.join(directory, `${EVENT_ID}.json`))),
          ).toMatchObject({ eventId: EVENT_ID, failure: { operation: "publish.upload" } });
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});
