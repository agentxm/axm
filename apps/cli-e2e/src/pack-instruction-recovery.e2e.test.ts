import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/packs/reports-instruction-recovery"],
  boundary: "process",
  rationale:
    "The built CLI must show the producer's path and recovery in both ordinary and machine output; replaying that command must repair the selected project or user scope and make the refused Pack operation succeed.",
});

for (const scope of ["project", "user"] as const)
  it(`renders and replays Pack instruction recovery for ${scope} scope`, async () => {
    const fixture = makeDirectoryFixture();
    try {
      const workspace =
        scope === "project" ? fixture.invoking : path.join(fixture.home, ".axm", "workspace");
      fs.mkdirSync(workspace, { recursive: true });
      fs.writeFileSync(
        path.join(workspace, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: ["claude-code", "codex"],
          instructionFiles: { fileName: "AGENTS.md" },
        }),
      );
      const source = path.join(fixture.invoking, "vendor");
      const pack = path.join(source, "packs", "toolkit");
      const rule = path.join(source, "rules", "policy");
      fs.mkdirSync(pack, { recursive: true });
      fs.mkdirSync(path.join(rule, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(pack, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          description: "Shared guidance.",
          dependencies: { "@acme/rules/policy": "^1.0.0" },
        }),
      );
      fs.writeFileSync(
        path.join(rule, "rule.json"),
        JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "policy",
          version: "1.0.0",
          description: "Review guidance.",
        }),
      );
      fs.writeFileSync(path.join(rule, "src", "RULE.md"), "Review the changed behavior.\n");
      const install = [
        "install",
        source,
        "--pack",
        "toolkit",
        "--scope",
        scope,
        "--non-interactive",
      ];
      const installed = await fixture.run([...install, "--json"]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      const alias =
        scope === "project"
          ? path.join(workspace, "CLAUDE.md")
          : path.join(fixture.home, ".claude", "CLAUDE.md");
      fs.unlinkSync(alias);
      const before = snapshotTree(workspace);
      const human = await fixture.run([...install, "--preview"]);
      expect(human.exitCode).not.toBe(0);
      expect(human.stdout + human.stderr).toContain(alias);
      expect(human.stdout + human.stderr).toContain("axm sync");
      const machine = await fixture.run([...install, "--preview", "--json"]);
      expect(machine.exitCode).toBe(human.exitCode);
      const error = Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(machine.stdout));
      expect(error.code).toBe("conflict");
      expect(error.detail).toContain(alias);
      const recovery = error.suggestions?.find((suggestion) =>
        suggestion.cmd?.startsWith("axm sync"),
      )?.cmd;
      if (recovery === undefined) throw new Error("Expected a sync recovery command");
      expect(recovery).toBe(scope === "user" ? "axm sync --scope user" : "axm sync");
      expect(error.detail).toContain(recovery);
      expect(snapshotTree(workspace)).toEqual(before);
      const repaired = await fixture.run([
        ...recovery.split(" ").slice(1),
        "--non-interactive",
        "--json",
      ]);
      expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
      expect(fs.existsSync(alias)).toBe(true);
      const retried = await fixture.run([...install, "--preview", "--json"]);
      expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });
