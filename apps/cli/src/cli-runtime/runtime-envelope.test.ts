import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ConfigError } from "effect/Config";
import { SourceError } from "effect/ConfigProvider";
import { SkillSelectionCancelled } from "@agentxm/workspace/skills/lifecycle/application";
import { SubagentSelectionCancelled } from "@agentxm/workspace/subagents/lifecycle/application";

import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Screen, OutputStreams, ScreenLoggerLive, QuestionCancelled } from "../screen/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { verboseFlag, debugFlag, quietFlag, jsonFlag } from "../cli-flags/index.js";
import { nonInteractiveFlag } from "../cli-flags/index.js";
import { ExitCode, makeAppError } from "../app-error/index.js";
import * as Data from "effect/Data";
import { commandExit, isCommandExit } from "./command-exit.js";
import { captureTelemetry } from "../test-support/telemetry-harness.js";
import {
  exitCodeForSemanticProperties,
  makeFoundationLayer,
  withCliErrorHandling,
  writeDefect,
  writeExpectedCliError,
} from "./runtime-envelope.js";

/**
 * Structural stand-in for the workspace configuration feature's typed
 * cancellation: the envelope dispatches on the tag alone, and the residue may
 * not depend on feature packages.
 */
class WorkspaceInitializationCancelled extends Data.TaggedError(
  "WorkspaceInitializationCancelled",
)<{ readonly message: string }> {}

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
  it.effect("provides Screen in text mode", () =>
    Effect.gen(function* () {
      const screen = yield* Screen.pipe(Effect.provide(testLayer("text")));
      expect(screen).toBeDefined();
      expect(screen.result).toBeDefined();
      expect(screen.observe).toBeDefined();
    }),
  );

  it.effect("provides a machine Screen in json mode", () =>
    Effect.gen(function* () {
      const screen = yield* Screen.pipe(Effect.provide(testLayer("json")));
      const emitted = yield* screen.document("test", Schema.String);
      expect(emitted).toBe(true);
    }),
  );

  it.effect("provides an interactive Screen when format is text", () =>
    Effect.gen(function* () {
      const screen = yield* Screen.pipe(Effect.provide(testLayer("text")));
      const emitted = yield* screen.document("test", Schema.String);
      expect(emitted).toBe(false);
    }),
  );

  it.effect("provides Verbosity service with default level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.pipe(Effect.provide(testLayer("text")));
      expect(v.level).toBe("normal");
      expect(v.isAtLeast("normal")).toBe(true);
      expect(v.isAtLeast("verbose")).toBe(false);
    }),
  );

  it.effect("provides Verbosity service with custom level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.pipe(
        Effect.provide(testLayer("text", { verbosityLevel: "verbose" })),
      );
      expect(v.level).toBe("verbose");
      expect(v.isAtLeast("verbose")).toBe(true);
      expect(v.isAtLeast("debug")).toBe(false);
    }),
  );

  it.effect("provides Verbosity at debug level", () =>
    Effect.gen(function* () {
      const v = yield* Verbosity.pipe(
        Effect.provide(testLayer("text", { verbosityLevel: "debug" })),
      );
      expect(v.level).toBe("debug");
      expect(v.isAtLeast("debug")).toBe(true);
    }),
  );

  it.effect("provides all services together", () =>
    Effect.gen(function* () {
      const layer = testLayer("text", { verbosityLevel: "verbose" });

      const renderer = yield* Screen.pipe(Effect.provide(layer));
      const verbosity = yield* Verbosity.pipe(Effect.provide(layer));

      expect(renderer).toBeDefined();
      expect(verbosity.level).toBe("verbose");
    }),
  );
});

describe("exitCodeForSemanticProperties", () => {
  it("returns issues when a command reports failed steps", () => {
    expect(exitCodeForSemanticProperties({ "cli.failed_count": 1 })).toBe(ExitCode.Issues);
  });

  it("returns issues when a command reports blocked steps", () => {
    expect(exitCodeForSemanticProperties({ "cli.blocked_count": 1 })).toBe(ExitCode.Issues);
  });

  it("maps plan execution reasons to stable process exits", () => {
    expect(exitCodeForSemanticProperties({ "cli.reason": "approval-required" })).toBe(
      ExitCode.Usage,
    );
    expect(exitCodeForSemanticProperties({ "cli.reason": "override-required" })).toBe(
      ExitCode.Usage,
    );
    expect(exitCodeForSemanticProperties({ "cli.reason": "stale-candidate" })).toBe(
      ExitCode.Conflict,
    );
    expect(exitCodeForSemanticProperties({ "cli.reason": "interrupted" })).toBe(130);
    expect(exitCodeForSemanticProperties({ "cli.reason": "execution-failed" })).toBe(
      ExitCode.Issues,
    );
    expect(
      exitCodeForSemanticProperties({
        "cli.reason": "hard-blocked",
        "cli.error_code": "auth_required",
      }),
    ).toBe(ExitCode.AuthRequired);
  });

  it("returns undefined for successful or missing plan counts", () => {
    expect(
      exitCodeForSemanticProperties({
        "cli.failed_count": 0,
        "cli.blocked_count": 0,
        "cli.outcome": "applied",
      }),
    ).toBeUndefined();
    expect(exitCodeForSemanticProperties({})).toBeUndefined();
  });
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
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
    stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((...args: Array<unknown>) => {
        stderrWrites.push(String(args[0]));
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  it.effect(
    "text mode: writes human-readable defect to stderr only, leaving stdout untouched",
    () =>
      Effect.gen(function* () {
        yield* writeDefect(Cause.die(new Error("boom")), "text").pipe(
          Effect.provide(testLayer("text")),
        );

        expect(stdoutWrites).toEqual([]);
        expect(stderrWrites).toHaveLength(1);
        expect(stderrWrites[0]).toMatch(/^ (?:✖ {3}|xx {2})/);
        expect(stderrWrites[0]).toContain("An unexpected error occurred");
        expect(stderrWrites[0]).not.toContain("✗");
        expect(stderrWrites[0]).toContain("boom");
      }),
  );

  it.effect("json mode: emits one JSON envelope on stdout and pure NDJSON on stderr", () =>
    Effect.gen(function* () {
      yield* writeDefect(Cause.die(new Error("boom")), "json").pipe(
        Effect.provide(testLayer("json")),
      );

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
        // Schema-conformant ErrorEvent: { type, code, message } — full detail
        // (title/detail/suggestions) lives in the stdout envelope.
        expect(event).toEqual({
          type: "error",
          code: "internal",
          message: "boom",
        });
      }
    }),
  );

  it.effect("json mode: stringifies non-Error defects via String()", () =>
    Effect.gen(function* () {
      yield* writeDefect(Cause.die("kaboom"), "json").pipe(Effect.provide(testLayer("json")));

      expect(stdoutWrites).toHaveLength(1);
      const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
      expect(stdoutDoc).toMatchObject({
        ok: false,
        code: "internal",
        title: "Internal Error",
        detail: "kaboom",
      });
    }),
  );
});

// ---------------------------------------------------------------------------
// writeExpectedCliError — suggestions rendered once per channel
// ---------------------------------------------------------------------------

describe("writeExpectedCliError", () => {
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
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
    stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((...args: Array<unknown>) => {
        stderrWrites.push(String(args[0]));
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  const conflictError = makeAppError({
    code: "conflict",
    detail: "Skill 'test' already exists in settings",
    recover: "Choose a different name or remove the existing skill first",
  });

  it.effect("text mode: renders the suggestion exactly once (no duplicate block)", () =>
    Effect.gen(function* () {
      yield* writeExpectedCliError(conflictError, "text").pipe(Effect.provide(testLayer("text")));

      const stderr = stderrWrites.join("");
      // The error Doc owns the single suggestions block.
      expect(stderr).toContain("Next");
      expect(stderr.split("Next").length - 1).toBe(1);
      // The suggestion text appears once across the whole stderr output.
      const occurrences =
        stderr.split("Choose a different name or remove the existing skill first").length - 1;
      expect(occurrences).toBe(1);
    }),
  );

  it.effect(
    "json mode: streams suggestion + error events on stderr and one envelope on stdout",
    () =>
      Effect.gen(function* () {
        yield* writeExpectedCliError(conflictError, "json").pipe(Effect.provide(testLayer("json")));

        // stderr is the live event stream: suggestion(s) first, then the error.
        const events = stderrWrites.map((line) => JSON.parse(line.trim()) as unknown);
        expect(events).toEqual([
          {
            type: "suggestion",
            description: "Choose a different name or remove the existing skill first",
          },
          {
            type: "error",
            code: "conflict",
            message: "Skill 'test' already exists in settings",
          },
        ]);

        // stdout is the final document; it also carries the suggestions. The two
        // surfaces are distinct — not a doubled block on one channel.
        expect(stdoutWrites).toHaveLength(1);
        const envelope: unknown = JSON.parse(stdoutWrites[0] ?? "");
        expect(envelope).toMatchObject({
          ok: false,
          code: "conflict",
          suggestions: [
            { description: "Choose a different name or remove the existing skill first" },
          ],
        });
      }),
  );

  it.effect("stays silent for WorkspaceInitializationCancelled in both formats", () =>
    Effect.gen(function* () {
      const cancellation = new WorkspaceInitializationCancelled({
        message: "Operation cancelled.",
      });

      yield* writeExpectedCliError(cancellation, "text").pipe(Effect.provide(testLayer("text")));
      yield* writeExpectedCliError(cancellation, "json").pipe(Effect.provide(testLayer("json")));

      expect(stdoutWrites).toEqual([]);
      expect(stderrWrites).toEqual([]);
    }),
  );

  it.effect("text mode: uses Verbosity service for debug cause details", () =>
    Effect.gen(function* () {
      const cause = new Error("settings decode failed");
      cause.stack = "Error: settings decode failed\n at decode";
      const error = makeAppError({
        code: "internal",
        detail: "Failed to read workspace settings",
        cause,
      });

      yield* writeExpectedCliError(error, "text").pipe(
        Effect.provide(testLayer("text", { verbosityLevel: "debug" })),
      );

      const stderr = stderrWrites.join("");
      expect(stderr).toContain("Cause: Error: settings decode failed");
      expect(stderr).toContain("Stack: Error: settings decode failed");
      expect(stderr).toContain("Stack: at decode");
    }),
  );
});

// ---------------------------------------------------------------------------
// withCliErrorHandling — cancellation errors exit successfully and silently
// ---------------------------------------------------------------------------

describe("withCliErrorHandling cancellation", () => {
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
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
    stderrWriteSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((...args: Array<unknown>) => {
        stderrWrites.push(String(args[0]));
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.();
        return true;
      });
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    stderrWriteSpy.mockRestore();
  });

  const stubHttpClient = HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("Unexpected test HTTP request", { status: 500 }),
      ),
    ),
  );

  for (const outcome of [
    { failure: commandExit(0), result: "success", exitCode: 0 },
    { failure: commandExit(2), result: "error", exitCode: 2 },
    {
      failure: new QuestionCancelled({ message: "Operation cancelled." }),
      result: "cancelled",
      exitCode: 0,
    },
    {
      failure: new ConfigError(new SourceError({ message: "Configuration source unavailable" })),
      result: "error",
      exitCode: ExitCode.Unavailable,
    },
  ]) {
    it.effect(
      `records ${outcome.failure._tag} (${outcome.exitCode}) as ${outcome.result}, never a defect`,
      () =>
        Effect.gen(function* () {
          const capture = captureTelemetry();
          const exit = yield* withCliErrorHandling(Effect.fail(outcome.failure), {
            command: "test",
            format: "text",
            telemetryConfig: {
              mode: "all",
              client: { name: "cli", version: "1.2.3" },
              deliverInTest: true,
              installationId: "00000000-0000-4000-8000-000000000001",
              eventIdFactory: () => "00000000-0000-4000-8000-000000000002",
            },
          }).pipe(Effect.provideService(HttpClient.HttpClient, capture.client), Effect.exit);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(Cause.hasDies(exit.cause)).toBe(false);
            expect(Option.getOrUndefined(Cause.findErrorOption(exit.cause))).toMatchObject({
              _tag: "CommandExit",
              exitCode: outcome.exitCode,
            });
          }
          expect(capture.requests.map((request) => request.body)).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                events: expect.arrayContaining([
                  expect.objectContaining({
                    event: "command_completed",
                    properties: expect.objectContaining({ "cli.result": outcome.result }),
                  }),
                ]),
              }),
            ]),
          );
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              globalFlagLayer,
              testLayer("text"),
              Layer.succeed(jsonFlag, Option.none()),
              NodeServices.layer,
            ),
          ),
        ),
    );
  }

  it.effect("retains an owned delivery failure after its diagnostic reaches stderr", () =>
    Effect.gen(function* () {
      stdoutWriteSpy.mockImplementation((...args: Array<unknown>) => {
        stdoutWrites.push(String(args[0]));
        const callback = args.find(
          (arg): arg is (error?: Error | null) => void => typeof arg === "function",
        );
        callback?.(Object.assign(new Error("private credential detail"), { code: "EPIPE" }));
        return true;
      });
      const program = Effect.gen(function* () {
        const streams = yield* OutputStreams;
        yield* streams.credential("credential\n").pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "unavailable",
              detail: "The created token could not be delivered and was revoked.",
              cause,
            }),
          ),
        );
      });
      const exit = yield* withCliErrorHandling(program, {
        command: "token create",
        format: "text",
        telemetryConfig: { mode: "off", client: { name: "cli", version: "0.0.0" } },
      }).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(false);
        expect(Option.getOrUndefined(Cause.findErrorOption(exit.cause))).toMatchObject({
          _tag: "CommandExit",
          exitCode: ExitCode.Unavailable,
        });
      }
      expect(stdoutWrites).toEqual(["credential\n"]);
      expect(stderrWrites.join("")).toContain("was revoked");
      expect(stderrWrites.join("")).not.toContain("private credential detail");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          globalFlagLayer,
          Layer.provideMerge(ScreenLoggerLive("normal"), testLayer("text")),
          Layer.succeed(jsonFlag, Option.none()),
          Layer.succeed(HttpClient.HttpClient, stubHttpClient),
          NodeServices.layer,
        ),
      ),
    ),
  );

  for (const output of ["result", "observation", "expected-error", "diagnostic"] as const) {
    it.effect(`fails ${output} delivery without recursively writing to a broken channel`, () =>
      Effect.gen(function* () {
        stderrWriteSpy.mockImplementation((...args: Array<unknown>) => {
          stderrWrites.push(String(args[0]));
          const callback = args.find(
            (arg): arg is (error?: Error | null) => void => typeof arg === "function",
          );
          callback?.(Object.assign(new Error("sensitive stream detail"), { code: "EPIPE" }));
          return true;
        });
        stdoutWriteSpy.mockImplementation((...args: Array<unknown>) => {
          stdoutWrites.push(String(args[0]));
          const callback = args.find(
            (arg): arg is (error?: Error | null) => void => typeof arg === "function",
          );
          callback?.(Object.assign(new Error("sensitive stream detail"), { code: "EPIPE" }));
          return true;
        });
        const program =
          output === "expected-error"
            ? Effect.fail(makeAppError({ code: "conflict", detail: "Cannot apply this change" }))
            : Effect.gen(function* () {
                if (output === "result") {
                  const screen = yield* Screen;
                  yield* screen.result([{ _tag: "raw", content: "required result\n" }]);
                } else if (output === "diagnostic") {
                  yield* Effect.logWarning("queued diagnostic");
                } else {
                  const streams = yield* OutputStreams;
                  // Observation-only callers retain output failure for Screen.settle.
                  yield* streams.stderr("progress\n").pipe(Effect.ignore);
                  yield* streams.stderr("next progress\n").pipe(Effect.ignore);
                }
              });
        const exit = yield* withCliErrorHandling(program, {
          command: "test",
          format: "text",
          telemetryConfig: { mode: "off", client: { name: "cli", version: "0.0.0" } },
        }).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(false);
          expect(Option.getOrUndefined(Cause.findErrorOption(exit.cause))).toMatchObject({
            _tag: "CommandExit",
            exitCode: ExitCode.Internal,
          });
        }
        expect(stdoutWrites.length + stderrWrites.length).toBe(1);
        expect(stdoutWrites.concat(stderrWrites).join("")).not.toContain("sensitive stream detail");
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            globalFlagLayer,
            Layer.provideMerge(ScreenLoggerLive("normal"), testLayer("text")),
            Layer.succeed(jsonFlag, Option.none()),
            Layer.succeed(HttpClient.HttpClient, stubHttpClient),
            NodeServices.layer,
          ),
        ),
      ),
    );
  }

  for (const Cancellation of [
    WorkspaceInitializationCancelled,
    SkillSelectionCancelled,
    SubagentSelectionCancelled,
  ]) {
    it.effect(`maps ${Cancellation.name} to a silent success exit`, () =>
      Effect.gen(function* () {
        const exit = yield* withCliErrorHandling(
          Effect.fail(new Cancellation({ message: "Operation cancelled." })),
          {
            command: "setup",
            format: "text",
            telemetryConfig: { mode: "off", client: { name: "cli", version: "0.0.0" } },
          },
        ).pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(false);
          const defect = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
          expect(isCommandExit(defect)).toBe(true);
          if (isCommandExit(defect)) {
            expect(defect.exitCode).toBe(ExitCode.Success);
          }
        }
        expect(stdoutWrites).toEqual([]);
        expect(stderrWrites).toEqual([]);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            globalFlagLayer,
            testLayer("text"),
            Layer.succeed(jsonFlag, Option.none()),
            Layer.succeed(HttpClient.HttpClient, stubHttpClient),
            NodeServices.layer,
          ),
        ),
      ),
    );
  }
});
