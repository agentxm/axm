import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as semver from "semver";

import { STABLE_CHANNEL_SCHEMA } from "@agentxm/extension-model/unstable/release-channel";

import { Homebrew, Npm, Pnpm, Script, Unknown, Yarn } from "../install-method/install-method.js";
import type { VersionRelation } from "../version-resolution/version-resolution.js";
import {
  LOCAL_VERSION,
  TARGET_VERSION,
  commandExited,
  runUpgradeTrial,
  type SubprocessInvocation,
} from "../testing.js";
import { decideUpgrade, parseChecksum, resolvePlatformBinary } from "./mechanism.js";

const BINARY = new TextEncoder().encode("fixture-binary");
const BINARY_HASH = createHash("sha256").update(BINARY).digest("hex");
const platformBinary = Option.getOrThrow(resolvePlatformBinary(process.platform, process.arch));

const unavailableCommand = (executionState: "not-started" | "timed-out", stderr: string) => ({
  executionState,
  exitCode: null,
  stdout: "",
  stderr,
});

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
      expect((yield* Effect.flip(parseChecksum("malformed\n", "axm-linux-x64"))).category).toBe(
        "validation",
      );
      expect(
        (yield* Effect.flip(
          parseChecksum(
            `${BINARY_HASH}  axm-linux-x64\n${BINARY_HASH}  axm-linux-x64\n`,
            "axm-linux-x64",
          ),
        )).category,
      ).toBe("validation");
    }),
  );
});

describe("delegated upgrades", () => {
  const managerCases = [
    [
      new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" }),
      "npm",
      ["install", "-g", `axm.sh@${TARGET_VERSION}`],
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
  ] as const;

  it.effect.each(managerCases)(
    "passes the working directory to every %s manager command",
    ([method, executable, args]) =>
      Effect.gen(function* () {
        const workingDirectory = process.cwd();
        const trial = yield* runUpgradeTrial({ method, workingDirectory });
        expect(trial.calls).toContainEqual(
          expect.objectContaining({ executable, args: [...args] }),
        );
        expect(trial.calls.every((call) => call.options?.cwd === workingDirectory)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("bypasses channel discovery for an exact stable version", () =>
    Effect.gen(function* () {
      const refusing = HttpClient.make((request) =>
        Effect.sync(() =>
          HttpClientResponse.fromWeb(request, new Response("unexpected", { status: 500 })),
        ),
      );
      const trial = yield* runUpgradeTrial({
        method: new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" }),
        requestedVersion: TARGET_VERSION,
        httpClient: refusing,
      });
      expect(trial.releaseRequests).toEqual([]);
      expect(trial.assessment).toMatchObject({
        contract: "axm.upgrade-assessment/v1",
        disposition: "upgraded",
        intent: { mode: "exact", requestedVersion: TARGET_VERSION },
        canonical: { source: "exact-version", channelRevision: null },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses bounded read-only queries to resolve an ambiguous npm layout", () =>
    Effect.gen(function* () {
      const trial = yield* runUpgradeTrial({
        method: new Unknown({
          reason: "ambiguous",
          detectionSource: "module-url",
          evidence: ["module-url:file:///legacy/node_modules/axm.sh/dist/main.js"],
          confidence: "low",
        }),
        respond: (invocation: SubprocessInvocation) => {
          if (invocation.executable === "npm" && invocation.args.join(" ") === "root -g") {
            return commandExited(`${process.cwd()}\n`);
          }
          if (
            (invocation.executable === "pnpm" && invocation.args.join(" ") === "root -g") ||
            (invocation.executable === "yarn" && invocation.args.join(" ") === "global dir")
          ) {
            return commandExited("", 1);
          }
          return undefined;
        },
      });

      expect(trial.assessment).toMatchObject({
        disposition: "upgraded",
        ownership: { method: "npm", source: "package-manager-query" },
      });
      expect(trial.assessment.commands).toEqual(
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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("maps explicit same-version Homebrew reinstall to the reinstall command", () =>
    Effect.gen(function* () {
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: "/opt/homebrew/Cellar/axm/1/bin/axm" }),
        reinstall: true,
        channelVersion: LOCAL_VERSION,
        formulaVersion: LOCAL_VERSION,
        reportedVersion: LOCAL_VERSION,
      });
      expect(trial.calls).toContainEqual(
        expect.objectContaining({ executable: "brew", args: ["reinstall", "agentxm/tap/axm"] }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("recovers one successful Homebrew no-op with one reinstall", () =>
    Effect.gen(function* () {
      let reinstallRan = false;
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        respond: (invocation: SubprocessInvocation) => {
          if (invocation.executable === "brew" && invocation.args[0] === "reinstall") {
            reinstallRan = true;
            return commandExited("");
          }
          if (invocation.args[0] === "--version") {
            return commandExited(`${reinstallRan ? TARGET_VERSION : LOCAL_VERSION}\n`);
          }
          return undefined;
        },
      });

      expect(trial.assessment).toMatchObject({
        disposition: "upgraded",
        verification: { state: "verified" },
        mutation: { state: "updated" },
        recovery: { recommendedCommand: null },
      });
      expect(
        trial.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(1);
      expect(trial.installMetaWrites).toEqual([
        expect.objectContaining({ method: "homebrew", executablePath: "/opt/homebrew/bin/axm" }),
      ]);
      expect(trial.assessment.verification.executables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "manager-owned", phase: "pre-mutation" }),
          expect.objectContaining({ role: "path-resolved", phase: "post-primary" }),
          expect.objectContaining({ role: "manager-owned", phase: "post-fallback" }),
        ]),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not mutate when Homebrew's formula is ahead of the selected target", () =>
    Effect.gen(function* () {
      const ahead = semver.inc(TARGET_VERSION, "patch") ?? "999.0.1";
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        formulaVersion: ahead,
      });

      expect(trial.assessment).toMatchObject({
        disposition: "installer-leading",
        verification: { state: "not-attempted" },
        mutation: { state: "not-attempted" },
        details: { homebrewFailure: "formula-ahead-of-target", observedFormulaVersion: ahead },
        recovery: { recommendedCommand: null },
      });
      expect(
        trial.calls.some(
          (invocation) =>
            invocation.executable === "brew" &&
            (invocation.args[0] === "upgrade" || invocation.args[0] === "reinstall"),
        ),
      ).toBe(false);
      expect(
        trial.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "update",
        ),
      ).toHaveLength(1);
      expect(
        trial.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "info",
        ),
      ).toHaveLength(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does not reinstall after a timed-out Homebrew upgrade", () =>
    Effect.gen(function* () {
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        reportedVersion: LOCAL_VERSION,
        respond: (invocation: SubprocessInvocation) =>
          invocation.executable === "brew" && invocation.args[0] === "upgrade"
            ? unavailableCommand("timed-out", "timed out")
            : undefined,
      });

      expect(trial.assessment).toMatchObject({
        disposition: "mutation-failed",
        details: { homebrewFailure: "delegation-failed" },
        verification: { state: "unchanged" },
        mutation: { state: "unchanged" },
        recovery: { recommendedCommand: null },
      });
      expect(
        trial.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports a fresh PATH shadow without reinstalling or rewriting it", () =>
    Effect.gen(function* () {
      let primaryRan = false;
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
        resolveExecutable: (executable) =>
          executable === "axm" ? "/resolved/axm" : `/resolved/${executable}`,
        respond: (invocation: SubprocessInvocation) => {
          if (invocation.executable === "brew" && invocation.args[0] === "upgrade") {
            primaryRan = true;
            return commandExited("");
          }
          if (invocation.executable === "/opt/homebrew/bin/axm") {
            return commandExited(`${primaryRan ? TARGET_VERSION : LOCAL_VERSION}\n`);
          }
          if (invocation.executable === "/resolved/axm") {
            return commandExited(`${LOCAL_VERSION}\n`);
          }
          return undefined;
        },
      });

      expect(trial.assessment).toMatchObject({
        disposition: "verification-failed",
        details: { homebrewFailure: "manager-path-disagreement" },
        verification: { state: "mismatch" },
        mutation: { state: "updated" },
        recovery: { recommendedCommand: null },
      });
      expect(
        trial.calls.filter(
          (invocation) => invocation.executable === "brew" && invocation.args[0] === "reinstall",
        ),
      ).toHaveLength(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("upgrade preview", () => {
  it.effect("names the binary it would replace for a script installation", () =>
    Effect.gen(function* () {
      const trial = yield* runUpgradeTrial({
        method: new Script({ execPath: "/usr/local/bin/axm" }),
        preview: true,
      });
      expect(trial.assessment.ownership.method).toBe("script");
      expect(String(trial.assessment.details.messages)).toContain("/usr/local/bin/axm");
      expect(String(trial.assessment.details.messages)).toContain(platformBinary.binaryName);
      expect(trial.calls).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("still reports an already-current installation truthfully", () =>
    Effect.gen(function* () {
      const trial = yield* runUpgradeTrial({
        method: new Homebrew({ execPath: "/opt/homebrew/bin/axm" }),
        preview: true,
        channelVersion: LOCAL_VERSION,
      });
      expect(trial.assessment).toMatchObject({
        disposition: "already-current",
        mutation: { state: "not-attempted" },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
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
      try {
        const trial = yield* runUpgradeTrial({
          method: new Script({ execPath: target }),
          binary: BINARY,
          checksumManifest: `${BINARY_HASH}  ${platformBinary.binaryName}\n`,
        });
        expect(trial.assessment).toMatchObject({
          disposition: "recovery-required",
          mutation: { state: "not-attempted" },
          outcome: "failed",
        });
        expect(fs.readFileSync(target, "utf8")).toBe("old");
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("release channel fixture", () => {
  it("serves the published stable-channel schema", () => {
    expect(STABLE_CHANNEL_SCHEMA).toBe("axm.release-channel/v1");
  });
});
