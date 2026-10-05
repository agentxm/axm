/**
 * Requirement: system/reliability/telemetry-reports-terminal-failures-once.
 *
 * Bound at the two places an invocation settles: the command envelope, which
 * settles configuration, command, and output failures, and the process entry
 * wrapper, which owns the invocation's one reporter and reports a failure that
 * escapes every envelope. Configuration failures arise where production
 * raises them, while the command's workspace boundary builds its workspace.
 * Each case runs twice — with telemetry off, then opted in over a capturing
 * transport — so the rendered output and the exit the process would take are
 * compared against an observed baseline.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type * as HttpClient from "effect/http/HttpClient";
import { CliOutput } from "effect/cli";

import { RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { StepFailure } from "@agentxm/workspace-kernel/operations";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { runCommand } from "../app.js";
import { makeAppError } from "../app-error/index.js";
import { TestFlagsLayer } from "../cli-flags/index.js";
import { ExecutionDirectory } from "../execution-directory.js";
import { makeAxmFormatter } from "../formatter.js";
import { baseLayer, withWorkspace, makeArtifactHttpClientLayer } from "../runtime.js";
import {
  OutputStreams,
  OutputWriteFailed,
  QuestionCancelled,
  Screen,
  ScreenMachine,
} from "../screen/index.js";
import { TelemetryErrorReport, type TelemetryFailurePhase } from "../telemetry/index.js";
import { captureTelemetry, telemetryReporterLayer } from "../test-support/telemetry-harness.js";
import { classifyError, withCliErrorHandling, withProcessTelemetry } from "./index.js";

export const specification = defineSpecification({
  requirement: "system/reliability/telemetry-reports-terminal-failures-once",
  title: "An opted-in invocation reports at most one terminal failure",
  statement:
    "After consent is resolved, an opted-in invocation shall report at most one terminal failure, covering startup, configuration, command, and output settlement, and shall report none for success, cancellation, or a recovered failure.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "system/security/telemetry-consent-and-precedence",
    "system/reliability/telemetry-failure-never-alters-outcomes",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeErrorReport = (input: unknown) =>
  Schema.decodeUnknownEffect(TelemetryErrorReport)(input, { onExcessProperty: "error" });

const reporterLayer = (client: HttpClient.HttpClient, mode: "all" | "off") =>
  telemetryReporterLayer({
    client,
    reporter: {
      mode,
      client: { name: "cli", version: "1.2.3" },
      // The repository's own test run suppresses delivery; this specification
      // observes it, so it asks for delivery explicitly.
      deliverInTest: true,
      installationId: "00000000-0000-4000-8000-000000000001",
    },
  });

interface RecordedWrite {
  readonly channel: "stdout" | "stderr";
  readonly content: string;
}

/** Output streams that record every write; stdout can be a closed pipe. */
const recordingStreams = (brokenStdout: boolean) => {
  const log: Array<RecordedWrite> = [];
  const closedPipe = new OutputWriteFailed({ channel: "stdout", reason: "EPIPE" });
  let stdoutFailed = false;
  const record = (channel: RecordedWrite["channel"]) => (content: string) =>
    Effect.sync(() => void log.push({ channel, content }));
  const layer = Layer.succeed(OutputStreams, {
    stdout: (content) =>
      brokenStdout
        ? Effect.sync(() => {
            stdoutFailed = true;
          }).pipe(Effect.andThen(Effect.fail(closedPipe)))
        : record("stdout")(content),
    stderr: record("stderr"),
    credential: record("stdout"),
    facts: Effect.succeed({
      columns: 80,
      rows: 24,
      stdoutColumns: 80,
      stdoutIsTTY: false,
      stderrIsTTY: false,
    }),
    check: Effect.suspend(() => (stdoutFailed ? Effect.fail(closedPipe) : Effect.void)),
    resize: Stream.empty,
  });
  return { log, layer };
};

/** The machine-output screen, flags, and platform one invocation runs with. */
const invocationLayer = (streams: ReturnType<typeof recordingStreams>) =>
  Layer.mergeAll(
    Layer.provide(ScreenMachine(), streams.layer),
    TestFlagsLayer({ json: true }),
    Layer.provideMerge(WorkspaceFileWriteLocksLive, NodeServices.layer),
  );

/** What the process renders and exits with once the invocation ends. */
const processResult = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isSuccess(exit)
    ? exit.value
    : Cause.hasInterruptsOnly(exit.cause)
      ? "interrupted"
      : classifyError(Cause.squash(exit.cause), "json");

const isErrorReport = (request: { readonly url: string }) => request.url.endsWith("/v1/errors");

/** Run one invocation under the process entry wrapper with the given consent. */
const observe = <A, E, R>(
  invocation: Effect.Effect<A, E, R>,
  options: { readonly mode: "all" | "off"; readonly brokenStdout?: boolean },
) =>
  Effect.gen(function* () {
    const capture = captureTelemetry();
    const streams = recordingStreams(options.brokenStdout === true);
    const exit = yield* invocation.pipe(
      withProcessTelemetry(reporterLayer(capture.client, options.mode)),
      Effect.provide(invocationLayer(streams)),
      Effect.exit,
    );
    return {
      result: processResult(exit),
      output: streams.log,
      reports: capture.requests.filter(isErrorReport),
    };
  });

/**
 * The invocation's error reports when opted in, after checking that opting in
 * changed neither its output nor the exit the process takes.
 */
const reportsOf = <A, E, R>(
  invocation: Effect.Effect<A, E, R>,
  options: { readonly brokenStdout?: boolean } = {},
) =>
  Effect.gen(function* () {
    const baseline = yield* observe(invocation, { ...options, mode: "off" });
    const observed = yield* observe(invocation, { ...options, mode: "all" });
    expect(baseline.reports).toEqual([]);
    expect(observed.result).toEqual(baseline.result);
    expect(observed.output).toEqual(baseline.output);
    return yield* Effect.forEach(observed.reports, ({ body }) => decodeErrorReport(body));
  });

const expectOneReport = (
  reports: ReadonlyArray<TelemetryErrorReport>,
  expected: {
    readonly phase: TelemetryFailurePhase;
    readonly kind: string;
    readonly category: string;
    readonly handled: boolean;
    readonly command?: string;
  },
) => {
  expect(reports).toHaveLength(1);
  expect(reports[0]?.phase).toBe(expected.phase);
  expect(reports[0]?.command).toBe(expected.command);
  expect(reports[0]?.failure).toMatchObject({
    kind: expected.kind,
    category: expected.category,
    handled: expected.handled,
  });
};

const envelope = { command: "list", format: "json" } as const;

const notFound = makeAppError({
  code: "not_found",
  detail: "No installed extension is named review.",
});

const writeResult = Screen.use((screen) =>
  screen.result([{ _tag: "raw", content: '{"ok":true}\n' }]),
);

const temporaryDirectory = Effect.acquireRelease(
  Effect.sync(() => fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-terminal-failure-"))),
  (directory) => Effect.sync(() => fs.rmSync(directory, { recursive: true, force: true })),
);

/** A command bound to the project workspace at `root`, as production binds one. */
const inProjectWorkspace = <A, R>(
  root: string,
  command: Effect.Effect<A, StepFailure | OutputWriteFailed, R>,
) =>
  command.pipe(
    withWorkspace({ scope: "project", allowUninitialized: true }),
    Effect.provide(makeArtifactHttpClientLayer(globalThis.fetch)),
    Effect.provideService(ExecutionDirectory, { path: decodeAbsolutePathSync(root) }),
    // Building the workspace never reaches the Registry here.
    Effect.provide(
      Layer.provide(
        RegistryClientFactoryTest(FetchHttpClient.layer, "https://registry.invalid"),
        NodeServices.layer,
      ),
    ),
  );

describe("Terminal failure reporting", () => {
  it.effect(
    "a workspace configuration failure before the command runs is reported once, in the configuration phase",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* temporaryDirectory;
          fs.writeFileSync(nodePath.join(root, "axm.json"), "{ not settings\n");

          const reports = yield* reportsOf(
            withCliErrorHandling(inProjectWorkspace(root, writeResult), envelope),
          );

          expectOneReport(reports, {
            phase: "configuration",
            kind: "settings-parse-error",
            category: "validation",
            handled: true,
            command: "list",
          });
        }),
      ),
  );

  it.effect(
    "a workspace failure the command raises after its workspace is built is reported once, in the command phase",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const root = yield* temporaryDirectory;
          const raised = Effect.fail(
            new StepFailure({ category: "validation", detail: "The selection names no unit." }),
          );

          const reports = yield* reportsOf(
            withCliErrorHandling(inProjectWorkspace(root, raised), envelope),
          );

          expectOneReport(reports, {
            phase: "command",
            kind: "validation",
            category: "validation",
            handled: true,
            command: "list",
          });
        }),
      ),
  );

  it.effect("a handled command error is reported once, in the command phase", () =>
    Effect.gen(function* () {
      const reports = yield* reportsOf(withCliErrorHandling(Effect.fail(notFound), envelope));

      expectOneReport(reports, {
        phase: "command",
        kind: "not_found",
        category: "not_found",
        handled: true,
        command: "list",
      });
    }),
  );

  it.effect("a defect is reported once, as unhandled, in the command phase", () =>
    Effect.gen(function* () {
      const reports = yield* reportsOf(
        withCliErrorHandling(
          Effect.die(new TypeError("Cannot read properties of undefined")),
          envelope,
        ),
      );

      expectOneReport(reports, {
        phase: "command",
        kind: "defect.type-error",
        category: "internal",
        handled: false,
        command: "list",
      });
    }),
  );

  it.effect("an output write failure is reported once, in the output phase", () =>
    Effect.gen(function* () {
      const reports = yield* reportsOf(withCliErrorHandling(writeResult, envelope), {
        brokenStdout: true,
      });

      expectOneReport(reports, {
        phase: "output",
        kind: "output-write-failed",
        category: "internal",
        handled: true,
        command: "list",
      });
    }),
  );

  it.effect("a usage error before any command runs is reported once, in the startup phase", () =>
    Effect.gen(function* () {
      const reports = yield* reportsOf(
        runCommand(["install", "--no-such-flag"], true).pipe(
          Effect.provide(Layer.mergeAll(baseLayer, CliOutput.layer(makeAxmFormatter()))),
        ),
      );

      expectOneReport(reports, {
        phase: "bootstrap",
        kind: "unrecognized-option",
        category: "usage",
        handled: true,
      });
    }),
  );

  it.effect(
    "a failure of help, which runs without the envelope, is reported once as the command's",
    () =>
      Effect.gen(function* () {
        const reports = yield* reportsOf(
          runCommand(["help", "no-such-topic"], true).pipe(
            Effect.provide(Layer.mergeAll(baseLayer, CliOutput.layer(makeAxmFormatter()))),
          ),
        );

        expectOneReport(reports, {
          phase: "command",
          kind: "not_found",
          category: "not_found",
          handled: true,
          command: "help",
        });
      }),
  );

  it.effect("a failure after the command already reported one adds no second report", () =>
    Effect.gen(function* () {
      // The command settles with its own failure; a later write — such as a
      // notice after the command — then fails and ends the process.
      const reports = yield* reportsOf(
        withCliErrorHandling(Effect.fail(notFound), envelope).pipe(
          Effect.andThen(
            Effect.fail(new OutputWriteFailed({ channel: "stderr", reason: "EPIPE" })),
          ),
        ),
      );

      expectOneReport(reports, {
        phase: "command",
        kind: "not_found",
        category: "not_found",
        handled: true,
        command: "list",
      });
    }),
  );

  it.effect("a successful invocation reports nothing", () =>
    Effect.gen(function* () {
      expect(yield* reportsOf(withCliErrorHandling(writeResult, envelope))).toEqual([]);
    }),
  );

  it.effect("a failure the command recovers from reports nothing", () =>
    Effect.gen(function* () {
      const recovered = Effect.fail(notFound).pipe(Effect.catch(() => writeResult));
      expect(yield* reportsOf(withCliErrorHandling(recovered, envelope))).toEqual([]);
    }),
  );

  it.effect("a declined question reports nothing", () =>
    Effect.gen(function* () {
      const declined = Effect.fail(new QuestionCancelled({ message: "Operation cancelled." }));
      expect(yield* reportsOf(withCliErrorHandling(declined, envelope))).toEqual([]);
    }),
  );

  it.effect("an interrupted invocation reports nothing", () =>
    Effect.gen(function* () {
      const interrupt = (mode: "all" | "off") =>
        Effect.gen(function* () {
          const capture = captureTelemetry();
          const streams = recordingStreams(false);
          const started = yield* Deferred.make<void>();
          const running = yield* withCliErrorHandling(
            Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
            envelope,
          ).pipe(
            withProcessTelemetry(reporterLayer(capture.client, mode)),
            Effect.provide(invocationLayer(streams)),
            Effect.forkChild,
          );
          yield* Deferred.await(started);
          yield* Fiber.interrupt(running);
          const exit = yield* Fiber.await(running);
          return {
            result: processResult(exit),
            output: streams.log,
            reports: capture.requests.filter(isErrorReport),
          };
        });

      const baseline = yield* interrupt("off");
      const observed = yield* interrupt("all");
      expect(baseline.result).toBe("interrupted");
      expect(observed.result).toBe("interrupted");
      expect(observed.output).toEqual(baseline.output);
      expect(observed.reports).toEqual([]);
    }),
  );
});
