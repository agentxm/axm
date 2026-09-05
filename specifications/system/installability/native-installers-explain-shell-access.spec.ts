import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { withNativeInstallerFixture } from "../../support/native-installer-fixture.js";

export const specification = defineSpecification({
  requirement: "system/installability/native-installers-explain-shell-access",
  title: "Native installers explain how to invoke the installed executable",
  statement:
    "When PATH does not select the newly installed AXM executable, the native installer shall print commands appropriate to its shell for adding the resolved installation directory to PATH and verifying that executable through its absolute path.",
  class: "human-factors",
  role: "experience",
  goals: ["platform-reach"],
  boundary: "process",
  boundaryRationale:
    "The primary examples execute the actual shell installer and then execute its printed commands against a version-answering fixture; bound installed evidence exercises the commands with real AXM on each supported installer shell.",
  methods: ["example"],
  derivedFrom: [
    "install.md",
    "packages/cli/site-content/docs/quickstart.md",
    "packages/cli-e2e/src/install-verification.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Must native installers preserve existing shell profile files and persistent user PATH, leaving those edits to explicit user action? The current profile-preservation witness does not itself establish that obligation.",
  ],
  limitations: [
    {
      limitation:
        "Primary examples exercise POSIX shell commands with a version-answering fixture, not AXM functionality. PowerShell and cmd command behavior remains in the existing real Windows installed-product matrix.",
      retirementCondition:
        "Retain successful installed-boundary execution of the printed commands against real AXM for every supported shell.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("Actionable installer guidance", () => {
  it.effect.each(["default", "custom"] as const)(
    "prints usable commands for the %s directory",
    (selection) =>
      Effect.promise((signal) =>
        withNativeInstallerFixture(async (fixture) => {
          const directory =
            selection === "custom"
              ? fixture.customDirectory
              : path.join(fixture.userHome, ".axm", "bin");
          const result = await fixture.install(
            selection === "custom" ? { installDirectory: directory } : {},
          );
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const lines = (result.stdout + result.stderr).split("\n").map((line) => line.trim());
          const pathCommand = `export PATH="${directory}:$PATH"`;
          const verifyCommand = `"${path.join(directory, "axm")}" --version`;
          expect(lines).toContain(pathCommand);
          expect(lines).toContain(verifyCommand);
          // Execute only the exact expected fixture commands after matching them.
          const throughPath = await fixture.runShell(`${pathCommand}\naxm --version`);
          const throughAbsolutePath = await fixture.runShell(verifyCommand);
          for (const observation of [throughPath, throughAbsolutePath]) {
            expect(observation.exitCode, observation.stderr).toBe(0);
            expect(observation.stdout.trim()).toBe(fixture.version);
          }
        }, signal),
      ),
  );
});
