import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { withNativeInstallerFixture } from "../../support/native-installer-fixture.js";

export const specification = defineSpecification({
  requirement: "system/installability/product-installs-through-supported-channels",
  title: "AXM installs through its supported channels with integrity verification",
  statement:
    "AXM shall install through its supported bash, PowerShell, and cmd installers, each verifying artifact integrity by checksum.",
  class: "quality",
  characteristic: "installability",
  role: "experience",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "Primary examples execute the actual shell installer with matching and mismatching download bytes. Bound installed-product evidence executes every supported installer shell with real AXM, including checksum rejection on Windows.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Must a direct native installer preserve an existing working executable when download verification fails? Existing process observations support that behavior, but this installation requirement only states installation with checksum verification; cli/upgrade/verifies-download-before-replacement separately owns the CLI upgrade promise.",
  ],
  limitations: [
    {
      limitation:
        "Primary examples use a version-answering fixture on macOS/Linux, proving installer acceptance and refusal without claiming AXM functionality. Real AXM startup and PowerShell/cmd behavior require the complementary installed-product matrix.",
      retirementCondition:
        "Retain successful real AXM installation and checksum rejection evidence for every supported installer shell and platform.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("Verified product installation", () => {
  it.effect("accepts download bytes matching the selected artifact checksum", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const result = await fixture.install();
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(fixture.requests).toContain(`/valid/${fixture.artifactName}`);
        expect(fixture.requests).toContain("/valid/SHA256SUMS");
        const installed = path.join(fixture.userHome, ".axm", "bin", "axm");
        expect(fs.readFileSync(installed)).toEqual(fixture.executable);
        const verification = await fixture.runShell(`"${installed}" --version`);
        expect(verification.exitCode, verification.stderr).toBe(0);
        expect(verification.stdout.trim()).toBe(fixture.version);
      }, signal),
    ),
  );

  it.effect("rejects altered download bytes before creating an installed executable", () =>
    Effect.promise((signal) =>
      withNativeInstallerFixture(async (fixture) => {
        const result = await fixture.install({ corruptDownload: true });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout + result.stderr).toMatch(/checksum mismatch/iu);
        expect(fixture.requests).toContain(`/corrupt/${fixture.artifactName}`);
        expect(fixture.requests).toContain("/corrupt/SHA256SUMS");
        expect(fs.existsSync(path.join(fixture.userHome, ".axm", "bin", "axm"))).toBe(false);
      }, signal),
    ),
  );
});
