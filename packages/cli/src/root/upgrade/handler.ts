import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { InstallMeta } from "@agentxm/client-core/unstable/install-meta";
import {
  InstallMethod,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import { ArtifactChangeSchema, type ArtifactChange } from "@agentxm/client-core/unstable/plan";
import {
  resolveLatestVersion,
  DEFAULT_GITHUB_REPO,
} from "@agentxm/client-core/unstable/version-resolution";
import { loadVersion } from "../../version.js";
import { Subprocess, type CommandResult } from "./subprocess.js";

export interface UpgradeHandlerArgs {
  readonly force: boolean;
}

const UpgradeCoreResultSchema = Schema.Struct({
  status: Schema.Literals([
    "already-up-to-date",
    "reinstalled",
    "upgraded",
    "upgrade-incomplete",
    "delegated",
  ] as const),
  installMethod: Schema.Literals(["script", "homebrew", "npm", "unknown"] as const),
  localVersion: Schema.String,
  targetVersion: Schema.optional(Schema.String),
  delegatedCommand: Schema.optional(Schema.String),
  force: Schema.Boolean,
  warnings: Schema.optional(Schema.Array(Schema.String)),
});
type UpgradeCoreResult = typeof UpgradeCoreResultSchema.Type;

const UpgradePlanStepArtifactSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
  scope: Schema.Literals(["project", "user"] as const),
  version: Schema.optional(Schema.String),
  change: ArtifactChangeSchema,
  previousVersion: Schema.optional(Schema.String),
});

const UpgradePlanStepSchema = Schema.Struct({
  label: Schema.String,
  status: Schema.Literals([
    "ready",
    "warning",
    "error",
    "applied",
    "unchanged",
    "failed",
    "blocked",
  ] as const),
  message: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
  artifact: Schema.optional(UpgradePlanStepArtifactSchema),
});

const UpgradeResultSchema = Schema.Struct({
  outcome: Schema.Literals(["previewed", "cancelled", "applied", "no-op"] as const),
  planName: Schema.String,
  planDescription: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  totalSteps: Schema.Number,
  readyCount: Schema.Number,
  warningCount: Schema.Number,
  errorCount: Schema.Number,
  appliedCount: Schema.Number,
  failedCount: Schema.Number,
  blockedCount: Schema.Number,
  steps: Schema.Array(UpgradePlanStepSchema),
  status: UpgradeCoreResultSchema.fields.status,
  installMethod: UpgradeCoreResultSchema.fields.installMethod,
  localVersion: UpgradeCoreResultSchema.fields.localVersion,
  targetVersion: UpgradeCoreResultSchema.fields.targetVersion,
  delegatedCommand: UpgradeCoreResultSchema.fields.delegatedCommand,
  force: UpgradeCoreResultSchema.fields.force,
  warnings: UpgradeCoreResultSchema.fields.warnings,
});
type UpgradeResult = typeof UpgradeResultSchema.Type;
type UpgradePlanStep = typeof UpgradePlanStepSchema.Type;

const UpgradeDocumentFields = {
  result: UpgradeResultSchema,
} satisfies Schema.Struct.Fields;

const upgradeSuggestions = (result: UpgradeCoreResult): ReadonlyArray<SuggestedAction> => {
  if (result.status === "delegated") {
    return [
      {
        description: "Run the delegated install command",
        cmd: result.delegatedCommand ?? "curl -fsSL https://axm.sh/install.sh | sh",
      },
      { description: "Verify installed version", cmd: "axm --version" },
    ];
  }

  if (result.status === "already-up-to-date") {
    return [
      { description: "Verify installed version", cmd: "axm --version" },
      { description: "Reinstall current version", cmd: "axm upgrade --force" },
    ];
  }

  if (result.status === "upgrade-incomplete") {
    return [
      { description: "Verify installed version", cmd: "axm --version" },
      { description: "Retry upgrade", cmd: "axm upgrade --force" },
    ];
  }

  return [{ description: "Verify installed version", cmd: "axm --version" }];
};

const HOMEBREW_TAP = "agentxm/tap";
const BREW_UPGRADE_COMMAND = "brew upgrade agentxm/tap/axm";
const BREW_REINSTALL_COMMAND = "brew reinstall agentxm/tap/axm";
const NPM_PACKAGE = "axm.sh";
const HOMEBREW_ENV = { HOMEBREW_NO_AUTO_UPDATE: "1" } as const;

/**
 * Command name verified after a delegated (Homebrew/npm) upgrade. The subprocess
 * spawner resolves it on `PATH`. Deliberately not `process.execPath`: a Homebrew
 * or npm upgrade replaces — and removes — the running binary's file (for
 * Homebrew, the whole old `/Cellar/` directory), so spawning `process.execPath`
 * afterward fails even when the upgrade succeeded. Resolving `axm` on `PATH`
 * also verifies exactly what the user gets on their next run.
 */
const AXM_COMMAND = "axm";

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
          detail: "Update download did not complete",
          suggestions: [{ description: "Check your network connection and try again." }],
          cause,
        }),
      ),
      Effect.timeoutOrElse({
        duration: "60 seconds",
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "network",
              detail: "Download timed out",
              suggestions: [{ description: "Check your network connection and try again." }],
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
        detail: `Download failed with status ${String(response.status)}`,
        suggestions: [{ description: "Check your network connection and try again." }],
      });
    }

    const body = yield* response.arrayBuffer.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "network",
          detail: "Failed to read downloaded data",
          suggestions: [{ description: "Check your network connection and try again." }],
          cause,
        }),
      ),
    );
    const bytes = new Uint8Array(body);

    if (bytes.length === 0) {
      return yield* makeAppError({
        code: "validation",
        detail: "Downloaded file is empty",
        suggestions: [
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
          detail: `Permission denied writing to ${destPath}`,
          suggestions: [
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
            detail: `Permission denied replacing ${targetPath}`,
            suggestions: [
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
            detail: `Permission denied replacing ${targetPath}`,
            suggestions: [
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
        detail: "Downloaded binary could not be verified",
        suggestions: [
          {
            description: "Check the installed version.",
            cmd: "axm --version",
          },
        ],
      });
    }

    return result.stdout.trim();
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
    detail: `${args.manager} upgrade failed.${permissionHint}`,
    suggestions: [
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

type UpgradeCheck =
  | { readonly _tag: "Verified" }
  | { readonly _tag: "Unchanged"; readonly reported: string }
  | { readonly _tag: "Mismatch"; readonly reported: string }
  | { readonly _tag: "Unverifiable" };

/**
 * Run `axm --version` (resolved on `PATH`, see {@link AXM_COMMAND}) after a
 * delegated upgrade and classify what it reports against the version we expected
 * and the version we started from. Never renders — the caller decides what to
 * say.
 */
const checkUpgradedVersion = (
  targetVersion: string,
  localVersion: string,
): Effect.Effect<UpgradeCheck, never, Subprocess> =>
  verifyBinary(AXM_COMMAND).pipe(
    Effect.map((reported): UpgradeCheck => {
      if (reported === targetVersion) return { _tag: "Verified" };
      if (reported === localVersion) return { _tag: "Unchanged", reported };
      return { _tag: "Mismatch", reported };
    }),
    Effect.catch(() => Effect.succeed<UpgradeCheck>({ _tag: "Unverifiable" })),
  );

/**
 * Classify the outcome of a delegated upgrade. Human rendering is intentionally
 * deferred until after the structured result path has had first refusal.
 */
const finishUpgrade = (args: {
  readonly check: UpgradeCheck;
  readonly targetVersion: string;
  readonly staleHint?: string;
}): {
  readonly completion: "complete" | "incomplete";
  readonly warnings: ReadonlyArray<string>;
} => {
  switch (args.check._tag) {
    case "Verified":
      return { completion: "complete", warnings: [] };
    case "Unchanged": {
      const hint = args.staleHint === undefined ? "" : ` ${args.staleHint}`;
      return {
        completion: "incomplete",
        warnings: [
          `Upgrade completed, but axm still reports ${args.check.reported}, not ${args.targetVersion}.${hint}`,
        ],
      };
    }
    case "Mismatch":
      return {
        completion: "incomplete",
        warnings: [
          `Upgrade completed, but axm reports ${args.check.reported} instead of ${args.targetVersion}.`,
        ],
      };
    case "Unverifiable":
      return {
        completion: "complete",
        warnings: ["Could not verify the upgraded binary. Check the installed version."],
      };
  }
};

const withOptionalWarnings = <T extends UpgradeCoreResult>(
  result: T,
  warnings: ReadonlyArray<string>,
): UpgradeCoreResult => (warnings.length === 0 ? result : { ...result, warnings });

const upgradeMessage = (result: UpgradeCoreResult): string => {
  switch (result.status) {
    case "already-up-to-date":
      return `AXM is already up to date (${result.localVersion})`;
    case "reinstalled":
      return `Reinstalled AXM ${result.targetVersion ?? result.localVersion}`;
    case "upgraded":
      return `Upgraded AXM to ${result.targetVersion ?? result.localVersion}`;
    case "upgrade-incomplete":
      return "AXM upgrade ran but could not be fully verified";
    case "delegated":
      return "AXM upgrade requires a delegated install command";
  }
};

const upgradeArtifactPath = (result: UpgradeCoreResult): string => result.delegatedCommand ?? "axm";

const upgradeArtifactChange = (status: UpgradeCoreResult["status"]): ArtifactChange => {
  switch (status) {
    case "upgraded":
    case "reinstalled":
    case "upgrade-incomplete":
      return "updated";
    case "already-up-to-date":
    case "delegated":
      return "unchanged";
  }
};

const upgradeStepStatus = (status: UpgradeCoreResult["status"]): UpgradePlanStep["status"] => {
  switch (status) {
    case "upgraded":
    case "reinstalled":
    case "upgrade-incomplete":
      return "applied";
    case "already-up-to-date":
    case "delegated":
      return "unchanged";
  }
};

const withUpgradePlanFields = (result: UpgradeCoreResult): UpgradeResult => {
  const status = upgradeStepStatus(result.status);
  const warnings = result.warnings ?? [];
  const step: UpgradePlanStep = {
    label: "AXM CLI",
    status,
    message: upgradeMessage(result),
    ...(warnings.length > 0 ? { warnings } : {}),
    artifact: {
      path: upgradeArtifactPath(result),
      scope: "user",
      version: result.targetVersion ?? result.localVersion,
      previousVersion: result.localVersion,
      change: upgradeArtifactChange(result.status),
    },
  };
  const appliedCount = status === "applied" ? 1 : 0;

  return {
    outcome: appliedCount > 0 ? "applied" : "no-op",
    planName: "Upgrade AXM CLI",
    planDescription: "Update the AXM CLI binary",
    message: upgradeMessage(result),
    totalSteps: 1,
    readyCount: 0,
    warningCount: warnings.length,
    errorCount: 0,
    appliedCount,
    failedCount: 0,
    blockedCount: 0,
    steps: [step],
    ...result,
  };
};

/**
 * Refresh the local agentxm/tap clone before a Homebrew upgrade.
 *
 * `brew upgrade` evaluates the formula in the local tap clone. With
 * `HOMEBREW_NO_AUTO_UPDATE` set, that clone is never refreshed, so it can lag
 * the published formula and make `brew upgrade` a silent no-op.
 * `brew update-reset <path>` fetches and resets only that tap — no raw `git`,
 * no repo-wide `brew update`. Failure is non-fatal: the upgrade proceeds
 * against the cached formula.
 */
const refreshHomebrewTap: Effect.Effect<boolean, never, Subprocess> = Effect.gen(function* () {
  const subprocess = yield* Subprocess;

  const refresh = Effect.gen(function* () {
    const repoResult = yield* subprocess.run("brew", ["--repository", HOMEBREW_TAP], {
      env: HOMEBREW_ENV,
    });
    const tapPath = repoResult.stdout.trim();
    if (repoResult.exitCode !== 0 || tapPath.length === 0) {
      return yield* Effect.fail("refresh-failed" as const);
    }
    yield* subprocess
      .run("brew", ["update-reset", tapPath], { env: HOMEBREW_ENV })
      .pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0 ? Effect.void : Effect.fail("refresh-failed" as const),
        ),
      );
  });

  return yield* refresh.pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
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
    const httpClient = yield* HttpClient.HttpClient;
    const subprocess = yield* Subprocess;
    const localVersion = loadVersion();
    const repo = yield* resolveGithubRepo();
    const resolution = yield* resolveLatestVersion(httpClient, localVersion, repo);
    const targetVersion = resolution.remoteVersion;

    if (!resolution.isStale && !force) {
      return {
        status: "already-up-to-date",
        installMethod: "homebrew",
        localVersion,
        targetVersion,
        force,
      } satisfies UpgradeCoreResult;
    }

    const isReinstall = force && !resolution.isStale;
    const brewSubcommand = isReinstall ? "reinstall" : "upgrade";
    const delegatedCommand = isReinstall ? BREW_REINSTALL_COMMAND : BREW_UPGRADE_COMMAND;

    const tapList = yield* subprocess.run("brew", ["tap"], { env: HOMEBREW_ENV });
    if (tapList.exitCode !== 0) {
      return yield* commandFailedError({
        manager: "Homebrew",
        command: delegatedCommand,
        result: tapList,
      });
    }

    const tapRefreshed = homebrewTapIsPresent(tapList) ? yield* refreshHomebrewTap : undefined;

    if (!homebrewTapIsPresent(tapList)) {
      const tapResult = yield* subprocess.run("brew", ["tap", HOMEBREW_TAP], { env: HOMEBREW_ENV });
      yield* failOnCommandError({
        manager: "Homebrew",
        command: delegatedCommand,
        result: tapResult,
      });
    }

    const upgradeResult = yield* subprocess.run("brew", [brewSubcommand, "agentxm/tap/axm"], {
      env: HOMEBREW_ENV,
    });
    yield* failOnCommandError({
      manager: "Homebrew",
      command: delegatedCommand,
      result: upgradeResult,
    });

    const check = yield* checkUpgradedVersion(targetVersion, localVersion);
    const completion = finishUpgrade({
      check,
      targetVersion,
      staleHint: `The ${HOMEBREW_TAP} formula may not have published ${targetVersion} yet — try again shortly.`,
    });
    const warnings =
      tapRefreshed === false
        ? [
            ...completion.warnings,
            `Could not refresh the ${HOMEBREW_TAP} tap; the cached formula was used.`,
          ]
        : completion.warnings;

    return withOptionalWarnings(
      {
        status:
          completion.completion === "incomplete"
            ? "upgrade-incomplete"
            : isReinstall
              ? "reinstalled"
              : "upgraded",
        installMethod: "homebrew",
        localVersion,
        targetVersion,
        delegatedCommand,
        force,
      },
      warnings,
    );
  });

const handleNpm = (force: boolean) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const subprocess = yield* Subprocess;
    const localVersion = loadVersion();
    const repo = yield* resolveGithubRepo();
    const resolution = yield* resolveLatestVersion(httpClient, localVersion, repo);
    const targetVersion = resolution.remoteVersion;
    const delegatedCommand = `npm install -g ${NPM_PACKAGE}@${targetVersion}`;

    if (!resolution.isStale && !force) {
      return {
        status: "already-up-to-date",
        installMethod: "npm",
        localVersion,
        targetVersion,
        force,
      } satisfies UpgradeCoreResult;
    }

    const isReinstall = force && !resolution.isStale;

    const installResult = yield* subprocess.run("npm", [
      "install",
      "-g",
      `${NPM_PACKAGE}@${targetVersion}`,
    ]);
    yield* failOnCommandError({ manager: "npm", command: delegatedCommand, result: installResult });

    const check = yield* checkUpgradedVersion(targetVersion, localVersion);
    const completion = finishUpgrade({ check, targetVersion });

    return withOptionalWarnings(
      {
        status:
          completion.completion === "incomplete"
            ? "upgrade-incomplete"
            : isReinstall
              ? "reinstalled"
              : "upgraded",
        installMethod: "npm",
        localVersion,
        targetVersion,
        delegatedCommand,
        force,
      },
      completion.warnings,
    );
  });

const handleUnknown = (force: boolean) =>
  Effect.sync(() => {
    const localVersion = loadVersion();
    return {
      status: "delegated",
      installMethod: "unknown",
      localVersion,
      delegatedCommand: "curl -fsSL https://axm.sh/install.sh | sh",
      force,
    } satisfies UpgradeCoreResult;
  });

const handleScript = (method: { readonly execPath: string }, force: boolean) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const installMeta = yield* InstallMeta;
    const pathService = yield* Path.Path;

    const repo = yield* resolveGithubRepo();
    const localVersion = loadVersion();

    // Step 1: Resolve latest version
    const resolution = yield* resolveLatestVersion(httpClient, localVersion, repo);

    // Step 2: Check if up to date
    if (!resolution.isStale && !force) {
      return {
        status: "already-up-to-date",
        installMethod: "script",
        localVersion,
        targetVersion: resolution.remoteVersion,
        force,
      } satisfies UpgradeCoreResult;
    }

    // Step 3: Resolve platform binary
    const platform = process.platform;
    const arch = process.arch;
    const binaryInfoOpt = resolvePlatformBinary(platform, arch);

    if (Option.isNone(binaryInfoOpt)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Unsupported platform: ${platform}-${arch}`,
        suggestions: [{ description: "Build from source or use a supported platform." }],
      });
    }

    const binaryInfo = binaryInfoOpt.value;
    const targetVersion = resolution.remoteVersion;

    // Step 4: Download
    const downloadUrl = makeDownloadUrl(repo, targetVersion, binaryInfo.binaryName);
    const targetDir = pathService.dirname(method.execPath);
    const tempPath = pathService.join(targetDir, `.axm-upgrade-${Date.now()}.tmp`);

    const fs = yield* FileSystem.FileSystem;

    yield* downloadBinary(httpClient, downloadUrl, tempPath).pipe(
      Effect.onInterrupt(() => fs.remove(tempPath).pipe(Effect.catch(() => Effect.void))),
    );

    // Step 5: Make executable
    yield* makeExecutable(tempPath, platform);

    // Step 6: Atomic replace
    yield* atomicReplace(tempPath, method.execPath, platform);

    // Step 7: Verify
    const verificationWarnings = yield* verifyBinary(method.execPath).pipe(
      Effect.as<ReadonlyArray<string>>([]),
      Effect.catch(() =>
        Effect.succeed<ReadonlyArray<string>>([
          "Could not verify new binary. Check the installed version.",
        ]),
      ),
    );

    // Step 8: Update install metadata
    yield* installMeta.write({
      method: "script",
      installedAt: new Date().toISOString(),
    });

    // Step 9: Clean up .old file on Windows
    yield* cleanupWindowsOld(method.execPath);

    if (force && !resolution.isStale) {
      return withOptionalWarnings(
        {
          status: "reinstalled",
          installMethod: "script",
          localVersion,
          targetVersion,
          force,
        },
        verificationWarnings,
      );
    } else {
      return withOptionalWarnings(
        {
          status: "upgraded",
          installMethod: "script",
          localVersion,
          targetVersion,
          force,
        },
        verificationWarnings,
      );
    }
  });

const renderHumanUpgradeResult = (result: UpgradeCoreResult) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    switch (result.status) {
      case "already-up-to-date": {
        yield* renderer.success(`Already up to date (${result.localVersion})`);
        break;
      }
      case "reinstalled": {
        yield* renderer.success(`Reinstalled ${result.targetVersion ?? result.localVersion}`);
        break;
      }
      case "upgraded": {
        yield* renderer.success(`Upgraded to ${result.targetVersion ?? result.localVersion}`);
        break;
      }
      case "upgrade-incomplete": {
        yield* renderer.success("Upgrade incomplete");
        break;
      }
      case "delegated": {
        yield* renderer.success("Upgrade command delegated");
        if (result.force) {
          yield* renderer.info("--force has no effect for this install method.");
        }
        yield* renderer.info("Install method could not be determined.");
        break;
      }
    }

    yield* Effect.forEach(result.warnings ?? [], (warning) => renderer.warn(warning), {
      concurrency: 1,
    });
    yield* renderer.suggestions(upgradeSuggestions(result));
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

  const machineResult = withUpgradePlanFields(result);
  if (
    yield* renderer.result({ result: machineResult }, Schema.Struct(UpgradeDocumentFields), {
      suggestions: upgradeSuggestions(result),
    })
  ) {
    return;
  }

  yield* renderHumanUpgradeResult(result);
}, Effect.asVoid);
