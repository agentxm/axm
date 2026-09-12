import { Script } from "@agentxm/cli-maintenance/self-update/domain";
import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";

import {
  LOCAL_VERSION,
  TARGET_VERSION,
  commandExited,
  makeUpgradeTrial,
  runUpgradeTrial,
  snapshotDirectory,
  upgradeBinary,
  type SubprocessInvocation,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/verifies-download-before-replacement",
  title: "Script upgrade verifies a download before replacing the installed executable",
  statement:
    "For a script-owned installation, AXM shall preserve the installed executable unless the selected download has exactly one valid matching checksum and reports the selected version.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The controlled process port reports executable versions; native binary viability is established by installed-boundary evidence.",
  ],
  openQuestions: [],
});

describe("Downloaded upgrade verification", () => {
  const directories: Array<string> = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      fs.rmSync(directory, { recursive: true, force: true });
  });
  const installation = () => {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-upgrade-spec-")));
    directories.push(directory);
    const executable = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
    fs.writeFileSync(executable, "Previously working AXM executable.\n", { mode: 0o755 });
    return { directory, executable, method: new Script({ execPath: executable }) };
  };
  it.effect("installs the verified selected download and records the observed version", () =>
    Effect.gen(function* () {
      const installed = installation();
      const upgrade = yield* runUpgradeTrial({ method: installed.method });
      expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
      expect(upgrade.assessment).toMatchObject({
        outcome: "applied",
        disposition: "upgraded",
        target: { version: TARGET_VERSION },
        mutation: { state: "updated" },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
      expect(upgrade.installMetaWrites).toEqual([
        expect.objectContaining({ method: "script", executablePath: installed.executable }),
      ]);
      expect(fs.readdirSync(installed.directory)).toEqual([path.basename(installed.executable)]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
  for (const problem of [
    "missing checksum",
    "duplicate checksum",
    "mismatching checksum",
    "wrong reported version",
  ] as const)
    it.effect(`preserves the installed executable for a ${problem}`, () =>
      Effect.gen(function* () {
        const installed = installation();
        const before = snapshotDirectory(installed.directory);
        const names = [
          "axm-darwin-arm64",
          "axm-darwin-x64",
          "axm-linux-x64",
          "axm-linux-arm64",
          "axm-windows-x64.exe",
        ];
        const invalidChecksums =
          names.map((name) => `${"0".repeat(64)}  ${name}`).join("\n") + "\n";
        const matchingHash = createHash("sha256").update(upgradeBinary).digest("hex");
        const matchingChecksums = names.map((name) => `${matchingHash}  ${name}`).join("\n") + "\n";
        const checksumText =
          problem === "missing checksum"
            ? ""
            : problem === "duplicate checksum"
              ? matchingChecksums + matchingChecksums
              : problem === "mismatching checksum"
                ? invalidChecksums
                : undefined;
        const upgrade = yield* makeUpgradeTrial({
          method: installed.method,
          ...(checksumText === undefined ? {} : { checksumManifest: checksumText }),
          ...(problem === "wrong reported version"
            ? {
                respond: (invocation: SubprocessInvocation) =>
                  invocation.args[0] === "--version"
                    ? commandExited(`${LOCAL_VERSION}\n`)
                    : undefined,
              }
            : {}),
        });
        const failure = yield* Effect.flip(upgrade.run());
        expect(failure._tag).toBe("UpgradeFailed");
        expect(failure.category).toBe("validation");
        expect(snapshotDirectory(installed.directory)).toEqual(before);
        expect(upgrade.installMetaWrites).toEqual([]);
        expect(upgrade.calls.every((call) => call.executable !== installed.executable)).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  it.effect("replaces the resolved executable while preserving a symbolic-link invocation", () =>
    Effect.gen(function* () {
      const installed = installation();
      const invocation = path.join(installed.directory, "axm-invocation");
      fs.symlinkSync(installed.executable, invocation);
      const upgrade = yield* runUpgradeTrial({ method: new Script({ execPath: invocation }) });
      expect(fs.lstatSync(invocation).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(invocation)).toBe(installed.executable);
      expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
      expect(upgrade.assessment).toMatchObject({
        outcome: "applied",
        ownership: { executablePath: installed.executable },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
