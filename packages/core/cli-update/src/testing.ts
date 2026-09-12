/**
 * Deterministic ports for specifying and testing the self-update capability
 * without touching the machine it runs on, and without a terminal: a
 * recording subprocess that answers installer commands, a chosen install
 * method, an install-metadata record and channel cache in memory, a release
 * origin served from a fixture, and a trial runner that returns the lifecycle
 * events the upgrade published while it ran.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

import { stableChannelDocument } from "@agentxm/cli-maintenance/self-update/testing";
import { UpgradePreparationLive } from "./live.js";
import { Homebrew, type InstallMethodType } from "@agentxm/cli-maintenance/self-update/domain";

import * as fs from "node:fs";
import * as nodePath from "node:path";
import { createHash } from "node:crypto";

import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import {
  OperationLifecycle,
  makeOperationLifecycle,
  subscribeLossless,
  type OperationEvent,
} from "@agentxm/workspace-operations";

import { InstallMeta, type InstallMetaData } from "./install-meta/install-meta.js";
import { InstallMethod } from "./install-method/install-method.js";
import { Subprocess, type CommandResult, type RunCommandOptions } from "./subprocess/subprocess.js";
import { UpdateCheck } from "./update-check/update-check.js";
import {
  UpgradeWorkingDirectory,
  prepareUpgrade,
  type UpgradeRequest,
  type UpgradeFailed,
} from "@agentxm/cli-maintenance/self-update/application";
import { previewOrApply } from "./upgrade/use-case.js";
import type { UpgradeAssessmentResult } from "./upgrade/mechanism.js";

export { InstallMethodTest } from "./install-method/install-method.js";
export { UpdateCheckTest } from "./update-check/update-check.js";

/** The local version every trial reports unless the caller states another. */
export const LOCAL_VERSION = "1.0.0";
/** A target the local version is always behind, so the upgrade path is taken. */
export const TARGET_VERSION = "999.0.0";
export const HOMEBREW_EXECUTABLE = "/opt/homebrew/bin/axm";

/** One external command the capability asked the installer to run. */
export interface SubprocessInvocation {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly options: RunCommandOptions | undefined;
}

const exited = (stdout: string, exitCode = 0, stderr = ""): CommandResult => ({
  executionState: "exited",
  exitCode,
  stdout,
  stderr,
});

/** A completed external command, for a responder that states one directly. */
export const commandExited = exited;

const homebrewInfo = (version: string): string =>
  JSON.stringify({
    formulae: [{ full_name: "agentxm/tap/axm", versions: { stable: version } }],
  });

export interface SubprocessTestOptions {
  /** The version `brew info` reports for the tap formula. */
  readonly formulaVersion?: string | undefined;
  /** Answers a command directly; fall through to the default installer reply. */
  readonly respond?: ((invocation: SubprocessInvocation) => CommandResult | undefined) | undefined;
  /** Delay `brew update` by this many milliseconds of test clock. */
  readonly refreshDelayMs?: number | undefined;
  /** Runs inside the substituted external command, before it returns a reply. */
  readonly beforeReply?: ((invocation: SubprocessInvocation) => Effect.Effect<void>) | undefined;
  /** The path `resolveExecutable` reports for an installer-owned executable. */
  readonly executablePath?: string | undefined;
  /** Resolves an executable name on the PATH; `null` when it is not there. */
  readonly resolveExecutable?: ((executable: string) => string | null) | undefined;
  /**
   * The bytes a successful replacement leaves behind. When stated, a
   * `--version` probe reads the executable it was handed and reports the
   * target only when those bytes are there.
   */
  readonly stagedBinary?: Uint8Array | undefined;
  /** The version every `--version` probe reports. */
  readonly reportedVersion?: string | undefined;
}

/**
 * A recording subprocess that stands in for the installer. Every invocation
 * is retained in `calls`, in order, including repeats of the same command.
 */
export const makeSubprocessTest = (options?: SubprocessTestOptions) => {
  const calls: Array<SubprocessInvocation> = [];
  const reportedVersion = options?.reportedVersion ?? TARGET_VERSION;
  const staged = options?.stagedBinary;
  const versionReply = (executable: string): string => {
    if (staged === undefined) return reportedVersion;
    // A script installation reports the version the bytes on disk prove, so
    // a replacement that did not land is observed rather than assumed.
    if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) return reportedVersion;
    return Buffer.from(staged).equals(fs.readFileSync(executable))
      ? reportedVersion
      : LOCAL_VERSION;
  };
  const respond = (invocation: SubprocessInvocation): CommandResult => {
    const response = options?.respond?.(invocation);
    if (response !== undefined) return response;
    if (invocation.args[0] === "--version") {
      return exited(`${versionReply(invocation.executable)}\n`);
    }
    if (invocation.executable === "yarn" && invocation.args.includes("versions")) {
      return exited(JSON.stringify({ type: "inspect", data: [reportedVersion] }));
    }
    if (invocation.args.includes("--json")) return exited(JSON.stringify(reportedVersion));
    if (invocation.executable !== "brew") return exited("");
    switch (invocation.args[0]) {
      case "tap":
        return exited("agentxm/tap\n");
      case "info":
        return exited(homebrewInfo(options?.formulaVersion ?? TARGET_VERSION));
      case "--prefix":
        return exited("/opt/homebrew\n");
      default:
        return exited("");
    }
  };
  return {
    calls,
    layer: Layer.succeed(Subprocess, {
      run: (executable: string, args: ReadonlyArray<string>, commandOptions?: RunCommandOptions) =>
        Effect.gen(function* () {
          const invocation = { executable, args: [...args], options: commandOptions };
          calls.push(invocation);
          if (options?.beforeReply !== undefined) yield* options.beforeReply(invocation);
          if (
            executable === "brew" &&
            args[0] === "update" &&
            options?.refreshDelayMs !== undefined
          ) {
            yield* Effect.sleep(options.refreshDelayMs);
          }
          return respond(invocation);
        }),
      resolveExecutable: (executable: string) =>
        Effect.succeed(
          options?.resolveExecutable?.(executable) ??
            options?.executablePath ??
            HOMEBREW_EXECUTABLE,
        ),
    } satisfies typeof Subprocess.Service),
  };
};

/** The bytes every fixture release serves as the selected platform binary. */
export const upgradeBinary = new TextEncoder().encode("AXM selected executable fixture\n");

/**
 * A release origin that serves the promoted channel document, the selected
 * binary, and a checksum manifest that actually matches those bytes, so the
 * script installer's integrity gate is exercised rather than bypassed.
 */
export const makeReleaseOrigin = (options?: {
  readonly channelVersion?: string | undefined;
  readonly binary?: Uint8Array | undefined;
  readonly checksumManifest?: string | undefined;
}) => {
  const requests: Array<string> = [];
  const binary = options?.binary ?? upgradeBinary;
  const binaryHash = createHash("sha256").update(binary).digest("hex");
  const channel = stableChannelDocument(options?.channelVersion ?? TARGET_VERSION);
  const checksums =
    options?.checksumManifest ??
    `${channel.artifacts.binaries.map((entry) => `${binaryHash}  ${entry.name}`).join("\n")}\n`;
  const document = {
    ...channel,
    artifacts: {
      checksumManifest: {
        ...channel.artifacts.checksumManifest,
        sha256: createHash("sha256").update(checksums).digest("hex"),
      },
      binaries: channel.artifacts.binaries.map((entry) => ({ ...entry, sha256: binaryHash })),
    },
  };
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url);
      if (request.url.endsWith("/SHA256SUMS")) {
        return HttpClientResponse.fromWeb(request, new Response(checksums, { status: 200 }));
      }
      if (request.url.includes("/releases/download/")) {
        return HttpClientResponse.fromWeb(request, new Response(binary, { status: 200 }));
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(document), { status: 200 }),
      );
    }),
  );
  return { requests, checksums, binary, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

/** What one upgrade trial published and did. */
export interface UpgradeTrial {
  /** The published lifecycle events, in the order the upgrade published them. */
  readonly events: ReadonlyArray<OperationEvent>;
  /** Every external command the installer was asked to run. */
  readonly calls: ReadonlyArray<SubprocessInvocation>;
  /** Every install-metadata record the upgrade persisted. */
  readonly installMetaWrites: ReadonlyArray<InstallMetaData>;
  /** Every channel-cache write the upgrade performed. */
  readonly updateCheckWrites: ReadonlyArray<{ readonly version: string }>;
  /** Every release-origin request the upgrade made. */
  readonly releaseRequests: ReadonlyArray<string>;
  readonly assessment: UpgradeAssessmentResult;
}

/** What a specification observed while an external command was held. */
export interface ExternalCommandObservation {
  readonly invocation: SubprocessInvocation;
  /** Lifecycle events already published when the external command began. */
  readonly events: ReadonlyArray<OperationEvent>;
}

export interface UpgradeTrialOptions extends SubprocessTestOptions {
  readonly method?: InstallMethodType | undefined;
  readonly requestedVersion?: string | undefined;
  readonly localVersion?: string | null | undefined;
  readonly reinstall?: boolean | undefined;
  /** Assess the upgrade without performing it. */
  readonly preview?: boolean | undefined;
  readonly channelVersion?: string | undefined;
  readonly binary?: Uint8Array | undefined;
  readonly checksumManifest?: string | undefined;
  /** The install metadata already on the machine. */
  readonly installedMeta?: InstallMetaData | undefined;
  /** May hold a substituted external command while a specification inspects the events. */
  readonly duringExternalCommand?:
    ((observation: ExternalCommandObservation) => Effect.Effect<void>) | undefined;
  /** Test-clock advance in milliseconds while the upgrade runs. */
  readonly advanceMs?: number | undefined;
  /** A release origin of the caller's own, instead of the fixture one. */
  readonly httpClient?: HttpClient.HttpClient | undefined;
  /** The directory recorded commands run in. */
  readonly workingDirectory?: string | undefined;
}

/** A prepared trial: the recorders, and the upgrade run under them. */
export interface UpgradeTrialFixture {
  /** The published lifecycle events, in the order the upgrade published them. */
  readonly events: ReadonlyArray<OperationEvent>;
  /** Every external command the installer was asked to run. */
  readonly calls: ReadonlyArray<SubprocessInvocation>;
  /** Every install-metadata record the upgrade persisted. */
  readonly installMetaWrites: ReadonlyArray<InstallMetaData>;
  /** Every channel-cache write the upgrade performed. */
  readonly updateCheckWrites: ReadonlyArray<{ readonly version: string }>;
  /** Every release-origin request the upgrade made. */
  readonly releaseRequests: ReadonlyArray<string>;
  /** The checksum manifest the fixture release origin serves. */
  readonly checksums: string;
  /** Run the upgrade and settle it; the recorders above are filled in place. */
  readonly run: () => Effect.Effect<
    UpgradeAssessmentResult,
    UpgradeFailed,
    FileSystem.FileSystem | Path.Path
  >;
}

/**
 * Prepare one upgrade against a stand-in installation and release origin
 * under a real operation lifecycle. The recorders are readable whether the
 * upgrade settles or fails, so a refusal can be observed to have touched
 * nothing.
 */
export const makeUpgradeTrial = (
  options?: UpgradeTrialOptions,
): Effect.Effect<UpgradeTrialFixture, never, Scope.Scope> =>
  Effect.gen(function* () {
    const events: Array<OperationEvent> = [];
    const lifecycle = yield* makeOperationLifecycle({
      name: options?.preview === true ? "Preview AXM upgrade" : "Upgrade AXM",
      mode: options?.preview === true ? "preview" : "apply",
    });
    yield* subscribeLossless(lifecycle, (event) =>
      Effect.sync(() => {
        events.push(event);
      }),
    );

    const during = options?.duringExternalCommand;
    const method =
      options?.method ??
      new Homebrew({
        execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm`,
        detectionSource: "resolved-executable-path",
        evidence: [`resolved-executable:${HOMEBREW_EXECUTABLE}`],
        confidence: "high",
      });
    const subprocess = makeSubprocessTest({
      ...options,
      ...(options?.resolveExecutable === undefined && options?.executablePath === undefined
        ? {
            resolveExecutable: (executable: string) =>
              method._tag === "Script"
                ? method.execPath
                : method._tag === "Homebrew"
                  ? HOMEBREW_EXECUTABLE
                  : (method.managerOwnedExecutable ?? `/controlled/${executable}`),
          }
        : {}),
      ...(options?.stagedBinary === undefined && method._tag === "Script"
        ? { stagedBinary: options?.binary ?? upgradeBinary }
        : {}),
      ...(during === undefined
        ? {}
        : {
            beforeReply: (invocation: SubprocessInvocation) =>
              Effect.gen(function* () {
                // Events are published before the command runs, but the
                // subscriber fiber records them. Let those already-published
                // events drain so the observation reports what a reader could
                // see; the external command stays held, so no further work
                // advances while this settles.
                let seen = -1;
                while (seen !== events.length) {
                  seen = events.length;
                  yield* Effect.yieldNow;
                }
                yield* during({ invocation, events: [...events] });
              }),
          }),
    });

    const installMetaWrites: Array<InstallMetaData> = [];
    const updateCheckWrites: Array<{ readonly version: string }> = [];
    const fixtureOrigin = makeReleaseOrigin(options);
    const ownRequests: Array<string> = [];
    const httpClient = options?.httpClient;
    const releaseOrigin =
      httpClient === undefined
        ? fixtureOrigin
        : {
            requests: ownRequests,
            checksums: fixtureOrigin.checksums,
            layer: Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) => {
                ownRequests.push(request.url);
                return httpClient.execute(request);
              }),
            ),
          };
    const installedMeta = options?.installedMeta;

    const layer = Layer.provideMerge(
      UpgradePreparationLive,
      Layer.mergeAll(
        subprocess.layer,
        releaseOrigin.layer,
        Layer.succeed(UpgradeWorkingDirectory, {
          path: options?.workingDirectory ?? process.cwd(),
        }),
        Layer.succeed(InstallMethod, { detect: () => Effect.succeed(method) }),
        Layer.succeed(InstallMeta, {
          read: () =>
            Effect.succeed(
              installedMeta === undefined ? Option.none() : Option.some(installedMeta),
            ),
          write: (metadata: InstallMetaData) =>
            Effect.sync(() => {
              installMetaWrites.push(metadata);
            }),
        }),
        Layer.succeed(UpdateCheck, {
          readCacheState: () => Effect.succeed({ state: "missing" as const }),
          readCache: () => Effect.succeed(Option.none()),
          writeCache: (channel) =>
            Effect.sync(() => {
              updateCheckWrites.push({ version: channel.version });
            }),
          isUpdateAvailable: () => Effect.succeed(Option.none()),
          shouldSkip: () => false,
          notificationMessage: () => "",
        } satisfies typeof UpdateCheck.Service),
      ),
    );

    const request: UpgradeRequest = {
      reinstall: options?.reinstall === true,
      localVersion: options?.localVersion === undefined ? LOCAL_VERSION : options.localVersion,
      ...(options?.requestedVersion === undefined
        ? {}
        : { requestedVersion: options.requestedVersion }),
    };

    const run = () =>
      Effect.gen(function* () {
        const fiber = yield* prepareUpgrade(request).pipe(
          Effect.flatMap((candidate) =>
            previewOrApply(candidate, {
              mode: options?.preview === true ? "preview" : "apply",
            }),
          ),
          Effect.provide(layer),
          Effect.provideService(OperationLifecycle, lifecycle),
          Effect.forkChild,
        );
        if (options?.advanceMs !== undefined) yield* TestClock.adjust(options.advanceMs);
        return yield* Fiber.join(fiber);
      }).pipe(
        Effect.ensuring(lifecycle.settle("applied").pipe(Effect.andThen(lifecycle.drained.await))),
      );

    return {
      events,
      calls: subprocess.calls,
      installMetaWrites,
      updateCheckWrites,
      releaseRequests: releaseOrigin.requests,
      checksums: releaseOrigin.checksums,
      run,
    } satisfies UpgradeTrialFixture;
  });

/**
 * Run one upgrade against a stand-in installation and release origin under a
 * real operation lifecycle, and return what it published while it ran.
 */
export const runUpgradeTrial = (options?: UpgradeTrialOptions) =>
  Effect.gen(function* () {
    const trial = yield* makeUpgradeTrial(options);
    const assessment = yield* trial.run();
    return {
      events: trial.events,
      calls: trial.calls,
      installMetaWrites: trial.installMetaWrites,
      updateCheckWrites: trial.updateCheckWrites,
      releaseRequests: trial.releaseRequests,
      assessment,
    } satisfies UpgradeTrial;
  }).pipe(Effect.scoped);

/**
 * Every file, directory, and symbolic link under a directory, by content.
 * Two snapshots compare equal only when nothing on disk changed.
 */
export const snapshotDirectory = (root: string): Readonly<Record<string, string>> => {
  const snapshot: Record<string, string> = {};
  if (!fs.existsSync(root)) return snapshot;
  const visit = (directory: string): void => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = nodePath.join(directory, entry.name);
      const relative = nodePath.relative(root, absolute);
      if (entry.isSymbolicLink()) {
        snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
      } else if (entry.isDirectory()) {
        snapshot[relative] = "directory";
        visit(absolute);
      } else {
        snapshot[relative] = `file:${fs.readFileSync(absolute).toString("base64")}`;
      }
    }
  };
  visit(root);
  return snapshot;
};

/** Units the operation started, in order. */
export const startedUnits = (events: ReadonlyArray<OperationEvent>) =>
  events.filter((event) => event._tag === "UnitStarted");

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
