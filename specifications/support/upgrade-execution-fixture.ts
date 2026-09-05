/** Production upgrade handler over real files and controlled release/installer ports. */
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  ExecutionDirectory,
  InstallMeta,
  InstallMethod,
  Subprocess,
  TestFlagsLayer,
  TestMachineRenderer,
  UpdateCheck,
  UpgradeDocumentSchema,
  handleUpgrade,
  type CommandResult,
  type InstallMetaData,
  type InstallMethodType,
  type RunCommandOptions,
} from "axm.sh/specification-harness";
import { LOCAL_VERSION, TARGET_VERSION } from "./upgrade-harness.js";
import { stableChannelDocument } from "./release-channel-fixture.js";

export const upgradeBinary = new TextEncoder().encode("AXM selected executable fixture\n");
const binaryHash = createHash("sha256").update(upgradeBinary).digest("hex");
export const completedUpgradeCommand = (
  stdout = `${TARGET_VERSION}\n`,
  exitCode = 0,
  stderr = "",
): CommandResult => ({ executionState: "exited", exitCode, stdout, stderr });
export interface UpgradeInvocation {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly options: RunCommandOptions | undefined;
}
export interface UpgradeExecutionOptions {
  readonly method: InstallMethodType;
  readonly targetVersion?: string;
  readonly checksumText?: string;
  readonly reply?: (
    invocation: UpgradeInvocation,
    index: number,
  ) => Effect.Effect<CommandResult> | undefined;
  readonly resolveExecutable?: (name: string) => string | null;
}

export const makeUpgradeExecution = (options: UpgradeExecutionOptions) => {
  const targetVersion = options.targetVersion ?? TARGET_VERSION;
  const calls: Array<UpgradeInvocation> = [];
  const requests: Array<string> = [];
  const metadata: Array<InstallMetaData> = [];
  const cacheWrites: Array<string> = [];
  const renderer = TestMachineRenderer.make();
  const channel = stableChannelDocument(targetVersion);
  const checksums =
    options.checksumText ??
    channel.artifacts.binaries.map((binary) => `${binaryHash}  ${binary.name}`).join("\n") + "\n";
  const release = {
    ...channel,
    artifacts: {
      checksumManifest: {
        ...channel.artifacts.checksumManifest,
        sha256: createHash("sha256").update(checksums).digest("hex"),
      },
      binaries: channel.artifacts.binaries.map((binary) => ({ ...binary, sha256: binaryHash })),
    },
  };
  const versionReply = (executable: string) => {
    if (
      options.method._tag === "Script" &&
      fs.existsSync(executable) &&
      fs.statSync(executable).isFile()
    ) {
      return Buffer.from(upgradeBinary).equals(fs.readFileSync(executable))
        ? targetVersion
        : LOCAL_VERSION;
    }
    return targetVersion;
  };
  const layer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    TestFlagsLayer(),
    Layer.succeed(ExecutionDirectory, { path: decodeAbsolutePathSync(process.cwd()) }),
    Layer.succeed(InstallMethod, { detect: () => Effect.succeed(options.method) }),
    Layer.succeed(InstallMeta, {
      read: () => Effect.succeed(Option.none()),
      write: (data) =>
        Effect.sync(() => {
          metadata.push(data);
        }),
    }),
    Layer.succeed(UpdateCheck, {
      readCacheState: () => Effect.succeed({ state: "missing" }),
      readCache: () => Effect.succeed(Option.none()),
      writeCache: (value) =>
        Effect.sync(() => {
          cacheWrites.push(value.version);
        }),
      isUpdateAvailable: () => Effect.succeed(Option.none()),
      shouldSkip: () => false,
      notificationMessage: () => "",
    }),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(
            request,
            request.url.endsWith("/SHA256SUMS")
              ? new Response(checksums)
              : request.url.includes("/releases/download/")
                ? new Response(upgradeBinary)
                : new Response(JSON.stringify(release)),
          );
        }),
      ),
    ),
    Layer.succeed(Subprocess, {
      run: (executable, args, commandOptions) =>
        Effect.suspend(() => {
          const invocation = { executable, args: [...args], options: commandOptions };
          calls.push(invocation);
          const response = options.reply?.(invocation, calls.length - 1);
          if (response !== undefined) return response;
          if (args[0] === "--version")
            return Effect.succeed(completedUpgradeCommand(`${versionReply(executable)}\n`));
          if (executable === "brew") {
            if (args[0] === "tap") return Effect.succeed(completedUpgradeCommand("agentxm/tap\n"));
            if (args[0] === "info")
              return Effect.succeed(
                completedUpgradeCommand(
                  JSON.stringify({
                    formulae: [
                      { full_name: "agentxm/tap/axm", versions: { stable: targetVersion } },
                    ],
                  }),
                ),
              );
            if (args[0] === "--prefix")
              return Effect.succeed(completedUpgradeCommand("/opt/homebrew\n"));
          }
          if (executable === "yarn" && args.includes("versions"))
            return Effect.succeed(
              completedUpgradeCommand(JSON.stringify({ type: "inspect", data: [targetVersion] })),
            );
          if (args.includes("--json"))
            return Effect.succeed(completedUpgradeCommand(JSON.stringify(targetVersion)));
          return Effect.succeed(completedUpgradeCommand(""));
        }),
      resolveExecutable: (name) =>
        Effect.succeed(
          options.resolveExecutable === undefined
            ? options.method._tag === "Script"
              ? options.method.execPath
              : (options.method.managerOwnedExecutable ?? `/controlled/${name}`)
            : options.resolveExecutable(name),
        ),
    }),
  );
  return {
    layer,
    calls,
    requests,
    metadata,
    cacheWrites,
    run: (args: Parameters<typeof handleUpgrade>[0] = { reinstall: false }) =>
      handleUpgrade(args).pipe(Effect.provide(layer)),
    document: () =>
      Schema.decodeUnknownSync(UpgradeDocumentSchema)(renderer.state.results.at(-1)?.data),
  };
};
