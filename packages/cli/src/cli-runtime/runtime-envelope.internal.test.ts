import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { CliRenderer } from "../cli-renderer/index.js";
import { Verbosity } from "../cli-flags/index.js";
import { verboseFlag, debugFlag, quietFlag, jsonFlag } from "../cli-flags/index.js";
import { nonInteractiveFlag } from "../cli-flags/index.js";
import { ExitCode, makeAppError } from "../app-error/index.js";
import * as Data from "effect/Data";
import { isEffectCliExit } from "./effect-cli-exit.js";
import {
  exitCodeForSemanticProperties,
  makeFoundationLayer,
  withCliErrorHandling,
  writeDefect,
  writeExpectedCliError,
} from "./runtime-envelope.js";

/**
 * Structural stand-in for the workspace-configuration feature's typed
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
  it.effect("provides CliRenderer service in text mode (interactive)", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.pipe(Effect.provide(testLayer("text")));
      expect(renderer).toBeDefined();
      expect(renderer.intro).toBeDefined();
      expect(renderer.table).toBeDefined();
    }),
  );

  it.effect("provides CliRenderer as MachineRenderer in json mode", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.pipe(Effect.provide(testLayer("json")));
      expect(renderer).toBeDefined();
      // Machine renderer: result() returns true
      const emitted = yield* renderer.result("test", Schema.String);
      expect(emitted).toBe(true);
    }),
  );

  it.effect("provides CliRenderer as InteractiveRenderer when format is text", () =>
    Effect.gen(function* () {
      const renderer = yield* CliRenderer.pipe(Effect.provide(testLayer("text")));
      // Interactive renderer: result() returns false (no machine output)
      const emitted = yield* renderer.result("test", Schema.String);
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

      const renderer = yield* CliRenderer.pipe(Effect.provide(layer));
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
    expect(stderrWrites[0]).toContain("✖  boom");
    expect(stderrWrites[0]).not.toContain("✗");
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
      // Schema-conformant ErrorEvent: { type, code, message } — full detail
      // (title/detail/suggestions) lives in the stdout envelope.
      expect(event).toEqual({
        type: "error",
        code: "internal",
        message: "boom",
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

  const conflictError = makeAppError({
    code: "conflict",
    detail: "Skill 'test' already exists in settings",
    recover: "Choose a different name or remove the existing skill first",
  });

  it.effect("text mode: renders the suggestion exactly once (no duplicate block)", () =>
    Effect.gen(function* () {
      yield* writeExpectedCliError(conflictError, "text");

      const stderr = stderrWrites.join("");
      // renderAppError owns the single suggestions block.
      expect(stderr).toContain("Next:");
      expect(stderr.split("Next:").length - 1).toBe(1);
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
        yield* writeExpectedCliError(conflictError, "json");

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

      yield* writeExpectedCliError(cancellation, "text");
      yield* writeExpectedCliError(cancellation, "json");

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
      expect(stderr).toContain("Stack:  at decode");
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

  const stubHttpClient = HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response("Unexpected test HTTP request", { status: 500 }),
      ),
    ),
  );

  it.effect("maps WorkspaceInitializationCancelled to a silent success exit", () =>
    Effect.gen(function* () {
      const exit = yield* withCliErrorHandling(
        Effect.fail(new WorkspaceInitializationCancelled({ message: "Operation cancelled." })),
        {
          command: "setup",
          format: "text",
          telemetryConfig: { mode: "off", client: { name: "cli", version: "0.0.0" } },
        },
      ).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const defect = Cause.squash(exit.cause);
        expect(isEffectCliExit(defect)).toBe(true);
        if (isEffectCliExit(defect)) {
          expect(defect.exitCode).toBe(ExitCode.Success);
        }
      }
      expect(stdoutWrites).toEqual([]);
      expect(stderrWrites).toEqual([]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          globalFlagLayer,
          Layer.succeed(jsonFlag, Option.none()),
          Layer.succeed(HttpClient.HttpClient, stubHttpClient),
        ),
      ),
    ),
  );
});
