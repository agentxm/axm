import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["workspace/lock/export-accepted-resolutions"],
  boundary: "process",
  rationale:
    "The packaged CLI exports recorded Registry identity with no installed content or credentials, emits directly parseable deterministic JSON in both output modes, and refuses missing or invalid locks without creating workspace state.",
});

const lock = `version = 1
[[package]]
id = "registry.invalid/@acme/skills/review"
source = { registry = "https://registry.invalid" }
version = "1.0.0"
archive = "sha512-${"A".repeat(86)}=="
publisher = "publisher-1"
tree = "sha256-tree-v2:${"1".repeat(64)}"
[skills.local-alias]
package = "registry.invalid/@acme/skills/review"
name = "@acme/skills/review"
`;

describe("Lock export", () => {
  it("exports one captured lock without installed files, setup, credentials, or network enrichment", async () => {
    const workspace = createTempDir("axm-lock-export-");
    try {
      const lockPath = path.join(workspace.path, "axm.lock");
      fs.writeFileSync(lockPath, lock);
      const run = (extra: string[] = []) =>
        runCli(["lock", "export", "--format", "cyclonedx", ...extra], { cwd: workspace.path });
      const first = await run();
      expect(first.exitCode, first.stderr).toBe(0);
      const document: unknown = JSON.parse(first.stdout);
      expect(document).toMatchObject({
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        components: [
          { name: "@acme/skills/review", hashes: [{ alg: "SHA-512", content: "0".repeat(128) }] },
        ],
        compositions: [{ aggregate: "incomplete" }],
      });
      const machine = await run(["--json"]);
      expect(machine.exitCode, machine.stderr).toBe(0);
      expect(machine.stdout).toBe(first.stdout);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(lock);
      expect(fs.readdirSync(workspace.path)).toEqual(["axm.lock"]);
      expect(first.stdout).not.toContain("local-alias");
    } finally {
      workspace.cleanup();
    }
  });

  for (const document of [undefined, "version = 999\n", "version = [\n"]) {
    it(`refuses ${document === undefined ? "missing" : document.includes("999") ? "newer" : "malformed"} locks without repairing them`, async () => {
      const workspace = createTempDir("axm-lock-refusal-");
      try {
        const lockPath = path.join(workspace.path, "axm.lock");
        if (document !== undefined) fs.writeFileSync(lockPath, document);
        const result = await runCli(["lock", "export", "--format", "cyclonedx"], {
          cwd: workspace.path,
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.stdout).not.toContain('"bomFormat"');
        expect(fs.readdirSync(workspace.path)).toEqual(document === undefined ? [] : ["axm.lock"]);
        if (document !== undefined) expect(fs.readFileSync(lockPath, "utf8")).toBe(document);
      } finally {
        workspace.cleanup();
      }
    });
  }
});
