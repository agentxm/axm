import * as Schema from "effect/Schema";

import { UpgradeAssessmentResultSchema } from "@agentxm/cli-maintenance/self-update/adapters/cli";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { upgradeView } from "./view.js";

const command = (
  purpose: "detection" | "delegation" | "verification",
  executable: string,
  args: ReadonlyArray<string>,
  exitCode: number,
  stderr = "",
) => ({
  purpose,
  executable,
  args,
  display: [executable, ...args].join(" "),
  executionState: "exited",
  exitCode,
  stdout: "",
  stderr,
  outputTruncated: false,
});

const assessment = (failed: boolean) =>
  Schema.decodeUnknownSync(UpgradeAssessmentResultSchema)({
    contract: "upgrade-assessment-v1",
    outcome: failed ? "failed" : "applied",
    disposition: failed ? "mutation-failed" : "upgraded",
    message: failed
      ? "npm could not install AXM 0.54.0; AXM 0.53.0 is still installed"
      : "Upgraded AXM 0.53.0 to 0.54.0 via npm",
    intent: { mode: "latest", requestedVersion: null, reinstall: false },
    platform: { os: "darwin", arch: "arm64", target: "darwin-arm64", binaryName: "axm" },
    local: { version: "0.53.0", relation: "upgrade-available" },
    ownership: {
      method: "npm",
      source: "package-manager-query",
      evidence: ["npm root -g contains axm.sh"],
      confidence: "high",
      executablePath: "/usr/local/bin/axm",
    },
    canonical: {
      source: "distribution-latest",
      version: "0.54.0",
      validatedAt: "2026-11-18T10:00:00.000Z",
    },
    installerAvailability: { state: "ready", observedVersion: "0.54.0" },
    target: {
      version: "0.54.0",
      releaseTag: "v0.54.0",
      binaryAssetUrl: null,
      checksumAssetUrl: null,
    },
    mutation: { state: failed ? "unchanged" : "updated" },
    verification: {
      state: failed ? "not-attempted" : "verified",
      reportedVersion: failed ? null : "0.54.0",
      executables: failed
        ? []
        : [
            {
              role: "path-resolved",
              path: "axm",
              resolvedExecutable: "/usr/local/bin/axm",
              reportedVersion: "0.54.0",
              exitCode: 0,
            },
          ],
    },
    recovery: {
      backupPath: null,
      recommendedCommand: failed
        ? {
            executable: "npm",
            args: ["install", "-g", "axm.sh@0.54.0"],
            shellRequired: false,
            display: "npm install -g axm.sh@0.54.0",
          }
        : null,
    },
    commands: [
      command("detection", "npm", ["root", "-g"], 0),
      command(
        "delegation",
        "npm",
        ["install", "-g", "axm.sh@0.54.0"],
        failed ? 1 : 0,
        failed ? "npm ERR! code EACCES\nnpm ERR! permission denied, mkdir '/usr/local/lib'" : "",
      ),
    ],
    details: { messages: [], homebrewFailure: null, observedFormulaVersion: null },
    steps: [],
  });

/**
 * `axm upgrade` as a record: what happened, the facts that decided it, and —
 * where the installer failed — its own output as evidence before the next
 * safe command.
 */
export default galleryModule(
  {
    _tag: "document",
    name: "record--upgrade",
    doc: upgradeView(assessment(false), "normal", [
      { description: "Verify CLI and official-skill compatibility", cmd: "axm lint" },
    ]),
  },
  {
    _tag: "document",
    name: "record--upgrade-failed",
    doc: upgradeView(assessment(true), "normal", [
      { description: "Run the installer yourself", cmd: "npm install -g axm.sh@0.54.0" },
    ]),
  },
);
