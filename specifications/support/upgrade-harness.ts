/**
 * Upgrade harness for the delegation and disclosure specifications.
 *
 * `axm upgrade` hands its real work to another tool, so what it publishes
 * while that tool runs is the observable under test. The harness stands in
 * for the installer and the release origin, runs the command through the
 * real machine screen over recording streams, and returns the lifecycle
 * event log the command wrote to standard error alongside the result
 * document it wrote to standard output.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  ExecutionDirectory,
  Homebrew,
  InstallMeta,
  InstallMethod,
  ProgressEventSchema,
  Subprocess,
  TestFlagsLayer,
  UpdateCheck,
  handleUpgrade,
  loadVersion,
  type CommandResult,
  type InstallMethodType,
  type OperationEvent,
} from "axm.sh/specification-harness";

import { stableChannelDocument } from "./release-channel-fixture.js";
import { machineScreenLayer, makeRecordingStreams, type RecordedWrite } from "./screen-harness.js";

export const LOCAL_VERSION = loadVersion();
/** A target the local version is always behind, so the upgrade path is taken. */
export const TARGET_VERSION = "999.0.0";
export const HOMEBREW_EXECUTABLE = "/opt/homebrew/bin/axm";

const BINARY = new TextEncoder().encode("fixture-binary");

export interface Invocation {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
}

const exited = (stdout: string, exitCode = 0): CommandResult => ({
  executionState: "exited",
  exitCode,
  stdout,
  stderr: "",
});

const homebrewInfo = (version: string): string =>
  JSON.stringify({
    formulae: [{ full_name: "agentxm/tap/axm", versions: { stable: version } }],
  });

/**
 * A Homebrew installer that answers every command the upgrade path issues.
 * `laggingFormulaQueries` makes the first N formula queries advertise the
 * installed version, so the convergence poll blocks the way it does when a
 * tap has not finished publishing.
 */
export const homebrewInstaller = (options?: { readonly laggingFormulaQueries?: number }) => {
  const calls: Array<Invocation> = [];
  let formulaQueries = 0;
  const respond = (invocation: Invocation): CommandResult => {
    if (invocation.args[0] === "--version") return exited(`${TARGET_VERSION}\n`);
    if (invocation.executable !== "brew") return exited("");
    switch (invocation.args[0]) {
      case "tap":
        return exited("agentxm/tap\n");
      case "info": {
        formulaQueries += 1;
        return exited(
          homebrewInfo(
            formulaQueries <= (options?.laggingFormulaQueries ?? 0)
              ? LOCAL_VERSION
              : TARGET_VERSION,
          ),
        );
      }
      case "--prefix":
        return exited("/opt/homebrew\n");
      default:
        return exited("");
    }
  };
  return {
    calls,
    layer: Layer.succeed(Subprocess, {
      run: (executable: string, args: ReadonlyArray<string>) =>
        Effect.sync(() => {
          const invocation = { executable, args: [...args] };
          calls.push(invocation);
          return respond(invocation);
        }),
      resolveExecutable: () => Effect.succeed(HOMEBREW_EXECUTABLE),
    }),
  };
};

const releaseChannel = HttpClient.make((request) =>
  Effect.sync(() => {
    if (request.url.endsWith("/SHA256SUMS")) {
      return HttpClientResponse.fromWeb(request, new Response("", { status: 200 }));
    }
    if (request.url.includes("/releases/download/")) {
      return HttpClientResponse.fromWeb(request, new Response(BINARY, { status: 200 }));
    }
    return HttpClientResponse.fromWeb(
      request,
      new Response(JSON.stringify(stableChannelDocument(TARGET_VERSION)), { status: 200 }),
    );
  }),
);

const decodeProgressEvent = Schema.decodeUnknownEffect(ProgressEventSchema);

/** Every lifecycle event the machine screen wrote to standard error, in order. */
const recordedEvents = (log: ReadonlyArray<RecordedWrite>) =>
  Effect.forEach(
    log.flatMap((entry) =>
      entry.channel === "stderr"
        ? entry.content
            .split("\n")
            .filter((line) => line.length > 0)
            .map((line): unknown => JSON.parse(line))
            .filter(
              (value) =>
                typeof value === "object" &&
                value !== null &&
                "type" in value &&
                value.type === "progress",
            )
        : [],
    ),
    (value) => Effect.map(decodeProgressEvent(value), (decoded) => decoded.event),
  );

export interface UpgradeRun {
  /** The published lifecycle events, in the order the command wrote them. */
  readonly events: ReadonlyArray<OperationEvent>;
  /** Every external command the installer was asked to run. */
  readonly calls: ReadonlyArray<Invocation>;
  /** The decoded result document written to standard output. */
  readonly document: unknown;
}

export interface UpgradeRunOptions {
  readonly method?: InstallMethodType;
  readonly dryRun?: boolean;
  readonly laggingFormulaQueries?: number;
  /** Test-clock advance in milliseconds while the command runs, for a blocking poll. */
  readonly advanceMs?: number;
}

/**
 * Run `axm upgrade` against a stand-in Homebrew installation and release
 * origin, and return what the command published while it ran.
 */
export const runUpgrade = (options?: UpgradeRunOptions) =>
  Effect.gen(function* () {
    const streams = makeRecordingStreams();
    const installer = homebrewInstaller(
      options?.laggingFormulaQueries === undefined
        ? undefined
        : { laggingFormulaQueries: options.laggingFormulaQueries },
    );
    const layer = Layer.mergeAll(
      NodeServices.layer,
      machineScreenLayer(streams),
      TestFlagsLayer(),
      Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(process.cwd()) }),
      Layer.succeed(UpdateCheck, {
        readCacheState: () => Effect.succeed({ state: "missing" }),
        readCache: () => Effect.succeed(Option.none()),
        writeCache: () => Effect.void,
        isUpdateAvailable: () => Effect.succeed(Option.none()),
        shouldSkip: () => false,
        notificationMessage: () => "",
      } satisfies typeof UpdateCheck.Service),
      Layer.succeed(InstallMethod, {
        detect: () =>
          Effect.succeed(
            options?.method ??
              new Homebrew({
                execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm`,
                detectionSource: "resolved-executable-path",
                evidence: [`resolved-executable:${HOMEBREW_EXECUTABLE}`],
                confidence: "high",
              }),
          ),
      }),
      Layer.succeed(InstallMeta, {
        read: () => Effect.succeed(Option.none()),
        write: () => Effect.void,
      }),
      Layer.succeed(HttpClient.HttpClient, releaseChannel),
      installer.layer,
    );

    const fiber = yield* handleUpgrade({
      reinstall: false,
      ...(options?.dryRun === true ? { dryRun: true } : {}),
    }).pipe(Effect.provide(layer), Effect.forkChild);
    if (options?.advanceMs !== undefined) yield* TestClock.adjust(options.advanceMs);
    yield* Fiber.join(fiber);

    const events = yield* recordedEvents(streams.log);
    const stdout = streams.log.find((entry) => entry.channel === "stdout");
    return {
      events,
      calls: installer.calls,
      document: stdout === undefined ? undefined : JSON.parse(stdout.content),
    };
  });

/** The label a unit carried when it started. */
export const unitStartLabel = (
  events: ReadonlyArray<OperationEvent>,
  unitId: string,
): string | undefined =>
  events.flatMap((event) =>
    event._tag === "UnitStarted" && event.unitId === unitId ? [event.label] : [],
  )[0];

/** The label a unit settled with — the fact it resolved, when it reports one. */
export const unitResolvedLabel = (
  events: ReadonlyArray<OperationEvent>,
  unitId: string,
): string | undefined =>
  events.flatMap((event) =>
    event._tag === "UnitResolved" && event.unitId === unitId ? [event.label] : [],
  )[0];

/** The index of the first event matching a predicate, or -1. */
export const indexOfEvent = (
  events: ReadonlyArray<OperationEvent>,
  match: (event: OperationEvent) => boolean,
): number => events.findIndex(match);
