/**
 * The `upgrade` command adapter over the self-update capability's test ports.
 *
 * The capability decides what an upgrade does; this harness runs the command
 * that renders that decision, through the real machine or human screen over
 * recording streams, and returns both the bytes AXM wrote and the decoded
 * assessment document.
 */

import {
  UpgradePreparationLive,
  PackageInstallationLive,
  ScriptInstallationLive,
} from "@agentxm/cli-update/live";
import { type InstallMethodType, Homebrew } from "@agentxm/cli-maintenance/self-update/domain";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";

import { InstallMeta, InstallMethod } from "@agentxm/cli-update";
import { UpdateCheckCache } from "@agentxm/cli-maintenance/self-update/application";
import type { InstallMetaData } from "@agentxm/cli-update";
import {
  HOMEBREW_EXECUTABLE,
  LOCAL_VERSION,
  TARGET_VERSION,
  makeReleaseOrigin,
  makeSubprocessTest,
  type SubprocessInvocation,
  type SubprocessTestOptions,
} from "@agentxm/cli-update/testing";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { ExecutionDirectory } from "../execution-directory.js";
import { UpgradeDocumentSchema, handleUpgrade } from "../root/upgrade/handler.js";
import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
  type RecordedWrite,
} from "./screen-harness.js";

export { HOMEBREW_EXECUTABLE, LOCAL_VERSION, TARGET_VERSION };
export type { SubprocessInvocation };

export interface UpgradeCommandOptions extends SubprocessTestOptions {
  readonly method?: InstallMethodType | undefined;
  readonly requestedVersion?: string | undefined;
  readonly localVersion?: string | undefined;
  readonly reinstall?: boolean | undefined;
  readonly preview?: boolean | undefined;
  readonly channelVersion?: string | undefined;
  /** Render through the human screen instead of the machine screen. */
  readonly human?: boolean | undefined;
  readonly quiet?: boolean | undefined;
  readonly verbose?: boolean | undefined;
  /** Test-clock advance in milliseconds while the command runs. */
  readonly advanceMs?: number | undefined;
}

export interface UpgradeCommandRun {
  /** Every write the command made, in order, across both channels. */
  readonly writes: ReadonlyArray<RecordedWrite>;
  readonly stdout: string;
  readonly humanOutput: string;
  /** The decoded assessment document, when the machine screen emitted one. */
  readonly document: unknown;
  readonly calls: ReadonlyArray<SubprocessInvocation>;
  readonly installMetaWrites: ReadonlyArray<InstallMetaData>;
}

/** Run `axm upgrade` against a stand-in installation and release origin. */
export const runUpgradeCommand = (options?: UpgradeCommandOptions) =>
  Effect.gen(function* () {
    const streams = makeRecordingStreams();
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
    });
    const releaseOrigin = makeReleaseOrigin(options);
    const installMetaWrites: Array<InstallMetaData> = [];

    const layer = Layer.provideMerge(
      Layer.mergeAll(UpgradePreparationLive, PackageInstallationLive, ScriptInstallationLive),
      Layer.mergeAll(
        NodeServices.layer,
        options?.human === true
          ? humanScreenLayer(streams)
          : machineScreenLayer(streams, { quiet: options?.quiet === true }),
        TestFlagsLayer({
          ...(options?.quiet === undefined ? {} : { quiet: options.quiet }),
          ...(options?.verbose === undefined ? {} : { verbose: options.verbose }),
        }),
        Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(process.cwd()) }),
        subprocess.layer,
        releaseOrigin.layer,
        Layer.succeed(InstallMethod, { detect: () => Effect.succeed(method) }),
        Layer.succeed(InstallMeta, {
          read: () => Effect.succeed(Option.none()),
          write: (metadata: InstallMetaData) =>
            Effect.sync(() => {
              installMetaWrites.push(metadata);
            }),
        }),
        Layer.succeed(UpdateCheckCache, {
          read: () => Effect.succeed(Option.none()),
          write: () => Effect.void,
        } satisfies typeof UpdateCheckCache.Service),
      ),
    );

    const fiber = yield* handleUpgrade({
      reinstall: options?.reinstall === true,
      ...(options?.preview === true ? { preview: true } : {}),
      ...(options?.requestedVersion === undefined
        ? {}
        : { requestedVersion: options.requestedVersion }),
      ...(options?.localVersion === undefined ? {} : { localVersion: options.localVersion }),
    }).pipe(Effect.provide(layer), Effect.forkChild);
    if (options?.advanceMs !== undefined) yield* TestClock.adjust(options.advanceMs);
    yield* Fiber.join(fiber);

    const stdout = streams.log
      .filter((entry) => entry.channel === "stdout")
      .map((entry) => entry.content)
      .join("");
    const parsedDocument: unknown =
      stdout.length === 0 || options?.human === true ? undefined : JSON.parse(stdout);
    return {
      writes: streams.log,
      stdout,
      humanOutput: streams.log.map((entry) => entry.content).join(""),
      document: parsedDocument,
      calls: subprocess.calls,
      installMetaWrites,
    } satisfies UpgradeCommandRun;
  });

/** Decode the assessment document a machine-mode run emitted. */
export const upgradeDocument = (run: UpgradeCommandRun) =>
  Schema.decodeUnknownEffect(UpgradeDocumentSchema)(run.document);
