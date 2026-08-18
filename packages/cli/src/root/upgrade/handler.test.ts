import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as semver from "semver";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import {
  logsByTag,
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  Homebrew,
  InstallMethod,
  Npm,
  Pnpm,
  Script,
  Unknown,
  Yarn,
  type InstallMethodType,
} from "@agentxm/client-core/unstable/install-method";
import { InstallMeta, type InstallMetaData } from "@agentxm/client-core/unstable/install-meta";
import type { VersionRelation } from "@agentxm/client-core/unstable/version-resolution";
import { decodeAbsolutePathSync } from "@agentxm/client-core/unstable/utils";

import { ExecutionDirectory } from "../../execution-directory.js";
import { expectRecord, property } from "../../test-helpers.js";
import { loadVersion } from "../../version.js";
import {
  decideUpgrade,
  handleUpgrade,
  parseChecksum,
  resolvePlatformBinary,
  UpgradeResultSchema,
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
  responder: (invocation: Invocation, index: number) => CommandResult | "never" = () =>
    commandResult(),
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
          return response === "never" ? Effect.never : Effect.succeed(response);
        }),
      resolveExecutable: (executable) => Effect.succeed(resolveExecutable(executable)),
    }),
  };
};

const release = (version: string) => ({
  tag_name: `cli-v${version}`,
  draft: false,
  prerelease: false,
  assets: [
    { name: platformBinary.binaryName, browser_download_url: "https://assets.test/binary" },
    { name: "SHA256SUMS", browser_download_url: "https://assets.test/SHA256SUMS" },
  ],
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
      if (request.url.endsWith("/binary")) {
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
        new Response(JSON.stringify([release(version)]), { status: 200 }),
      );
    }),
  );

const makeHarness = (
  method: InstallMethodType,
  options?: {
    readonly version?: string;
    readonly subprocess?: ReturnType<typeof makeSubprocess>;
    readonly httpClient?: HttpClient.HttpClient;
    readonly metadataFailure?: boolean;
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
    Layer.succeed(InstallMethod, { detect: () => Effect.succeed(method) }),
    Layer.succeed(InstallMeta, {
      read: () => Effect.succeed(Option.none()),
      write: (data: InstallMetaData) =>
        options?.metadataFailure === true
          ? Effect.fail(makeAppError({ code: "internal", detail: "metadata failed" }))
          : Effect.sync(() => {
              metadata.push(data);
            }),
    }),
    Layer.succeed(HttpClient.HttpClient, options?.httpClient ?? makeHttpClient(options?.version)),
    subprocess.layer,
  );
  return { layer, metadata, renderer: renderer.state, subprocess };
};

const resultFrom = (state: ReturnType<typeof TestMachineRenderer.make>["state"]) => {
  const document = expectRecord(state.results[0]?.data);
  return expectRecord(property(document, "result"));
};

const okFrom = (state: ReturnType<typeof TestMachineRenderer.make>["state"]): boolean | undefined =>
  state.results[0]?.ok;

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
    "delegates through the owning %s manager",
    ([method, executable, args]) => {
      const harness = makeHarness(method);
      return Effect.gen(function* () {
        yield* handleUpgrade({ reinstall: false });
        const result = resultFrom(harness.renderer);
        expect(result).toMatchObject({
          resultStatus: "upgraded",
          verification: "verified",
          mutationState: "updated",
          outcome: "applied",
          failedCount: 0,
        });
        expect(harness.subprocess.calls).toContainEqual(
          expect.objectContaining({ executable, args }),
        );
        expect(
          harness.subprocess.calls.every((call) => call.options?.cwd === executionDirectoryPath),
        ).toBe(true);
      }).pipe(Effect.provide(harness.layer));
    },
  );

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
        resultStatus: "upgraded",
        installMethod: "npm",
        detectionSource: "package-manager-query",
      });
      expect(property(result, "executedCommands")).toEqual(
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

  it.effect("refreshes Homebrew and verifies its stable and PATH-resolved executables", () =>
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
        if (invocation.args[0] === "--version") return commandResult(TARGET_VERSION);
        return commandResult("");
      });
      const method = new Homebrew({ execPath: "/opt/homebrew/Cellar/axm/1/bin/axm" });
      const upgrade = makeHarness(method, { subprocess });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(upgrade.layer));
      expect(resultFrom(upgrade.renderer)).toMatchObject({
        resultStatus: "upgraded",
        verification: "verified",
        executablePath: "/opt/homebrew/bin/axm",
        observedFormulaVersion: TARGET_VERSION,
      });
      expect(upgrade.subprocess.calls).toContainEqual(
        expect.objectContaining({
          executable: "brew",
          args: ["upgrade", "agentxm/tap/axm"],
        }),
      );

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
        resultStatus: "upgraded",
        verification: "verified",
        mutationState: "updated",
        recommendedCommand: null,
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
      expect(property(result, "verificationExecutables")).toEqual(
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
        resultStatus: "upgrade-incomplete",
        verification: "not-attempted",
        mutationState: "not-attempted",
        homebrewFailure: "formula-ahead-of-target",
        observedFormulaVersion: ahead,
        recommendedCommand: null,
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

  it.effect("waits for the exact Homebrew formula inside the publication window", () =>
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
      const fiber = yield* handleUpgrade({ reinstall: false }).pipe(
        Effect.provide(harness.layer),
        Effect.forkChild,
      );

      yield* TestClock.adjust("2 seconds");
      yield* Fiber.join(fiber);

      expect(resultFrom(harness.renderer)).toMatchObject({
        resultStatus: "upgraded",
        observedFormulaVersion: TARGET_VERSION,
      });
      expect(formulaQueries).toBe(2);
    }),
  );

  it.effect("stops without mutation when the selected formula misses the deadline", () =>
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
      const fiber = yield* handleUpgrade({ reinstall: false }).pipe(
        Effect.provide(harness.layer),
        Effect.forkChild,
      );

      yield* TestClock.adjust("91 seconds");
      yield* Fiber.join(fiber);

      expect(resultFrom(harness.renderer)).toMatchObject({
        resultStatus: "upgrade-incomplete",
        homebrewFailure: "target-formula-unavailable",
        observedFormulaVersion: LOCAL_VERSION,
        verification: "not-attempted",
        mutationState: "not-attempted",
        recommendedCommand: null,
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
      expect(updateCalls).toHaveLength(45);
      expect(infoCalls).toHaveLength(45);
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
        resultStatus: "upgrade-incomplete",
        homebrewFailure: "delegation-failed",
        verification: "unchanged",
        mutationState: "unchanged",
        recommendedCommand: null,
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
        resultStatus: "upgrade-incomplete",
        homebrewFailure: "manager-path-disagreement",
        verification: "mismatch",
        mutationState: "updated",
        recommendedCommand: null,
      });
      expect(
        harness.subprocess.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(0);
    }),
  );

  it.effect("reports unchanged, unavailable, and failed delegation truthfully", () =>
    Effect.gen(function* () {
      const npm = new Npm({ importUrl: "file:///npm/axm" });

      const unchanged = makeHarness(npm, {
        subprocess: makeSubprocess((invocation) =>
          invocation.executable === "axm" ? commandResult(LOCAL_VERSION) : commandResult(),
        ),
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(unchanged.layer));
      expect(resultFrom(unchanged.renderer)).toMatchObject({
        resultStatus: "upgrade-incomplete",
        verification: "unchanged",
        mutationState: "unchanged",
        outcome: "no-op",
        failedCount: 1,
      });

      const unavailable = makeHarness(npm, {
        subprocess: makeSubprocess((invocation) =>
          invocation.executable === "axm" ? commandResult("", 1, "not found") : commandResult(),
        ),
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(unavailable.layer));
      expect(resultFrom(unavailable.renderer)).toMatchObject({
        resultStatus: "upgrade-unverified",
        verification: "unavailable",
        mutationState: "unknown",
        outcome: "indeterminate",
        failedCount: 1,
      });

      const failed = makeHarness(npm, {
        subprocess: makeSubprocess((invocation) =>
          invocation.executable === "npm"
            ? commandResult("", 1, "permission denied")
            : commandResult(),
        ),
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(failed.layer));
      const result = resultFrom(failed.renderer);
      expect(result).toMatchObject({
        resultStatus: "upgrade-incomplete",
        verification: "not-attempted",
        mutationState: "unknown",
        outcome: "indeterminate",
        failedCount: 1,
      });
      expect(property(result, "executedCommands")).toEqual([
        expect.objectContaining({ purpose: "delegation", executable: "npm", exitCode: 1 }),
      ]);
    }),
  );

  it.effect("does not mutate for current/unknown, local-newer/reinstall, or modern Yarn", () =>
    Effect.gen(function* () {
      const currentProcess = makeSubprocess();
      const current = makeHarness(new Unknown({ reason: "ambiguous" }), {
        version: LOCAL_VERSION,
        subprocess: currentProcess,
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(current.layer));
      expect(resultFrom(current.renderer)).toMatchObject({
        resultStatus: "already-up-to-date",
        blockedCount: 0,
      });
      expect(okFrom(current.renderer)).toBe(true);
      expect(currentProcess.calls).toEqual([]);

      const newer = semver.inc(TARGET_VERSION, "major") ?? "999.0.0";
      const refusedProcess = makeSubprocess();
      const refused = makeHarness(new Npm({ importUrl: "file:///npm/axm" }), {
        version: TARGET_VERSION,
        subprocess: refusedProcess,
      });
      yield* handleUpgrade({ reinstall: true, localVersion: newer }).pipe(
        Effect.provide(refused.layer),
      );
      expect(resultFrom(refused.renderer)).toMatchObject({
        resultStatus: "downgrade-refused",
        blockedCount: 1,
      });
      expect(okFrom(refused.renderer)).toBe(false);
      expect(refusedProcess.calls).toEqual([]);

      const yarnProcess = makeSubprocess();
      const yarn = makeHarness(
        new Yarn({
          importUrl: "file:///yarn/axm",
          managerMajorVersion: 4,
          supported: false,
        }),
        { subprocess: yarnProcess },
      );
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(yarn.layer));
      expect(resultFrom(yarn.renderer)).toMatchObject({
        resultStatus: "manual-action-required",
        blockedCount: 1,
        installMethod: "yarn",
      });
      expect(okFrom(yarn.renderer)).toBe(false);
      expect(yarnProcess.calls).toEqual([]);
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

      const quiet = makeHumanHarness(new Unknown({ reason: "ambiguous" }), {
        quiet: true,
        verbose: true,
      });
      yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(quiet.layer));
      expect(quiet.logs.info).toEqual([]);
      expect(quiet.logs.warn).toHaveLength(1);
      expect(quiet.logs.warn[0]).toContain("Next:");
    }),
  );
});

describe("transactional script upgrade", () => {
  it.effect("validates checksum and both binary versions before removing the backup", () =>
    Effect.gen(function* () {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      const subprocess = makeSubprocess();
      const harness = makeHarness(new Script({ execPath: target }), { subprocess });
      try {
        yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));
        expect(resultFrom(harness.renderer)).toMatchObject({
          resultStatus: "upgraded",
          verification: "verified",
          mutationState: "updated",
          reportedVersion: TARGET_VERSION,
          failedCount: 0,
        });
        expect(fs.readFileSync(target)).toEqual(Buffer.from(BINARY));
        expect(fs.readdirSync(directory).filter((name) => name.includes("backup"))).toEqual([]);
        expect(harness.metadata[0]).toMatchObject({ method: "script" });
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects checksum mismatch before replacing the working binary", () =>
    Effect.gen(function* () {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      const httpClient = makeHttpClient(TARGET_VERSION, (url) =>
        url.endsWith("/SHA256SUMS")
          ? new Response(`${"0".repeat(64)}  ${platformBinary.binaryName}\n`, { status: 200 })
          : undefined,
      );
      const harness = makeHarness(new Script({ execPath: target }), { httpClient });
      try {
        const error = yield* Effect.flip(
          handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer)),
        );
        expect(error.code).toBe("validation");
        expect(fs.readFileSync(target, "utf8")).toBe("old");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );

  it.effect("restores and verifies the original after installed-path mismatch", () =>
    Effect.gen(function* () {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      const resolvedTarget = fs.realpathSync(target);
      let targetChecks = 0;
      const subprocess = makeSubprocess((invocation) => {
        if (invocation.executable === resolvedTarget) {
          targetChecks += 1;
          return targetChecks === 1 ? commandResult("77.0.0") : commandResult(LOCAL_VERSION);
        }
        return commandResult();
      });
      const harness = makeHarness(new Script({ execPath: target }), { subprocess });
      try {
        yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));
        expect(resultFrom(harness.renderer)).toMatchObject({
          resultStatus: "rolled-back",
          mutationState: "rolled-back",
          reportedVersion: LOCAL_VERSION,
          failedCount: 1,
          outcome: "no-op",
        });
        expect(fs.readFileSync(target, "utf8")).toBe("old");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );

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
          resultStatus: "manual-action-required",
          mutationState: "not-attempted",
          blockedCount: 1,
        });
        expect(fs.readFileSync(target, "utf8")).toBe("old");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );

  it.effect("replaces the resolved executable while preserving a symlink invocation", () =>
    Effect.gen(function* () {
      if (process.platform === "win32") return;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, "axm-real");
      const link = path.join(directory, "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      fs.symlinkSync(target, link);
      const harness = makeHarness(new Script({ execPath: link }));
      try {
        yield* handleUpgrade({ reinstall: false }).pipe(Effect.provide(harness.layer));
        expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(target)).toEqual(Buffer.from(BINARY));
        expect(resultFrom(harness.renderer)).toMatchObject({
          resultStatus: "upgraded",
          executablePath: fs.realpathSync(target),
        });
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );

  it.effect("restores the original and cleans the lock when interrupted after replacement", () =>
    Effect.gen(function* () {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-"));
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      fs.writeFileSync(target, "old", { mode: 0o755 });
      const resolvedTarget = fs.realpathSync(target);
      const installedCheckStarted = yield* Deferred.make<void>();
      const calls: Array<Invocation> = [];
      const subprocess = {
        calls,
        layer: Layer.succeed(Subprocess, {
          run: (executable: string, args: ReadonlyArray<string>, options?: RunCommandOptions) =>
            Effect.suspend(() => {
              const invocation = { executable, args: [...args], options };
              calls.push(invocation);
              return calls.length === 2
                ? Effect.gen(function* () {
                    yield* Deferred.succeed(installedCheckStarted, undefined);
                    return yield* Effect.never;
                  })
                : Effect.succeed(commandResult());
            }),
          resolveExecutable: (executable) => Effect.succeed(`/resolved/${executable}`),
        }),
      };
      const harness = makeHarness(new Script({ execPath: target }), { subprocess });
      try {
        const fiber = yield* handleUpgrade({ reinstall: false }).pipe(
          Effect.provide(harness.layer),
          Effect.forkChild,
        );
        yield* Deferred.await(installedCheckStarted);
        expect(calls[1]?.executable).toBe(resolvedTarget);
        expect(fs.readFileSync(target)).toEqual(Buffer.from(BINARY));
        yield* Fiber.interrupt(fiber);
        expect(fs.readFileSync(target, "utf8")).toBe("old");
        expect(fs.existsSync(`${target}.upgrade.lock`)).toBe(false);
        expect(fs.readdirSync(directory).filter((name) => name.startsWith(".axm-"))).toEqual([]);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }),
  );
});
