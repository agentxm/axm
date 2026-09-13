import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { makeDirectoryFixture, unattendedProjectSetup } from "./test-support/directory-harness.js";

/**
 * Binds this file's evidence to the requirement identities it executes at the
 * process boundary. The literal shape is read by the specification catalog;
 * cli-e2e deliberately has no code dependency on the specifications package.
 */
export const executionBinding = {
  requirements: [
    "cli/sync/removes-leftover-installed-packages",
    "cli/sync/preserves-undeclared-authored-packages",
    "cli/sync/removes-obsolete-storage-root-links",
    "cli/lint/reports-installed-but-not-configured",
    "cli/lint/reports-undeclared-authored-packages",
    "cli/lint/reports-unrecognized-install-root-entries",
    "cli/uninstall/refuses-undesired-target",
  ],
  boundary: "process",
  rationale:
    "Runs the built CLI against a persisted workspace holding leftover installed packages, an undeclared authored package, an unrecognized install-root entry, and obsolete skill links, proving lint facts, the sync convergence exit status, uninstall refusal, and the files a real sync removes and keeps.",
} as const;

const LEFTOVERS = ["audit-docs", "author-docs", "engineer-requirements"] as const;

interface Finding {
  readonly ruleId: string;
}

const writeFile = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const skillPackage = (directory: string, owner: string, name: string) => {
  writeFile(
    path.join(directory, "skill.json"),
    `${JSON.stringify({ owner, type: "skill", name, version: "0.1.0", description: "Fixture" }, null, 2)}\n`,
  );
  writeFile(
    path.join(directory, "src", "SKILL.md"),
    `---\nname: ${name}\ndescription: Fixture\n---\n# ${name}\n`,
  );
};

const snapshot = (root: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isSymbolicLink()) files[relative] = `-> ${fs.readlinkSync(absolute)}`;
      else if (entry.isDirectory()) visit(absolute);
      else files[relative] = fs.readFileSync(absolute, "utf8");
    }
  };
  visit(root);
  return files;
};

const exists = (file: string) => {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
};

describe("Leftover installed packages", () => {
  it("are reported by lint, refused by uninstall, and removed only by sync", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const workspace = fixture.selected;
      const run = (args: ReadonlyArray<string>) =>
        fixture.run(["-C", workspace, ...args, "--non-interactive", "--json"]);
      const setup = await fixture.run(["-C", workspace, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);

      const settingsPath = path.join(workspace, "axm.json");
      const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      writeFile(
        settingsPath,
        `${JSON.stringify({ ...Object(settings), owner: "@acme" }, null, 2)}\n`,
      );

      const installRoot = path.join(workspace, "agent_extensions", "agentxm");
      for (const name of LEFTOVERS)
        skillPackage(
          path.join(installRoot, "@craigsmitham", "skills", name),
          "@craigsmitham",
          name,
        );
      skillPackage(path.join(workspace, "skills", "drafted"), "@acme", "drafted");
      writeFile(path.join(installRoot, "notes.txt"), "hand-written\n");
      const skillsDir = path.join(workspace, ".claude", "skills");
      fs.mkdirSync(skillsDir, { recursive: true });
      const brokenLink = path.join(skillsDir, "vanished");
      fs.symlinkSync(
        "../../agent_extensions/agentxm/@craigsmitham/skills/vanished/src",
        brokenLink,
      );
      const legacyLink = path.join(skillsDir, "legacy");
      fs.symlinkSync("../../.axm/extensions/@axm/skills/legacy", legacyLink);
      const authoredBefore = snapshot(path.join(workspace, "skills"));

      const lint = await run(["lint"]);
      const findings: ReadonlyArray<Finding> = JSON.parse(lint.stdout).result.findings;
      const byRule = (ruleId: string) =>
        findings
          .filter((finding) => finding.ruleId === ruleId)
          .map((finding) => JSON.stringify(finding));
      const installed = byRule("workspace/installed-but-not-configured");
      expect(installed).toHaveLength(LEFTOVERS.length);
      for (const name of LEFTOVERS)
        expect(installed.some((finding) => finding.includes(`skills/${name}`))).toBe(true);
      const undeclared = byRule("workspace/authored-package-declared");
      expect(undeclared).toHaveLength(1);
      expect(undeclared[0]).toContain("skills/drafted");
      const unrecognized = byRule("workspace/install-root-entries-recognized");
      expect(unrecognized).toHaveLength(1);
      expect(unrecognized[0]).toContain("notes.txt");

      const beforeRefusal = snapshot(workspace);
      const uninstall = await run(["skills", "uninstall", "@craigsmitham/skills/audit-docs"]);
      expect(uninstall.exitCode, uninstall.stdout + uninstall.stderr).not.toBe(0);
      expect(uninstall.stdout + uninstall.stderr).toContain("axm sync");
      expect(snapshot(workspace)).toEqual(beforeRefusal);

      const check = await run(["sync", "--preview", "--fail-on-change"]);
      expect(check.exitCode, check.stdout + check.stderr).toBe(1);
      const checkUnits = JSON.stringify(JSON.parse(check.stdout).result.units);
      for (const name of LEFTOVERS) expect(checkUnits).toContain(`skills/${name}`);
      expect(checkUnits).not.toContain("notes.txt");
      expect(checkUnits).not.toContain("skills/drafted");

      const synchronized = await run(["sync"]);
      expect(synchronized.exitCode, synchronized.stdout + synchronized.stderr).toBe(0);
      for (const name of LEFTOVERS)
        expect(exists(path.join(installRoot, "@craigsmitham", "skills", name))).toBe(false);
      expect(exists(brokenLink)).toBe(false);
      expect(exists(legacyLink)).toBe(true);
      expect(fs.readFileSync(path.join(installRoot, "notes.txt"), "utf8")).toBe("hand-written\n");
      expect(snapshot(path.join(workspace, "skills"))).toEqual(authoredBefore);

      const converged = await run(["sync", "--preview", "--fail-on-change"]);
      expect(converged.exitCode, converged.stdout + converged.stderr).toBe(0);
      expect(JSON.parse(converged.stdout).result.outcome).toBe("no-op");
      const relint = await run(["lint"]);
      const remaining: ReadonlyArray<Finding> = JSON.parse(relint.stdout).result.findings;
      expect(
        remaining.filter((finding) => finding.ruleId === "workspace/installed-but-not-configured"),
      ).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });
});
