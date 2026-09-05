import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { withNativeInstallerFixture } from "../../support/native-installer-fixture.js";

export const specification = defineSpecification({
  requirement: "system/installability/native-installers-use-selected-directory",
  title: "Native installers use the selected destination directory",
  statement:
    "When AXM_INSTALL_DIR selects an absolute directory, AXM's bash, PowerShell, and cmd installers shall install the executable in that directory.",
  class: "functional",
  role: "interface",
  goals: ["platform-reach"],
  boundary: "process",
  boundaryRationale:
    "The primary example executes the actual shell installer against a local download fixture and observes the installed bytes; the existing installed-product suite binds real AXM execution for every supported installer shell.",
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/cli-e2e/src/install-verification.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The primary macOS/Linux example installs a version-answering fixture and does not establish AXM startup or Windows installer behavior. Those observations remain in the bound real-binary installed suite and its Windows shell matrix.",
      retirementCondition:
        "Retain successful real AXM installation evidence for the selected directory on every supported installer shell and platform.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("Selected native install directory", () => {
  it.effect("installs the verified bytes in an absolute custom directory containing spaces", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const result = await fixture.install({ installDirectory: fixture.customDirectory });
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const installed = path.join(fixture.customDirectory, "axm");
        expect(fs.readFileSync(installed)).toEqual(fixture.executable);
        expect(fs.statSync(installed).size).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(fixture.userHome, ".axm", "bin", "axm"))).toBe(false);
        expect(fixture.requests).toContain(`/valid/${fixture.artifactName}`);
        expect(fixture.requests).toContain("/valid/SHA256SUMS");
      }, signal),
    ),
  );
});
