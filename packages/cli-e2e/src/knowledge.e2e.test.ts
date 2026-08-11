import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const createKnowledgePackage = (packageRoot: string) => {
  writeJson(path.join(packageRoot, "knowledge.json"), {
    owner: "@acme",
    type: "knowledge",
    name: "platform",
    version: "1.0.0",
    description: "Platform architecture and operational guidance.",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  });
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Platform knowledge\n',
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "architecture.md"),
    "---\ntype: reference\ndescription: Platform architecture\n---\n# Architecture\n",
  );
};

describe("axm knowledge lifecycle", () => {
  it("lints OKF resource paths and renders their diagnostics", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const packageRoot = path.join(temp.path, "knowledge");
      createKnowledgePackage(packageRoot);
      const conceptPath = path.join(packageRoot, "src", "architecture.md");
      fs.writeFileSync(path.join(packageRoot, "src", "source.txt"), "source");
      fs.writeFileSync(
        conceptPath,
        "---\ntype: reference\ndescription: Architecture\ntags: [platform]\nresource: ./source.txt\nsources:\n  - resource: platform records in the analytics warehouse\n---\n# Architecture\n",
      );

      const safe = await runCli(["knowledge", "lint", "--path", packageRoot, "--json"], {
        cwd: temp.path,
      });
      expect(safe.exitCode, safe.stdout + safe.stderr).toBe(0);
      expect(JSON.parse(safe.stdout)).toMatchObject({ ok: true, result: { valid: true } });

      fs.writeFileSync(
        conceptPath,
        "---\ntype: reference\ndescription: Architecture\ntags: [platform]\nresource: ./missing.txt\n---\n# Architecture\n",
      );
      const missing = await runCli(["knowledge", "lint", "--path", packageRoot, "--json"], {
        cwd: temp.path,
      });
      expect(missing.exitCode, missing.stdout + missing.stderr).toBe(0);
      expect(missing.stdout).toContain('"code": "unresolved-resource"');
      expect(missing.stdout).toContain('"severity": "warning"');

      fs.writeFileSync(
        conceptPath,
        "---\ntype: reference\ndescription: Architecture\ntags: [platform]\nresource: ../outside.txt\n---\n# Architecture\n",
      );
      const escaping = await runCli(["knowledge", "lint", "--path", packageRoot], {
        cwd: temp.path,
      });
      expect(escaping.exitCode).toBe(1);
      expect(escaping.stdout + escaping.stderr).toContain("escapes the Knowledge bundle");

      const help = await runCli(["help", "knowledge"], { cwd: temp.path });
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain("prose scope description");
      expect(help.stdout).toContain("resolve from the bundle root");
    } finally {
      temp.cleanup();
    }
  });

  it("publishes source-faithful frontmatter only from machine-readable open", async () => {
    const temp = createTempDir();
    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      fs.writeFileSync(path.join(sourceRoot, "src", "source.txt"), "source");
      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        [
          "---",
          "type: reference",
          "description: Platform architecture",
          "tags: [platform, architecture]",
          "status: stable",
          "sources:",
          "  - { resource: ./source.txt, title: Architecture source }",
          "producer:",
          "  nested: [one, true, null]",
          "---",
          "# Architecture",
          "",
          "Architecture body.",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "cyclic.md"),
        [
          "---",
          "type: reference",
          "description: Cyclic producer data",
          "producer: &producer",
          "  self: *producer",
          "---",
          "# Cyclic",
          "",
        ].join("\n"),
      );
      const setup = await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: { platform: { source: "./knowledge-source", enabled: true } },
      });
      const install = await runCli(["knowledge", "install", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(install.exitCode, install.stdout + install.stderr).toBe(0);

      const installedRoot = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "knowledge",
        "platform",
      );
      const installedConceptPath = path.join(installedRoot, "src", "architecture.md");
      const installedConcept = fs.readFileSync(installedConceptPath, "utf8");
      fs.writeFileSync(
        installedConceptPath,
        "---\ntype: reference\ndescription: Architecture\ntags: [platform]\nresource: ./missing.txt\n---\n# Architecture\n",
      );
      const focusedLint = await runCli(["knowledge", "lint", "--path", installedRoot, "--json"], {
        cwd: temp.path,
      });
      expect(focusedLint.exitCode, focusedLint.stdout + focusedLint.stderr).toBe(0);
      const focusedDiagnostic = JSON.parse(focusedLint.stdout).result.diagnostics.find(
        (diagnostic: { code: string }) => diagnostic.code === "unresolved-resource",
      );
      expect(focusedDiagnostic).toMatchObject({ severity: "warning" });

      const ordinaryLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(ordinaryLint.exitCode, ordinaryLint.stdout + ordinaryLint.stderr).toBe(1);
      const ordinaryFinding = JSON.parse(ordinaryLint.stdout).result.findings.find(
        (finding: { ruleId: string }) => finding.ruleId === "knowledge/unresolved-resource",
      );
      expect(ordinaryFinding).toMatchObject({
        severity: "warning",
        message: focusedDiagnostic.message,
      });
      fs.writeFileSync(installedConceptPath, installedConcept);

      const open = await runCli(["knowledge", "open", "platform", "architecture", "--json"], {
        cwd: temp.path,
      });
      expect(open.exitCode, open.stdout + open.stderr).toBe(0);
      expect(JSON.parse(open.stdout)).toMatchObject({
        ok: true,
        result: {
          concept: {
            body: "# Architecture\n\nArchitecture body.\n",
            frontmatter: {
              type: "reference",
              description: "Platform architecture",
              tags: ["platform", "architecture"],
              status: "stable",
              sources: [{ resource: "./source.txt", title: "Architecture source" }],
              producer: { nested: ["one", true, null] },
            },
          },
        },
      });

      const search = await runCli(["knowledge", "search", "Architecture", "--json"], {
        cwd: temp.path,
      });
      expect(search.exitCode, search.stdout + search.stderr).toBe(0);
      const searchDocument = JSON.parse(search.stdout);
      expect(searchDocument.result.items).toHaveLength(1);
      expect(searchDocument.result.items[0]).not.toHaveProperty("frontmatter");

      const human = await runCli(["knowledge", "open", "platform", "architecture"], {
        cwd: temp.path,
      });
      expect(human.exitCode, human.stdout + human.stderr).toBe(0);
      expect(human.stdout).toBe("");
      expect(human.stderr).toContain("# Architecture\n\nArchitecture body.\n");
      expect(human.stderr).not.toContain("frontmatter");

      const cyclic = await runCli(["knowledge", "open", "platform", "cyclic", "--json"], {
        cwd: temp.path,
      });
      expect(cyclic.exitCode).not.toBe(0);
      expect(JSON.parse(cyclic.stdout)).toMatchObject({ ok: false });
      expect(cyclic.stdout).not.toContain('"concept"');
    } finally {
      temp.cleanup();
    }
  }, 30_000);

  it("converges configured local Knowledge through install, update, sync, activation, and uninstall", async () => {
    const temp = createTempDir();

    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: {
          platform: { source: "./knowledge-source", enabled: true },
        },
      });

      const install = await runCli(["knowledge", "install", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });
      expect({
        exitCode: install.exitCode,
        output: install.stdout + install.stderr,
      }).toEqual({ exitCode: 0, output: expect.any(String) });
      expect(install.stdout + install.stderr).not.toContain("No configured extensions");

      const canonical = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "knowledge",
        "platform",
      );
      expect(fs.existsSync(path.join(canonical, "src", "architecture.md"))).toBe(true);
      expect(fs.existsSync(path.join(temp.path, ".agents", "knowledge"))).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf8")).toContain(
        "platform:",
      );
      const installedInstructions = fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8");
      expect(installedInstructions).toContain("## Knowledge Base");
      expect(installedInstructions).toContain("### @acme");
      expect(installedInstructions).toContain(
        "[platform](.axm/extensions/external/knowledge/platform/src/index.md)",
      );
      expect(installedInstructions).toContain("Platform architecture and operational guidance.");

      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        "---\ntype: reference\ndescription: Updated platform architecture\n---\n# Updated architecture\n",
      );
      writeJson(path.join(sourceRoot, "knowledge.json"), {
        ...readJson(path.join(sourceRoot, "knowledge.json")),
        description: "Updated platform guidance.",
      });
      const update = await runCli(["knowledge", "update", "--yes", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(update.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(canonical, "src", "architecture.md"), "utf8")).toContain(
        "Updated architecture",
      );
      expect(fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf8")).toContain(
        "platform:",
      );
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "Updated platform guidance.",
      );

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { directory: "docs/legacy", ignore: ["old"] },
      });
      const legacyLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(legacyLint.stdout).toContain("workspace/knowledge-config-current");
      const legacyFix = await runCli(["lint", "--fix", "--json"], {
        cwd: temp.path,
      });
      expect(legacyFix.exitCode, legacyFix.stdout + legacyFix.stderr).toBe(0);
      expect(readJson(settingsPath)["knowledgeConfig"]).toBeUndefined();

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { instructions: false },
      });
      const preview = await runCli(["sync", "--preview", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(preview.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "## Knowledge Base",
      );

      const sync = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect({ exitCode: sync.exitCode, output: sync.stdout + sync.stderr }).toEqual({
        exitCode: 0,
        output: expect.any(String),
      });
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "## Knowledge Base",
      );
      expect(fs.existsSync(canonical)).toBe(true);
      const searchWhileHidden = await runCli(["knowledge", "search", "architecture"], {
        cwd: temp.path,
      });
      expect(searchWhileHidden.exitCode).toBe(0);
      expect(searchWhileHidden.stdout).toContain("Updated architecture");

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: {},
      });
      const restoreTable = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect(restoreTable.exitCode, restoreTable.stdout + restoreTable.stderr).toBe(0);

      const disable = await runCli(["knowledge", "disable", "platform"], { cwd: temp.path });
      expect(disable.exitCode, disable.stdout + disable.stderr).toBe(0);
      expect(fs.existsSync(canonical)).toBe(true);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );

      const enable = await runCli(["knowledge", "enable", "platform"], { cwd: temp.path });
      expect(enable.exitCode, enable.stdout + enable.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain("[platform]");

      const uninstall = await runCli(
        ["knowledge", "uninstall", "platform", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(uninstall.exitCode).toBe(0);
      expect(fs.existsSync(canonical)).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
    } finally {
      temp.cleanup();
    }
  }, 60_000);
});
