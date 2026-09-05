import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { Script, getAppError } from "axm.sh/specification-harness";
import {
  makeUpgradeExecution,
  completedUpgradeCommand,
  upgradeBinary,
} from "../../support/upgrade-execution-fixture.js";
import { LOCAL_VERSION, TARGET_VERSION } from "../../support/upgrade-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/verifies-download-before-replacement",
  title: "Script upgrade verifies a download before replacing the installed executable",
  statement:
    "For a script-owned installation, AXM shall preserve the installed executable unless the selected download has exactly one valid matching checksum and reports the selected version.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/upgrade/handler.internal.test.ts"],
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
      const upgrade = makeUpgradeExecution({ method: installed.method });
      yield* upgrade.run();
      expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
      expect(upgrade.document().result).toMatchObject({
        outcome: "applied",
        disposition: "upgraded",
        target: { version: TARGET_VERSION },
        mutation: { state: "updated" },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
      expect(upgrade.metadata).toEqual([
        expect.objectContaining({ method: "script", executablePath: installed.executable }),
      ]);
      expect(fs.readdirSync(installed.directory)).toEqual([path.basename(installed.executable)]);
    }),
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
        const before = snapshotWorkspaceContent(installed.directory);
        const names = [
          "axm-darwin-arm64",
          "axm-darwin-x64",
          "axm-linux-x64",
          "axm-linux-arm64",
          "axm-windows-x64.exe",
        ];
        const invalidChecksums =
          names.map((name) => `${"0".repeat(64)}  ${name}`).join("\n") + "\n";
        const checksumText =
          problem === "missing checksum"
            ? ""
            : problem === "duplicate checksum"
              ? invalidChecksums + invalidChecksums
              : problem === "mismatching checksum"
                ? invalidChecksums
                : undefined;
        const upgrade = makeUpgradeExecution({
          method: installed.method,
          ...(checksumText === undefined ? {} : { checksumText }),
          reply: (invocation) =>
            problem === "wrong reported version" && invocation.args[0] === "--version"
              ? Effect.succeed(completedUpgradeCommand(`${LOCAL_VERSION}\n`))
              : undefined,
        });
        const failure = yield* upgrade.run().pipe(Effect.flip);
        expect(getAppError(failure).code).toBe("validation");
        expect(snapshotWorkspaceContent(installed.directory)).toEqual(before);
        expect(upgrade.metadata).toEqual([]);
        expect(upgrade.calls.every((call) => call.executable !== installed.executable)).toBe(true);
      }),
    );
  it.effect("replaces the resolved executable while preserving a symbolic-link invocation", () =>
    Effect.gen(function* () {
      const installed = installation();
      const invocation = path.join(installed.directory, "axm-invocation");
      fs.symlinkSync(installed.executable, invocation);
      const upgrade = makeUpgradeExecution({ method: new Script({ execPath: invocation }) });
      yield* upgrade.run();
      expect(fs.lstatSync(invocation).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(invocation)).toBe(installed.executable);
      expect(fs.readFileSync(installed.executable)).toEqual(Buffer.from(upgradeBinary));
      expect(upgrade.document().result).toMatchObject({
        outcome: "applied",
        ownership: { executablePath: installed.executable },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
    }),
  );
});
