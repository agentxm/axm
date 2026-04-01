/**
 * Upgrade handler — self-update flow for `axm upgrade`.
 *
 * Detects the install method and either performs a self-update (script installs)
 * or prints delegation instructions (homebrew, npm, unknown).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { InstallMeta } from "@axm.sh/core/unstable/install-meta";
import { InstallMethod, type InstallMethodType } from "@axm.sh/core/unstable/install-method";
import {
  resolveLatestVersion,
  DEFAULT_GITHUB_REPO,
} from "@axm.sh/core/unstable/version-resolution";

import { loadVersion } from "../../version.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface UpgradeHandlerArgs {
  readonly force: boolean;
}

// -----------------------------------------------------------------------------
// Platform binary mapping
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Download URL
// -----------------------------------------------------------------------------

export const makeDownloadUrl = (repo: string, version: string, binaryName: string) =>
  `https://github.com/${repo}/releases/download/cli-v${version}/${binaryName}`;

// -----------------------------------------------------------------------------
// Self-update helpers
// -----------------------------------------------------------------------------

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
          code: "UPGRADE_DOWNLOAD_FAILED",
          what: "Failed to download update",
          howToFix: "Check your network connection and try again.",
          cause,
        }),
      ),
      Effect.timeoutOrElse({
        duration: "60 seconds",
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "UPGRADE_DOWNLOAD_TIMEOUT",
              what: "Download timed out",
              howToFix: "Check your network connection and try again.",
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
        code: "UPGRADE_DOWNLOAD_FAILED",
        what: `Download failed with status ${String(response.status)}`,
        howToFix: "Check your network connection and try again.",
      });
    }

    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "UPGRADE_DOWNLOAD_FAILED",
          what: "Failed to read downloaded data",
          howToFix: "Check your network connection and try again.",
          cause,
        }),
      ),
    );
    const bytes = new Uint8Array(body);

    if (bytes.length === 0) {
      return yield* makeAppError({
        code: "UPGRADE_DOWNLOAD_EMPTY",
        what: "Downloaded file is empty",
        howToFix: "Try again. If the problem persists, download manually.",
      });
    }

    yield* fs.writeFile(destPath, bytes).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "UPGRADE_PERMISSION_DENIED",
          what: `Permission denied writing to ${destPath}`,
          howToFix:
            "Re-run the install script to fix permissions, or run with appropriate privileges.",
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
            code: "UPGRADE_PERMISSION_DENIED",
            what: `Permission denied replacing ${targetPath}`,
            howToFix:
              "Re-run the install script to fix permissions, or run with appropriate privileges.",
            cause,
          }),
        ),
      );
    } else {
      // Unix: rename over
      yield* fs.rename(sourcePath, targetPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "UPGRADE_PERMISSION_DENIED",
            what: `Permission denied replacing ${targetPath}`,
            howToFix:
              "Re-run the install script to fix permissions, or run with appropriate privileges.",
            cause,
          }),
        ),
      );
    }
  });

const verifyBinary = (binaryPath: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        import("node:child_process")
          .then(({ execFile }) => {
            execFile(binaryPath, ["--version"], { timeout: 10_000 }, (error, stdout) => {
              if (error) {
                reject(error);
              } else {
                resolve(stdout.trim());
              }
            });
          })
          .catch(reject);
      }),
    catch: () =>
      makeAppError({
        code: "UPGRADE_VERIFY_FAILED",
        what: "Failed to verify new binary",
        howToFix: "The upgrade may have succeeded. Try running `axm --version` to check.",
      }),
  });

const cleanupWindowsOld = (targetPath: string) =>
  Effect.gen(function* () {
    if (process.platform !== "win32") return;
    const fs = yield* FileSystem.FileSystem;
    const oldPath = `${targetPath}.old`;
    yield* fs.remove(oldPath).pipe(Effect.catch(() => Effect.void));
  });

// -----------------------------------------------------------------------------
// Delegation messages
// -----------------------------------------------------------------------------

const handleHomebrew = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (force) {
      yield* renderer.info("--force has no effect for Homebrew installs.");
    }
    yield* renderer.info("Installed via Homebrew");
    yield* renderer.info("Run: brew upgrade agentxm/tap/axm");
  });

const handleNpm = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (force) {
      yield* renderer.info("--force has no effect for npm installs.");
    }
    yield* renderer.info("Installed via npm");
    yield* renderer.info("Run: npm update -g @axm.sh/cli");
  });

const handleUnknown = (force: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (force) {
      yield* renderer.info("--force has no effect for this install method.");
    }
    yield* renderer.info("Install method could not be determined.");
    yield* renderer.info("To install or update, run:");
    yield* renderer.info("  curl -fsSL https://get.agentxm.ai | sh");
  });

// -----------------------------------------------------------------------------
// Self-update flow
// -----------------------------------------------------------------------------

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
      return;
    }

    // Step 3: Resolve platform binary
    const platform = process.platform;
    const arch = process.arch;
    const binaryInfoOpt = resolvePlatformBinary(platform, arch);

    if (Option.isNone(binaryInfoOpt)) {
      const supported = SUPPORTED_TARGETS.map((t) => `${t.platform}-${t.arch}`).join(", ");
      return yield* makeAppError({
        code: "UPGRADE_UNSUPPORTED_PLATFORM",
        what: `Unsupported platform: ${platform}-${arch}`,
        details: [`Supported targets: ${supported}`],
        howToFix: "Build from source or use a supported platform.",
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
    } else {
      yield* renderer.success(`Upgraded to ${targetVersion}`);
    }
  });

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export const handleUpgrade = Effect.fn("Upgrade.handle")(function* (args: UpgradeHandlerArgs) {
  const installMethod = yield* InstallMethod;
  const method: InstallMethodType = yield* installMethod.detect();

  switch (method._tag) {
    case "Script":
      return yield* handleScript(method, args.force);
    case "Homebrew":
      return yield* handleHomebrew(args.force);
    case "Npm":
      return yield* handleNpm(args.force);
    case "Unknown":
      return yield* handleUnknown(args.force);
  }
}, Effect.asVoid);
