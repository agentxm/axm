import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as semver from "semver";

import { TestFlagsLayer } from "../../cli-flags/index.js";
import { logsByTag, TestMachineRenderer, TestRenderer } from "../../screen/index.js";
import {
  Homebrew,
  InstallMethod,
  Npm,
  Pnpm,
  Script,
  Unknown,
  Yarn,
  type InstallMethodType,
} from "../../install-method/install-method.js";
import { InstallMeta, type InstallMetaData } from "../../install-meta/install-meta.js";
import type { VersionRelation } from "../../version-resolution/version-resolution.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { STABLE_CHANNEL_SCHEMA } from "@agentxm/extension-model/unstable/release-channel";

import { ExecutionDirectory } from "../../execution-directory.js";
import { loadVersion } from "../../version.js";
import { UpdateCheck } from "../../update-check/update-check.js";
import {
  decideUpgrade,
  handleUpgrade,
  parseChecksum,
  resolvePlatformBinary,
  UpgradeResultSchema,
  UpgradeDocumentSchema,
  withUpgradePlanFields,
  type ResultStatus,
  type UpgradeCoreResult,
} from "./handler.js";
import { Subprocess, type CommandResult, type RunCommandOptions } from "./subprocess.js";

const LOCAL_VERSION = loadVersion();
const TARGET_VERSION = semver.inc(LOCAL_VERSION, "major") ?? "99.0.0";
const BINARY = new TextEncoder().encode("fixture-binary");
const BINARY_HASH = createHash("sha256").update(BINARY).digest("hex");
const platformBinary = Option.getOrThrow(resolvePlatformBinary(process.platform, process.arch));
const executionDirectoryPath = decodeAbsolutePathSync(process.cwd());
const executionDirectoryLayer = Layer.succeed(ExecutionDirectory, {
  path: executionDirectoryPath,
});
const updateCheckLayer = Layer.succeed(UpdateCheck, {
  readCacheState: () => Effect.succeed({ state: "missing" }),
  readCache: () => Effect.succeed(Option.none()),
  writeCache: () => Effect.void,
  isUpdateAvailable: () => Effect.succeed(Option.none()),
  shouldSkip: () => false,
  notificationMessage: () => "",
} satisfies typeof UpdateCheck.Service);

interface Invocation {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly options: RunCommandOptions | undefined;
}

const commandResult = (
  stdout = `${TARGET_VERSION}\n`,
  exitCode = 0,
  stderr = "",
): CommandResult => ({ executionState: "exited", exitCode, stdout, stderr });

const unavailableCommand = (
  executionState: "not-started" | "timed-out",
  stderr: string,
): CommandResult => ({ executionState, exitCode: null, stdout: "", stderr });

const homebrewInfo = (version: string) =>
  JSON.stringify({
    formulae: [{ full_name: "agentxm/tap/axm", versions: { stable: version } }],
  });

const makeSubprocess = (
  responder: (invocation: Invocation, index: number) => CommandResult | "never" = (invocation) =>
    invocation.executable === "yarn" && invocation.args.includes("versions")
      ? commandResult(JSON.stringify({ type: "inspect", data: [TARGET_VERSION] }))
      : invocation.args.includes("--json")
        ? commandResult(JSON.stringify(TARGET_VERSION))
        : commandResult(),
  resolveExecutable: (executable: string) => string | null = (executable) =>
    `/resolved/${executable}`,
) => {
  const calls: Array<Invocation> = [];
  return {
    calls,
    layer: Layer.succeed(Subprocess, {
      run: (executable, args, options) =>
        Effect.suspend(() => {
          const invocation = { executable, args: [...args], options };
          calls.push(invocation);
          const response = responder(invocation, calls.length - 1);
          if (response === "never") return Effect.never;
          return Effect.succeed(
            invocation.args.includes("--json") &&
              response.exitCode === 0 &&
              response.stdout.trim() === TARGET_VERSION
              ? { ...response, stdout: JSON.stringify(TARGET_VERSION) }
              : response,
          );
        }),
      resolveExecutable: (executable) => Effect.succeed(resolveExecutable(executable)),
    }),
  };
};

const release = (version: string) => ({
  schema: STABLE_CHANNEL_SCHEMA,
  channel: "stable",
  revision: 1,
  version,
  release: {
    repository: "agentxm/axm",
    tag: `cli-v${version}`,
    commit: "a".repeat(40),
    publishedAt: "2026-09-03T17:00:00Z",
  },
  artifacts: {
    checksumManifest: {
      name: "SHA256SUMS",
      url: `https://github.com/agentxm/axm/releases/download/cli-v${version}/SHA256SUMS`,
      sha256: BINARY_HASH,
    },
    binaries: ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"].map(
      (target) => {
        const name = target === "windows-x64" ? "axm-windows-x64.exe" : `axm-${target}`;
        return {
          target,
          name,
          url: `https://github.com/agentxm/axm/releases/download/cli-v${version}/${name}`,
          sha256: BINARY_HASH,
        };
      },
    ),
  },
  promotedAt: "2026-09-03T17:01:00Z",
});

const makeHttpClient = (
  version = TARGET_VERSION,
  override?: (url: string) => Response | undefined,
) =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      const overridden = override?.(request.url);
      if (overridden !== undefined) {
        return HttpClientResponse.fromWeb(request, overridden);
      }
      if (request.url.endsWith(`/${platformBinary.binaryName}`)) {
        return HttpClientResponse.fromWeb(request, new Response(BINARY, { status: 200 }));
      }
      if (request.url.endsWith("/SHA256SUMS")) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(`${BINARY_HASH}  ${platformBinary.binaryName}\n`, { status: 200 }),
        );
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(release(version)), { status: 200 }),
      );
    }),
  );

const makeHarness = (
  method: InstallMethodType,
  options?: {
    readonly version?: string;
    readonly subprocess?: ReturnType<typeof makeSubprocess>;
    readonly httpClient?: HttpClient.HttpClient;
  },
) => {
  const renderer = TestMachineRenderer.make();
  const subprocess = options?.subprocess ?? makeSubprocess();
  const metadata: Array<InstallMetaData> = [];
  const layer = Layer.mergeAll(
    NodeServices.layer,
    renderer.layer,
    TestFlagsLayer(),
    executionDirectoryLayer,
    updateCheckLayer,
    Layer.succeed(InstallMethod, { detect: () => Effect.succeed(method) }),
    Layer.succeed(InstallMeta, {
      read: () => Effect.succeed(Option.none()),
      write: (data: InstallMetaData) =>
        Effect.sync(() => {
          metadata.push(data);
        }),
    }),
    Layer.succeed(HttpClient.HttpClient, options?.httpClient ?? makeHttpClient(options?.version)),
    subprocess.layer,
  );
  return { layer, metadata, renderer: renderer.state, subprocess };
};

const resultFrom = (state: ReturnType<typeof TestMachineRenderer.make>["state"]) =>
  Schema.decodeUnknownSync(UpgradeDocumentSchema)(state.results[0]?.data).result;

const makeHumanHarness = (
  method: InstallMethodType,
  flags: { readonly quiet?: boolean; readonly verbose?: boolean } = {},
) => {
  const renderer = TestRenderer.make();
  const subprocess = makeSubprocess();
  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer(flags),
      executionDirectoryLayer,
      updateCheckLayer,
      Layer.succeed(InstallMethod, { detect: () => Effect.succeed(method) }),
      Layer.succeed(InstallMeta, {
        read: () => Effect.succeed(Option.none()),
        write: () => Effect.void,
      }),
      Layer.succeed(HttpClient.HttpClient, makeHttpClient()),
      subprocess.layer,
    ),
    logs: logsByTag(renderer.state),
  };
};

describe("decideUpgrade", () => {
  const rows: ReadonlyArray<
    readonly [VersionRelation, boolean, boolean, ReturnType<typeof decideUpgrade>]
  > = [
    ["upgrade-available", false, true, "mutate"],
    ["upgrade-available", true, true, "mutate"],
    ["upgrade-available", false, false, "manual"],
    ["upgrade-available", true, false, "manual"],
    ["current", false, true, "noop-current"],
    ["current", false, false, "noop-current"],
    ["current", true, true, "mutate"],
    ["current", true, false, "manual"],
    ["local-newer", false, true, "noop-newer"],
    ["local-newer", false, false, "noop-newer"],
    ["local-newer", true, true, "refuse"],
    ["local-newer", true, false, "refuse"],
    ["unknown-local", false, true, "mutate"],
    ["unknown-local", true, true, "mutate"],
    ["unknown-local", false, false, "manual"],
    ["unknown-local", true, false, "manual"],
  ];

  it.each(rows)(
    "%s reinstall=%s supported=%s => %s",
    (relation, reinstall, supported, expected) => {
      expect(decideUpgrade(relation, reinstall, supported)).toBe(expected);
    },
  );
});

describe("upgrade helpers", () => {
  it("resolves every supported platform binary and rejects unsupported targets", () => {
    expect(Option.getOrThrow(resolvePlatformBinary("darwin", "arm64")).binaryName).toBe(
      "axm-darwin-arm64",
    );
    expect(Option.getOrThrow(resolvePlatformBinary("linux", "x64")).binaryName).toBe(
      "axm-linux-x64",
    );
    expect(Option.getOrThrow(resolvePlatformBinary("win32", "x64")).binaryName).toBe(
      "axm-windows-x64.exe",
    );
    expect(Option.isNone(resolvePlatformBinary("freebsd", "x64"))).toBe(true);
  });

  it.effect("requires exactly one valid checksum entry for the selected binary", () =>
    Effect.gen(function* () {
      expect(yield* parseChecksum(`${BINARY_HASH}  axm-linux-x64\n`, "axm-linux-x64")).toBe(
        BINARY_HASH,
      );
      expect((yield* Effect.flip(parseChecksum("malformed\n", "axm-linux-x64"))).code).toBe(
        "validation",
      );
      expect(
        (yield* Effect.flip(
          parseChecksum(
            `${BINARY_HASH}  axm-linux-x64\n${BINARY_HASH}  axm-linux-x64\n`,
            "axm-linux-x64",
          ),
        )).code,
      ).toBe("validation");
    }),
  );
});

describe("upgrade JSON contract", () => {
  const mappings: ReadonlyArray<
    readonly [
      ResultStatus,
      UpgradeCoreResult["verification"],
      UpgradeCoreResult["mutationState"],
      string,
      number,
      number,
    ]
  > = [
    ["upgraded", "verified", "updated", "applied", 0, 0],
    ["reinstalled", "verified", "updated", "applied", 0, 0],
    ["already-up-to-date", "verified", "not-attempted", "no-op", 0, 0],
    ["local-newer", "verified", "not-attempted", "no-op", 0, 0],
    ["downgrade-refused", "not-attempted", "not-attempted", "no-op", 0, 1],
    ["manual-action-required", "not-attempted", "not-attempted", "no-op", 0, 1],
    ["upgrade-incomplete", "unchanged", "unchanged", "no-op", 1, 0],
    ["upgrade-unverified", "unavailable", "unknown", "indeterminate", 1, 0],
    ["rolled-back", "mismatch", "rolled-back", "no-op", 1, 0],
  ];

  it.each(mappings)(
    "schema-encodes the complete %s terminal result",
    (resultStatus, verification, mutationState, outcome, failedCount, blockedCount) => {
      const core: UpgradeCoreResult = {
        resultStatus,
        installMethod: "npm",
        detectionSource: "package-manager-query",
        detectionEvidence: ["npm owns /fixture/axm"],
        detectionConfidence: "high",
        versionRelation: "upgrade-available",
        localVersion: "1.0.0",
        targetVersion: "2.0.0",
        reportedVersion: mutationState === "unknown" ? null : "2.0.0",
        verification,
        mutationState,
        executablePath: "/fixture/axm",
        verificationExecutables: [
          {
            role: "path-resolved",
            path: "axm",
            reportedVersion: "2.0.0",
            exitCode: 0,
          },
        ],
        executedCommands: [
          {
            purpose: "delegation",
            executable: "npm",
            args: ["install", "-g", "axm.sh@2.0.0"],
            display: "npm install -g axm.sh@2.0.0",
            executionState: "exited",
            exitCode: 0,
            stdout: "",
            stderr: "",
            outputTruncated: false,
          },
        ],
        recommendedCommand: null,
        reinstall: false,
        details: [],
        backupPath: null,
      };
      const encoded = Schema.encodeSync(UpgradeResultSchema)(withUpgradePlanFields(core));

      expect(Object.keys(encoded).sort()).toEqual([
        "appliedCount",
        "axmSkillCompatibilityTarget",
        "backupPath",
        "blockedCount",
        "details",
        "detectionConfidence",
        "detectionEvidence",
        "detectionSource",
        "errorCount",
        "executablePath",
        "executedCommands",
        "failedCount",
        "installMethod",
        "localVersion",
        "message",
        "mutationState",
        "outcome",
        "planDescription",
        "planName",
        "readyCount",
        "recommendedCommand",
        "reinstall",
        "reportedVersion",
        "resultStatus",
        "steps",
        "targetVersion",
        "totalSteps",
        "verification",
        "verificationExecutables",
        "versionRelation",
        "warningCount",
      ]);
      expect(encoded).toMatchObject({
        resultStatus,
        verification,
        mutationState,
        outcome,
        failedCount,
        blockedCount,
        localVersion: "1.0.0",
        targetVersion: "2.0.0",
        axmSkillCompatibilityTarget: {
          cliVersion: "2.0.0",
          skillVersion: "2.0.0",
          verifyCommand: "axm lint",
          recoveryPreviewCommand: "axm skills install @agentxm/skills/axm --bundled --preview",
          recoveryApplyCommand: "axm skills install @agentxm/skills/axm --bundled",
        },
        executedCommands: [
          {
            purpose: "delegation",
            executable: "npm",
            args: ["install", "-g", "axm.sh@2.0.0"],
            executionState: "exited",
            exitCode: 0,
            outputTruncated: false,
          },
        ],
      });
    },
  );
});

describe("delegated upgrades", () => {
  const managerCases: ReadonlyArray<readonly [InstallMethodType, string, ReadonlyArray<string>]> = [
    [
      new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" }),
      "npm",
      ["install", "-g", `${"axm.sh"}@${TARGET_VERSION}`],
    ],
    [
      new Pnpm({ importUrl: "file:///pnpm/axm", managerOwnedExecutable: "/pnpm/bin/axm" }),
      "pnpm",
      ["add", "-g", `axm.sh@${TARGET_VERSION}`],
    ],
    [
      new Yarn({
        importUrl: "file:///yarn/axm",
        managerMajorVersion: 1,
        supported: true,
        managerOwnedExecutable: "/yarn/bin/axm",
      }),
      "yarn",
      ["global", "add", `axm.sh@${TARGET_VERSION}`],
    ],
  ];

  it.effect.each(managerCases)(
    "passes the execution directory to every %s manager command",
    ([method, executable, args]) => {
      const harness = makeHarness(method);
      return Effect.gen(function* () {
        yield* handleUpgrade({ reinstall: false });
        expect(harness.subprocess.calls).toContainEqual(
          expect.objectContaining({ executable, args }),
        );
        expect(
          harness.subprocess.calls.every((call) => call.options?.cwd === executionDirectoryPath),
        ).toBe(true);
      }).pipe(Effect.provide(harness.layer));
    },
  );

  it.effect("bypasses channel discovery for an exact stable version", () => {
    let requests = 0;
    const httpClient = HttpClient.make((request) => {
      requests += 1;
      return Effect.sync(() =>
        HttpClientResponse.fromWeb(request, new Response("unexpected", { status: 500 })),
      );
    });
    const harness = makeHarness(
      new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" }),
      { httpClient },
    );
    return Effect.gen(function* () {
      yield* handleUpgrade({ reinstall: false, requestedVersion: TARGET_VERSION });
      const result = resultFrom(harness.renderer);
      expect(requests).toBe(0);
      expect(result).toMatchObject({
        contract: "axm.upgrade-assessment/v1",
        disposition: "upgraded",
        intent: { mode: "exact", requestedVersion: TARGET_VERSION },
        canonical: { source: "exact-version", channelRevision: null },
      });
    }).pipe(Effect.provide(harness.layer));
  });

  it.effect("uses bounded read-only queries to resolve an ambiguous npm layout", () =>
    Effect.gen(function* () {
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "npm" && invocation.args.join(" ") === "root -g") {
          return commandResult(process.cwd());
        }
        if (
          (invocation.executable === "pnpm" && invocation.args.join(" ") === "root -g") ||
          (invocation.executable === "yarn" && invocation.args.join(" ") === "global dir")
        ) {
          return commandResult("", 1);
        }
        if (invocation.executable === "axm") return commandResult(TARGET_VERSION);
        return commandResult();
      });
      const harness = makeHarness(
        new Unknown({
          reason: "ambiguous",
          detectionSource: "module-url",
          evidence: ["module-url:file:///legacy/node_modules/axm.sh/dist/main.js"],
          confidence: "low",
        }),
        { subprocess },
      );

      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      const result = resultFrom(harness.renderer);
      expect(result).toMatchObject({
        disposition: "upgraded",
        ownership: { method: "npm", source: "package-manager-query" },
      });
      expect(result.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            purpose: "detection",
            executable: "npm",
            args: ["root", "-g"],
          }),
          expect.objectContaining({
            purpose: "delegation",
            executable: "npm",
            args: ["install", "-g", `axm.sh@${TARGET_VERSION}`],
          }),
        ]),
      );
    }),
  );

  it.effect("maps explicit same-version Homebrew reinstall to the reinstall command", () =>
    Effect.gen(function* () {
      const method = new Homebrew({ execPath: "/opt/homebrew/Cellar/axm/1/bin/axm" });
      const reinstallProcess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(LOCAL_VERSION));
        }
        if (invocation.executable === "brew" && invocation.args[0] === "--prefix") {
          return commandResult("/opt/homebrew\n");
        }
        if (invocation.args[0] === "--version") return commandResult(LOCAL_VERSION);
        return commandResult("");
      });
      const reinstall = makeHarness(method, {
        version: LOCAL_VERSION,
        subprocess: reinstallProcess,
      });
      yield* handleUpgrade({ reinstall: true }).pipe(Effect.provide(reinstall.layer));
      expect(reinstall.subprocess.calls).toContainEqual(
        expect.objectContaining({
          executable: "brew",
          args: ["reinstall", "agentxm/tap/axm"],
        }),
      );
    }),
  );

  it.effect("recovers one successful Homebrew no-op with one reinstall", () =>
    Effect.gen(function* () {
      let reinstallRan = false;
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(TARGET_VERSION));
        }
        if (invocation.executable === "brew" && invocation.args[0] === "--prefix") {
          return commandResult("/opt/homebrew\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "reinstall") {
          reinstallRan = true;
          return commandResult("");
        }
        if (invocation.args[0] === "--version") {
          return commandResult(reinstallRan ? TARGET_VERSION : LOCAL_VERSION);
        }
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );

      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      const result = resultFrom(harness.renderer);
      expect(result).toMatchObject({
        disposition: "upgraded",
        verification: { state: "verified" },
        mutation: { state: "updated" },
        recovery: { recommendedCommand: null },
      });
      expect(
        harness.subprocess.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(1);
      expect(harness.metadata).toEqual([
        expect.objectContaining({
          method: "homebrew",
          executablePath: "/opt/homebrew/bin/axm",
        }),
      ]);
      expect(result.verification.executables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "manager-owned", phase: "pre-mutation" }),
          expect.objectContaining({ role: "path-resolved", phase: "post-primary" }),
          expect.objectContaining({ role: "manager-owned", phase: "post-fallback" }),
        ]),
      );
    }),
  );

  it.effect("does not mutate when Homebrew's formula is ahead of the selected target", () =>
    Effect.gen(function* () {
      const ahead = semver.inc(TARGET_VERSION, "patch") ?? "999.0.0";
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(ahead));
        }
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );

      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "installer-leading",
        verification: { state: "not-attempted" },
        mutation: { state: "not-attempted" },
        details: { homebrewFailure: "formula-ahead-of-target", observedFormulaVersion: ahead },
        recovery: { recommendedCommand: null },
      });
      expect(
        harness.subprocess.calls.some(
          (invocation) =>
            invocation.executable === "brew" &&
            (invocation.args[0] === "upgrade" || invocation.args[0] === "reinstall"),
        ),
      ).toBe(false);
      const updateCalls = harness.subprocess.calls.filter(
        (invocation) => invocation.executable === "brew" && invocation.args[0] === "update",
      );
      const infoCalls = harness.subprocess.calls.filter(
        (invocation) => invocation.executable === "brew" && invocation.args[0] === "info",
      );
      expect(updateCalls).toHaveLength(1);
      expect(infoCalls).toHaveLength(1);
    }),
  );

  it.effect("stops after one observation even when a later query could match", () =>
    Effect.gen(function* () {
      let formulaQueries = 0;
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          formulaQueries += 1;
          return commandResult(homebrewInfo(formulaQueries === 1 ? LOCAL_VERSION : TARGET_VERSION));
        }
        if (invocation.executable === "brew" && invocation.args[0] === "--prefix") {
          return commandResult("/opt/homebrew\n");
        }
        if (invocation.args[0] === "--version") return commandResult(TARGET_VERSION);
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "installer-lagging",
        details: { observedFormulaVersion: LOCAL_VERSION },
      });
      expect(formulaQueries).toBe(1);
    }),
  );

  it.effect("stops without mutation when the selected formula is behind", () =>
    Effect.gen(function* () {
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(LOCAL_VERSION));
        }
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "installer-lagging",
        details: {
          homebrewFailure: "target-formula-unavailable",
          observedFormulaVersion: LOCAL_VERSION,
        },
        verification: { state: "not-attempted" },
        mutation: { state: "not-attempted" },
        recovery: { recommendedCommand: null },
      });
      expect(
        harness.subprocess.calls.some(
          (invocation) =>
            invocation.executable === "brew" &&
            (invocation.args[0] === "upgrade" || invocation.args[0] === "reinstall"),
        ),
      ).toBe(false);
      const updateCalls = harness.subprocess.calls.filter(
        (invocation) => invocation.executable === "brew" && invocation.args[0] === "update",
      );
      const infoCalls = harness.subprocess.calls.filter(
        (invocation) => invocation.executable === "brew" && invocation.args[0] === "info",
      );
      expect(updateCalls).toHaveLength(1);
      expect(infoCalls).toHaveLength(1);
    }),
  );

  it.effect("does not reinstall after a timed-out Homebrew upgrade", () =>
    Effect.gen(function* () {
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(TARGET_VERSION));
        }
        if (invocation.executable === "brew" && invocation.args[0] === "--prefix") {
          return commandResult("/opt/homebrew\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "upgrade") {
          return unavailableCommand("timed-out", "timed out");
        }
        if (invocation.args[0] === "--version") return commandResult(LOCAL_VERSION);
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );

      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "mutation-failed",
        details: { homebrewFailure: "delegation-failed" },
        verification: { state: "unchanged" },
        mutation: { state: "unchanged" },
        recovery: { recommendedCommand: null },
      });
      expect(
        harness.subprocess.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(0);
    }),
  );

  it.effect("reports a fresh PATH shadow without reinstalling or rewriting it", () =>
    Effect.gen(function* () {
      let primaryRan = false;
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "brew" && invocation.args[0] === "tap") {
          return commandResult("agentxm/tap\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "update") {
          return commandResult("");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "info") {
          return commandResult(homebrewInfo(TARGET_VERSION));
        }
        if (invocation.executable === "brew" && invocation.args[0] === "--prefix") {
          return commandResult("/opt/homebrew\n");
        }
        if (invocation.executable === "brew" && invocation.args[0] === "upgrade") {
          primaryRan = true;
          return commandResult("");
        }
        if (invocation.executable === "/opt/homebrew/bin/axm") {
          return commandResult(primaryRan ? TARGET_VERSION : LOCAL_VERSION);
        }
        if (invocation.executable === "/resolved/axm") return commandResult(LOCAL_VERSION);
        return commandResult("");
      });
      const harness = makeHarness(
        new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        { subprocess },
      );

      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "verification-failed",
        details: { homebrewFailure: "manager-path-disagreement" },
        verification: { state: "mismatch" },
        mutation: { state: "updated" },
        recovery: { recommendedCommand: null },
      });
      expect(
        harness.subprocess.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(0);
    }),
  );

  it.effect("names the resolved method, delegated command, and verified binary by default", () =>
    Effect.gen(function* () {
      const harness = makeHumanHarness(new Npm({ importUrl: "file:///npm/axm" }));
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));

      expect(harness.logs.info).toContain("Install method: npm");
      expect(harness.logs.info.some((line) => line.startsWith(`Ran: npm install -g axm.sh@`))).toBe(
        true,
      );
      expect(
        harness.logs.info.some(
          (line) => line.startsWith("Verified: ") && line.includes(TARGET_VERSION),
        ),
      ).toBe(true);
      // The audit trail stays behind --verbose.
      expect(harness.logs.info.some((line) => line.startsWith("Detection: "))).toBe(false);
      expect(harness.logs.info.some((line) => line.startsWith("delegation: "))).toBe(false);
    }),
  );

  it.effect("shows the failing command's output without requiring verbose", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === "npm" && invocation.args[0] === "install") {
          return commandResult("", 1, "npm ERR! code EACCES\nnpm ERR! permission denied");
        }
        if (invocation.args.includes("--json"))
          return commandResult(JSON.stringify(TARGET_VERSION));
        return commandResult();
      });
      const layer = Layer.mergeAll(
        NodeServices.layer,
        renderer.layer,
        TestFlagsLayer(),
        executionDirectoryLayer,
        updateCheckLayer,
        Layer.succeed(InstallMethod, {
          detect: () => Effect.succeed(new Npm({ importUrl: "file:///npm/axm" })),
        }),
        Layer.succeed(InstallMeta, {
          read: () => Effect.succeed(Option.none()),
          write: () => Effect.void,
        }),
        Layer.succeed(HttpClient.HttpClient, makeHttpClient()),
        subprocess.layer,
      );
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(layer));

      const logs = logsByTag(renderer.state);
      expect(logs.warn.some((line) => line.startsWith("Output from npm install -g "))).toBe(true);
      expect(logs.info).toContain("npm ERR! permission denied");
    }),
  );

  it.effect("shows plumbing only in verbose mode and gives quiet precedence", () =>
    Effect.gen(function* () {
      const verbose = makeHumanHarness(new Npm({ importUrl: "file:///npm/axm" }), {
        verbose: true,
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(verbose.layer));
      expect(verbose.logs.info).toContain("Detection: unknown (low)");
      expect(verbose.logs.info.some((line) => line.startsWith("delegation: npm "))).toBe(true);
      expect(verbose.logs.info.some((line) => line.startsWith("Verification "))).toBe(true);

      const quiet = makeHumanHarness(
        new Yarn({
          importUrl: "file:///yarn/axm",
          managerMajorVersion: 4,
          supported: false,
        }),
        { quiet: true, verbose: true },
      );
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(quiet.layer));
      expect(quiet.logs.info).toEqual([]);
      expect(quiet.logs.warn).toHaveLength(1);
      expect(quiet.logs.warn[0]).toContain("Next:");
    }),
  );
});

describe("upgrade preview", () => {
  it.effect("names the binary it would replace for a script installation", () =>
    Effect.gen(function* () {
      const subprocess = makeSubprocess();
      const harness = makeHarness(new Script({ execPath: "/usr/local/bin/axm" }), { subprocess });
      yield* handleUpgrade({ reinstall: false, preview: true }).pipe(Effect.provide(harness.layer));

      const result = resultFrom(harness.renderer);
      expect(result.ownership.method).toBe("script");
      expect(String(result.details.messages)).toContain("/usr/local/bin/axm");
      expect(String(result.details.messages)).toContain(platformBinary.binaryName);
      expect(subprocess.calls).toEqual([]);
    }),
  );

  it.effect("still reports an already-current installation truthfully", () =>
    Effect.gen(function* () {
      const harness = makeHarness(new Homebrew({ execPath: "/opt/homebrew/bin/axm" }), {
        version: LOCAL_VERSION,
      });
      yield* handleUpgrade({ reinstall: false, preview: true }).pipe(Effect.provide(harness.layer));

      expect(resultFrom(harness.renderer)).toMatchObject({
        disposition: "already-current",
        mutation: { state: "not-attempted" },
      });
    }),
  );
});

describe("transactional script upgrade", () => {
  it.effect("refuses an active per-executable lock without touching the target", () =>
    Effect.gen(function* () {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      fs.writeFileSync(
        `${target}.upgrade.lock`,
        JSON.stringify({ pid: process.pid, targetPath: target, backupPath: null }),
      );
      const harness = makeHarness(new Script({ execPath: target }));
      try {
        yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));
        expect(resultFrom(harness.renderer)).toMatchObject({
          disposition: "recovery-required",
          mutation: { state: "not-attempted" },
          outcome: "failed",
        });
        expect(fs.readFileSync(target, "utf8")).toBe("old");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );
});
