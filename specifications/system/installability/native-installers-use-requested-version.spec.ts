import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeInstallerSelectionFixture } from "../../support/installer-selection-fixture.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "system/installability/native-installers-use-requested-version",
  title: "Public installers install the requested release version",
  statement:
    "When AXM_INSTALL_VERSION names an exact unprefixed major.minor.patch release without prerelease or build metadata, the public installers shall select that immutable release without stable-channel discovery and shall install only an executable reporting that version.",
  class: "functional",
  role: "interface",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "The actual public shell installer runs with a controlled downloader; exact and mutable release URLs return different checksum-valid executable bytes, and independent filesystem readback establishes which release was committed.",
  methods: ["example"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/cli/help/topics/upgrade.md",
    "packages/cli/site-content/install.sh",
    "packages/cli/site-content/install.ps1",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "When AXM_INSTALL_VERSION is unset, does latest stable mean GitHub's latest release or the separately promoted AXM stable-channel document? Current public installers use GitHub latest; the accepted upgrade owner requires the promoted channel for axm upgrade.",
    "What observable refusal and recovery must an invalid AXM_INSTALL_VERSION produce? The public source declares the supported value domain but does not state pre-request rejection, exact diagnostics, or preservation timing.",
    "Are prerelease and build-metadata versions supported by the public installers? The stated unprefixed-semver domain is broader than the accepted exact-upgrade stable-version domain; do not import upgrade's restriction without a decision.",
  ],
  limitations: [
    {
      limitation:
        "The direct cases run the shell installer on macOS/Linux. Existing PowerShell/cmd installed-product evidence verifies installation but does not discriminate immutable-version routing from latest routing; that missing URL-and-version control remains explicit.",
      retirementCondition:
        "Add the same selected-versus-newer transport control to the actual PowerShell installer and its cmd entrypoint on the supported Windows matrix.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("Exact installer release", () => {
  it.effect(
    "uses immutable coordinates even when the mutable release contains a newer valid executable",
    () =>
      Effect.promise(async (signal) => {
        const fixture = makeInstallerSelectionFixture();
        try {
          const before = snapshotWorkspaceContent(fixture.platformHome);
          const result = await fixture.install(fixture.selectedVersion, signal);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const base = `https://github.com/agentxm/axm/releases/download/cli-v${fixture.selectedVersion}`;
          expect([...fixture.readRequests()].sort()).toEqual(
            [`${base}/SHA256SUMS`, `${base}/axm-${process.platform}-${process.arch}`].sort(),
          );
          expect(fs.readFileSync(path.join(fixture.applicationHome, ".axm/bin/axm"))).toEqual(
            fixture.selectedBytes,
          );
          expect(snapshotWorkspaceContent(fixture.platformHome)).toEqual(before);
        } finally {
          fixture.cleanup();
        }
      }),
  );

  it.effect(
    "refuses checksum-valid bytes whose reported version differs from the requested release",
    () =>
      Effect.promise(async (signal) => {
        const fixture = makeInstallerSelectionFixture();
        try {
          fixture.serveDifferentReportedVersion();
          const result = await fixture.install(fixture.selectedVersion, signal);
          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(fixture.selectedVersion);
          expect(result.stderr).toContain(fixture.newerVersion);
          expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/bin/axm"))).toBe(false);
          expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/install-meta.json"))).toBe(
            false,
          );
        } finally {
          fixture.cleanup();
        }
      }),
  );
});
