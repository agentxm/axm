import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { InstallMeta } from "@agentxm/client-core/unstable/install-meta";
import {
  InstallMethod,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import {
  resolveLatestVersion,
  DEFAULT_GITHUB_REPO,
} from "@agentxm/client-core/unstable/version-resolution";
import { loadVersion } from "../../version.js";
import { Subprocess, type CommandResult } from "./subprocess.js";

export interface UpgradeHandlerArgs {
  readonly force: boolean;
}

const UpgradeResultSchema = Schema.Struct({
  status: Schema.Literals(["already-up-to-date", "reinstalled", "upgraded", "delegated"] as const),
  installMethod: Schema.Literals(["script", "homebrew", "npm", "unknown"] as const),
  localVersion: Schema.String,
  targetVersion: Schema.optional(Schema.String),
  delegatedCommand: Schema.optional(Schema.String),
  force: Schema.Boolean,
});
type UpgradeResult = typeof UpgradeResultSchema.Type;

const UpgradeDocumentFields = {
  result: UpgradeResultSchema,
} satisfies Schema.Struct.Fields;

const BREW_UPGRADE_COMMAND = "brew upgrade agentxm/tap/axm";
const NPM_PACKAGE = "axm.sh";
const HOMEBREW_ENV = { HOMEBREW_NO_AUTO_UPDATE: "1" } as const;

interface PlatformBinaryInfo {
  readonly binaryName: string;
  readonly platform: string;
  readonly arch: string;
}

const SUPPORTED_TARGETS: ReadonlyArray<PlatformBinaryInfo> = [
  { platform: "darwin", arch: "arm64", binaryName: "axm-darwin-arm64" },
  { platform: "darwin", arch: "x64", binaryName: "axm-darwin-x64" },
  { platform: "linux", arch: "arm64", binaryName: "axm-linux-arm64" },
  { platform: "linux", arch: "x64", binaryName: "axm-linux-x64" },
  { platform: "win32", arch: "x64", binaryName: "axm-windows-x64.exe" },
];

export const resolvePlatformBinary = (platform: string, arch: string) => {
  const target = SUPPORTED_TARGETS.find((t) => t.platform === platform && t.arch === arch);
  if (target === undefined) {
    return Option.none<PlatformBinaryInfo>();
  }
  return Option.some(target);
};

export const makeDownloadUrl = (repo: string, version: string, binaryName: string) =>
  `https://github.com/${repo}/releases/download/cli-v${version}/${binaryName}`;

const resolveGithubRepo = () =>
  // eslint-disable-next-line no-restricted-properties -- Centralized env var access for GitHub repo override
  Effect.sync(() => process.env["AXM_INSTALL_GITHUB_REPO"] ?? DEFAULT_GITHUB_REPO);

const fetchBinaryResponse = (httpClient: HttpClient.HttpClient, url: string) =>
  httpClient
    .get(url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "axm-cli",
      },
    })
    .pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "network",
          message: "Update download did not complete",
          breadcrumbs: [{ description: "Check your network connection and try again." }],
          cause,
        }),
      ),
      Effect.timeoutOrElse({
        duration: "60 seconds",
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "network",
              message: "Download timed out",
              breadcrumbs: [{ description: "Check your network connection and try again." }],
            }),
          ),
      }),
    );

const downloadBinary = (httpClient: HttpClient.HttpClient, url: string, destPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const response = yield* fetchBinaryResponse(httpClient, url);

    if (response.status !== 200) {
      return yield* makeAppError({
        code: "network",
        message: `Download failed with status ${String(response.status)}`,
        breadcrumbs: [{ description: "Check your network connection and try again." }],
      });
    }

    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "network",
          message: "Failed to read downloaded data",
          breadcrumbs: [{ description: "Check your network connection and try again." }],
          cause,
        }),
      ),
    );
    const bytes = new Uint8Array(body);

    if (bytes.length === 0) {
      return yield* makeAppError({
        code: "validation",
        message: "Downloaded file is empty",
        breadcrumbs: [
          {
            description: "Try again. If the problem persists, download manually.",
          },
        ],
      });
    }

    yield* fs.writeFile(destPath, bytes).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          message: `Permission denied writing to ${destPath}`,
          breadcrumbs: [
            {
              description:
                "Re-run the install script to fix permissions, or run with appropriate privileges.",
            },
          ],
          cause,
        }),
      ),
    );
  });

const makeExecutable = (filePath: string, platform: string) =>
  Effect.gen(function* () {
    if (platform === "win32") return;
    const fs = yield* FileSystem.FileSystem;
    yield* fs.chmod(filePath, 0o755).pipe(Effect.catch(() => Effect.void));
  });

const atomicReplace = (sourcePath: string, targetPath: string, platform: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    if (platform === "win32") {
      // Windows: rename-aside then rename-new
      const oldPath = `${targetPath}.old`;
      yield* fs.rename(targetPath, oldPath).pipe(Effect.catch(() => Effect.void));
      yield* fs.rename(sourcePath, targetPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            message: `Permission denied replacing ${targetPath}`,
            breadcrumbs: [
              {
                description:
                  "Re-run the install script to fix permissions, or run with appropriate privileges.",
              },
            ],
            cause,
          }),
        ),
      );
    } else {
      // Unix: rename over
      yield* fs.rename(sourcePath, targetPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            message: `Permission denied replacing ${targetPath}`,
            breadcrumbs: [
              {
                description:
                  "Re-run the install script to fix permissions, or run with appropriate privileges.",
              },
            ],
            cause,
          }),
        ),
      );
    }
  });

const verifyBinary = (binaryPath: string) =>
  Effect.gen(function* () {
    const subprocess = yield* Subprocess;
    const result = yield* subprocess.run(binaryPath, ["--version"], { timeoutMs: 10_000 });

    if (result.exitCode !== 0) {
      return yield* makeAppError({
        code: "validation",
        message: "Downloaded binary could not be verified",
        breadcrumbs: [
          {
            description: "The upgrade may have succeeded. Try running `axm --version` to check.",
            cmd: "axm --version",
          },
        ],
      });
    }

    return result.stdout.trim();
  });

const resolveTargetVersion = (localVersion: string) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const repo = yield* resolveGithubRepo();
    const resolution = yield* resolveLatestVersion(httpClient, localVersion, repo);
    return resolution.remoteVersion;
  });

const commandOutput = (result: CommandResult): string =>
  [result.stdout.trim(), result.stderr.trim()].filter((part) => part.length > 0).join("\n");

const commandFailedError = (args: {
  readonly manager: string;
  readonly command: string;
  readonly result: CommandResult;
}) => {
  const output = commandOutput(args.result);
  const permissionHint = /EACCES|permission denied/i.test(output)
    ? " This looks like a permissions issue."
    : "";

  return makeAppError({
    code: "internal",
    message: `${args.manager} upgrade failed.${permissionHint}`,
    breadcrumbs: [
      {
        description:
          output.length > 0
            ? `Command output:\n${output}`
            : `Command exited with code ${String(args.result.exitCode)}.`,
      },
      {
        description: "Manual fallback:",
        cmd: args.command,
      },
    ],
  });
};

const failOnCommandError = (args: {
  readonly manager: string;
  readonly command: string;
  readonly result: CommandResult;
}) =>
  args.result.exitCode === 0 ? Effect.succeed(args.result) : Effect.fail(commandFailedError(args));

const verifyUpgradedVersion = (targetVersion: string) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const version = yield* verifyBinary(process.execPath).pipe(
      Effect.catch(() =>
        renderer.warn("Could not verify upgraded binary. Try running `axm --version` to check."),
      ),
    );

    if (version === undefined || version === targetVersion) return;
    yield* renderer.warn(
      `Upgrade completed, but axm reports ${version} instead of ${targetVersion}.`,
    );
  });

const homebrewTapIsPresent = (result: CommandResult): boolean =>
  result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes("agentxm/tap");

const cleanupWindowsOld = (targetPath: string) =>
  Effect.gen(function* () {
    if (process.platform !== "win32") return;
    const fs = yield* FileSystem.FileSystem;
    const oldPath = `${targetPath}.old`;
    yield* fs.remove(oldPath).pipe(Effect.catch(() => Effect.void));
  });

const handleHomebrew = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const subprocess = yield* Subprocess;
    const localVersion = loadVersion();
    const targetVersion = yield* resolveTargetVersion(localVersion);
    const delegatedCommand = BREW_UPGRADE_COMMAND;

    if (force) {
      yield* renderer.info("--force has no effect for Homebrew installs.");
    }
    yield* renderer.info("Installed via Homebrew");

    const tapList = yield* subprocess.run("brew", ["tap"], { env: HOMEBREW_ENV });
    if (tapList.exitCode !== 0) {
      return yield* commandFailedError({
        manager: "Homebrew",
        command: delegatedCommand,
        result: tapList,
      });
    }

    if (!homebrewTapIsPresent(tapList)) {
      yield* renderer.withSpinner(
        "Tapping Homebrew formula...",
        () =>
          subprocess
            .run("brew", ["tap", "agentxm/tap"], { env: HOMEBREW_ENV })
            .pipe(
              Effect.flatMap((result) =>
                failOnCommandError({ manager: "Homebrew", command: delegatedCommand, result }),
              ),
            ),
        { successMessage: "Tapped agentxm/tap" },
      );
    }

    yield* renderer.withSpinner(
      "Upgrading via Homebrew...",
      () =>
        subprocess
          .run("brew", ["upgrade", "agentxm/tap/axm"], { env: HOMEBREW_ENV })
          .pipe(
            Effect.flatMap((result) =>
              failOnCommandError({ manager: "Homebrew", command: delegatedCommand, result }),
            ),
          ),
      { successMessage: `Upgraded to ${targetVersion}` },
    );

    yield* verifyUpgradedVersion(targetVersion);

    return {
      status: "upgraded",
      installMethod: "homebrew",
      localVersion,
      targetVersion,
      delegatedCommand,
      force,
    } satisfies UpgradeResult;
  });

const handleNpm = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const subprocess = yield* Subprocess;
    const localVersion = loadVersion();
    const targetVersion = yield* resolveTargetVersion(localVersion);
    const delegatedCommand = `npm install -g ${NPM_PACKAGE}@${targetVersion}`;

    if (force) {
      yield* renderer.info("--force has no effect for npm installs.");
    }
    yield* renderer.info("Installed via npm");

    yield* renderer.withSpinner(
      "Upgrading via npm...",
      () =>
        subprocess
          .run("npm", ["install", "-g", `${NPM_PACKAGE}@${targetVersion}`])
          .pipe(
            Effect.flatMap((result) =>
              failOnCommandError({ manager: "npm", command: delegatedCommand, result }),
            ),
          ),
      { successMessage: `Upgraded to ${targetVersion}` },
    );

    yield* verifyUpgradedVersion(targetVersion);

    return {
      status: "upgraded",
      installMethod: "npm",
      localVersion,
      targetVersion,
      delegatedCommand,
      force,
    } satisfies UpgradeResult;
  });

const handleUnknown = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const localVersion = loadVersion();
    if (force) {
      yield* renderer.info("--force has no effect for this install method.");
    }
    yield* renderer.info("Install method could not be determined.");
    yield* renderer.info("To install or update, run:");
    yield* renderer.info("  curl -fsSL https://get.agentxm.ai | sh");
    return {
      status: "delegated",
      installMethod: "unknown",
      localVersion,
      delegatedCommand: "curl -fsSL https://get.agentxm.ai | sh",
      force,
    } satisfies UpgradeResult;
  });

const handleScript = (method: { readonly execPath: string }, force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const httpClient = yield* HttpClient.HttpClient;
    const installMeta = yield* InstallMeta;
    const pathService = yield* Path.Path;

    const repo = yield* resolveGithubRepo();
    const localVersion = loadVersion();

    // Step 1: Resolve latest version
    const resolution = yield* resolveLatestVersion(httpClient, localVersion, repo);

    // Step 2: Check if up to date
    if (!resolution.isStale && !force) {
      yield* renderer.info(`Already up to date (${resolution.localVersion})`);
      return {
        status: "already-up-to-date",
        installMethod: "script",
        localVersion,
        targetVersion: resolution.remoteVersion,
        force,
      } satisfies UpgradeResult;
    }

    // Step 3: Resolve platform binary
    const platform = process.platform;
    const arch = process.arch;
    const binaryInfoOpt = resolvePlatformBinary(platform, arch);

    if (Option.isNone(binaryInfoOpt)) {
      return yield* makeAppError({
        code: "internal",
        message: `Unsupported platform: ${platform}-${arch}`,
        breadcrumbs: [{ description: "Build from source or use a supported platform." }],
      });
    }

    const binaryInfo = binaryInfoOpt.value;
    const targetVersion = resolution.remoteVersion;

    if (force && !resolution.isStale) {
      yield* renderer.info(`Reinstalling ${localVersion}`);
    } else {
      yield* renderer.info(`Upgrading: ${localVersion} → ${targetVersion}`);
    }

    // Step 4: Download
    const downloadUrl = makeDownloadUrl(repo, targetVersion, binaryInfo.binaryName);
    const targetDir = pathService.dirname(method.execPath);
    const tempPath = pathService.join(targetDir, `.axm-upgrade-${Date.now()}.tmp`);

    const fs = yield* FileSystem.FileSystem;

    yield* renderer.withSpinner(
      `Downloading ${binaryInfo.binaryName}...`,
      () =>
        downloadBinary(httpClient, downloadUrl, tempPath).pipe(
          Effect.onInterrupt(() => fs.remove(tempPath).pipe(Effect.catch(() => Effect.void))),
        ),
      { successMessage: `Downloaded ${binaryInfo.binaryName}` },
    );

    // Step 5: Make executable
    yield* makeExecutable(tempPath, platform);

    // Step 6: Atomic replace
    yield* atomicReplace(tempPath, method.execPath, platform);

    // Step 7: Verify
    yield* verifyBinary(method.execPath).pipe(
      Effect.catch(() =>
        renderer.warn("Could not verify new binary. Try running `axm --version` to check."),
      ),
      Effect.asVoid,
    );

    // Step 8: Update install metadata
    yield* installMeta.write({
      method: "script",
      installedAt: new Date().toISOString(),
    });

    // Step 9: Clean up .old file on Windows
    yield* cleanupWindowsOld(method.execPath);

    if (force && !resolution.isStale) {
      yield* renderer.success(`Reinstalled ${targetVersion}`);
      return {
        status: "reinstalled",
        installMethod: "script",
        localVersion,
        targetVersion,
        force,
      } satisfies UpgradeResult;
    } else {
      yield* renderer.success(`Upgraded to ${targetVersion}`);
      return {
        status: "upgraded",
        installMethod: "script",
        localVersion,
        targetVersion,
        force,
      } satisfies UpgradeResult;
    }
  });

export const handleUpgrade = Effect.fn("Upgrade.handle")(function* (args: UpgradeHandlerArgs) {
  const installMethod = yield* InstallMethod;
  const renderer = yield* CliRenderer;
  const method: InstallMethodType = yield* installMethod.detect();

  const result = yield* (() => {
    switch (method._tag) {
      case "Script":
        return handleScript(method, args.force);
      case "Homebrew":
        return handleHomebrew(args.force);
      case "Npm":
        return handleNpm(args.force);
      case "Unknown":
        return handleUnknown(args.force);
    }
  })();

  if (yield* renderer.result({ result }, Schema.Struct(UpgradeDocumentFields))) {
    return;
  }

  if (result.status === "delegated") {
    yield* renderer.success("Done");
  }
}, Effect.asVoid);
