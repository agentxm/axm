import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeInstallerSelectionFixture } from "../test-support/installer-selection-fixture.js";
import { snapshotTree } from "@agentxm/test-support";

export const specification = defineSpecification({
  requirement: "system/installability/native-installers-pin-latest-release",
  title: "Public installers pin the latest complete release",
  statement:
    "When AXM_INSTALL_VERSION is unset, public installers shall resolve the production distribution's latest stable version once and install its immutable checksum-verified executable without querying GitHub.",
  class: "functional",
  role: "interface",
  goals: ["platform-reach", "trustworthy-distribution"],
  boundary: "process",
  boundaryRationale:
    "Runs the actual shell installer with a controlled downloader and independently reads the committed executable.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These controlled URL-selection cases run on macOS/Linux; PowerShell and cmd retain their existing Windows installed-product coverage without controlled latest-pointer selection.",
      retirementCondition:
        "Run the same pointer-and-version control through the Windows installers.",
    },
  ],
});

describe.skipIf(process.platform === "win32")("Latest installer release", () => {
  it.effect("resolves latest once and pins both artifact and checksum reads", () =>
    Effect.promise(async (signal) => {
      const fixture = makeInstallerSelectionFixture();
      try {
        const before = snapshotTree(fixture.platformHome);
        const result = await fixture.install("", signal);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const base = `https://releases.axm.sh/cli-v${fixture.newerVersion}`;
        expect(fixture.readRequests()).toEqual([
          "https://releases.axm.sh/latest.txt",
          `${base}/axm-${process.platform}-${process.arch}`,
          `${base}/SHA256SUMS`,
        ]);
        expect(fs.readFileSync(path.join(fixture.applicationHome, ".axm/bin/axm"))).toEqual(
          fixture.latestBytes,
        );
        expect(snapshotTree(fixture.platformHome)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    }),
  );
});
