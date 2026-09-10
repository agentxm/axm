import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/knowledge/lint/reports-validation-without-mutation",
    "cli/knowledge/list/explains-instruction-entry-inclusion",
    "cli/knowledge/concepts/search/matches-lexical-query",
    "cli/knowledge/concepts/search/rejects-invalid-query",
    "cli/knowledge/concepts/query/combines-typed-filters",
    "cli/knowledge/concepts/query/enumerates-selected-document-kinds",
    "cli/knowledge/concepts/query/bounds-concept-evidence",
    "cli/knowledge/concepts/get/returns-source-backed-document",
    "cli/knowledge/concepts/get/rejects-changed-revision",
    "cli/knowledge/concepts/resolve/resolves-exact-reference",
    "cli/knowledge/concepts/resolve/requires-explicit-fuzzy-resolution",
    "cli/knowledge/concepts/related/traverses-authored-links",
    "cli/knowledge/concepts/cursors-bind-query-and-corpus",
    "cli/knowledge/concepts/reads-only-enabled-selected-corpus",
    "cli/knowledge/concepts/status/reports-current-corpus-health",
    "cli/knowledge/concepts/status/publishes-discovery-capabilities",
  ],
  boundary: "process",
  rationale:
    "Exercises Knowledge argument parsing, source capture, versioned result documents, cursor continuation, conditional retrieval, and lifecycle visibility across real CLI processes.",
} as const;

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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
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
      expect(escaping.stdout + escaping.stderr).toContain("resource escapes the Knowledge");
      expect(escaping.stdout + escaping.stderr).toContain("bundle.");

      const help = await runCli(["help", "knowledge"], { cwd: temp.path });
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain("prose scope description");
      expect(help.stdout).toContain("resolve from the bundle root");
    } finally {
      temp.cleanup();
    }
  });

  it("renders malformed frontmatter locations and clears corrected findings", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);

      const sourceRoot = path.join(temp.path, "knowledge", "platform");
      createKnowledgePackage(sourceRoot);
      fs.writeFileSync(
        path.join(sourceRoot, "src", "index.md"),
        '---\nokf_version: "0.2"\n---\n# Platform knowledge\n\n- [Architecture](architecture.md)\n',
      );
      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        owner: "@acme",
        knowledge: { platform: { source: "workspace", enabled: true } },
      });
      const installedRoot = sourceRoot;
      const sourceConceptPath = path.join(sourceRoot, "src", "architecture.md");
      fs.writeFileSync(
        sourceConceptPath,
        "---\ntype: reference\ndescription: value: extra\n---\n# Architecture\n",
      );

      const directHuman = await runCli(["knowledge", "lint", "--path", installedRoot], {
        cwd: temp.path,
      });
      expect(directHuman.exitCode).toBe(1);
      expect(directHuman.stdout + directHuman.stderr).toContain(
        "platform/architecture.md:3:14: Invalid YAML frontmatter: Nested mappings are",
      );
      expect(directHuman.stdout + directHuman.stderr).toContain("not allowed in compact mappings");

      const directJson = await runCli(["knowledge", "lint", "--path", installedRoot, "--json"], {
        cwd: temp.path,
      });
      expect(directJson.exitCode).toBe(1);
      const directDiagnostic = JSON.parse(directJson.stdout).result.diagnostics.find(
        (diagnostic: { code: string }) => diagnostic.code === "invalid-frontmatter",
      );
      expect(directDiagnostic).toMatchObject({
        relativePath: "architecture.md",
        line: 3,
        column: 14,
        message: "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
        details: {
          kind: "frontmatter-parse",
          reason: "Nested mappings are not allowed in compact mappings",
        },
      });

      const workspaceHuman = await runCli(["lint"], { cwd: temp.path });
      expect(workspaceHuman.exitCode).toBe(1);
      expect(workspaceHuman.stdout + workspaceHuman.stderr).toContain("src/architecture.md:3:14");
      expect(workspaceHuman.stdout + workspaceHuman.stderr).toContain(
        "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
      );

      const workspaceJson = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(workspaceJson.exitCode).toBe(1);
      const workspaceFinding = JSON.parse(workspaceJson.stdout).result.findings.find(
        (finding: { ruleId: string }) => finding.ruleId === "knowledge/invalid-frontmatter",
      );
      expect(workspaceFinding).toMatchObject({
        ruleId: "knowledge/invalid-frontmatter",
        message: "Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
        location: { file: "src/architecture.md", line: 3, column: 14 },
      });

      fs.writeFileSync(
        sourceConceptPath,
        "---\ntype: reference\ndescription: Platform architecture\ntags: [platform]\n---\n# Architecture\n",
      );
      const synchronized = await runCli(["sync"], { cwd: temp.path });
      expect(synchronized.exitCode, synchronized.stdout + synchronized.stderr).toBe(0);
      for (let run = 0; run < 2; run += 1) {
        const directClean = await runCli(["knowledge", "lint", "--path", installedRoot, "--json"], {
          cwd: temp.path,
        });
        expect(directClean.exitCode, directClean.stdout + directClean.stderr).toBe(0);
        expect(JSON.parse(directClean.stdout)).toMatchObject({
          ok: true,
          result: { valid: true, diagnostics: [] },
        });

        const workspaceClean = await runCli(["lint", "--json"], { cwd: temp.path });
        expect(workspaceClean.exitCode, workspaceClean.stdout + workspaceClean.stderr).toBe(0);
        expect(
          JSON.parse(workspaceClean.stdout).result.findings.some(
            (finding: { ruleId: string }) => finding.ruleId === "knowledge/invalid-frontmatter",
          ),
        ).toBe(false);
      }
    } finally {
      temp.cleanup();
    }
  });

  it("publishes source-faithful frontmatter only from machine-readable concept get", async () => {
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
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: { platform: { source: "./knowledge-source", enabled: true } },
      });
      const install = await runCli(["knowledge", "install", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(install.exitCode, install.stdout + install.stderr).toBe(0);

      const installedRoot = path.join(temp.path, "agent_extensions", "local", "knowledge-source");
      const installedConceptPath = path.join(installedRoot, "src", "architecture.md");
      const installedConcept = fs.readFileSync(installedConceptPath, "utf8");
      const sourceConceptPath = path.join(sourceRoot, "src", "architecture.md");
      fs.writeFileSync(
        sourceConceptPath,
        "---\ntype: reference\ndescription: Architecture\ntags: [platform]\nresource: ./missing.txt\n---\n# Architecture\n",
      );
      const updateMissingResource = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(
        updateMissingResource.exitCode,
        updateMissingResource.stdout + updateMissingResource.stderr,
      ).toBe(0);
      const focusedLint = await runCli(["knowledge", "lint", "--path", installedRoot, "--json"], {
        cwd: temp.path,
      });
      expect(focusedLint.exitCode, focusedLint.stdout + focusedLint.stderr).toBe(0);
      const focusedDiagnostic = JSON.parse(focusedLint.stdout).result.diagnostics.find(
        (diagnostic: { code: string }) => diagnostic.code === "unresolved-resource",
      );
      expect(focusedDiagnostic).toMatchObject({ severity: "warning" });

      const ordinaryLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(ordinaryLint.exitCode, ordinaryLint.stdout + ordinaryLint.stderr).toBe(0);
      const ordinaryFinding = JSON.parse(ordinaryLint.stdout).result.findings.find(
        (finding: { ruleId: string }) => finding.ruleId === "knowledge/unresolved-resource",
      );
      expect(ordinaryFinding).toMatchObject({
        severity: "warning",
        message: focusedDiagnostic.message,
      });
      fs.writeFileSync(sourceConceptPath, installedConcept);
      const restoreConcept = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(restoreConcept.exitCode, restoreConcept.stdout + restoreConcept.stderr).toBe(0);

      const get = await runCli(
        ["knowledge", "concepts", "get", "@acme/knowledge/platform#architecture", "--json"],
        { cwd: temp.path },
      );
      expect(get.exitCode, get.stdout + get.stderr).toBe(0);
      expect(JSON.parse(get.stdout)).toMatchObject({
        ok: true,
        result: {
          outcome: "found",
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

      const search = await runCli(["knowledge", "concepts", "search", "Architecture", "--json"], {
        cwd: temp.path,
      });
      expect(search.exitCode, search.stdout + search.stderr).toBe(0);
      const searchDocument = JSON.parse(search.stdout);
      expect(searchDocument.result.items).toHaveLength(1);
      expect(searchDocument.result.items[0]).not.toHaveProperty("frontmatter");

      const human = await runCli(
        ["knowledge", "concepts", "get", "@acme/knowledge/platform#architecture"],
        { cwd: temp.path },
      );
      expect(human.exitCode, human.stdout + human.stderr).toBe(0);
      expect(human.stdout).toContain("# Architecture\n\nArchitecture body.");
      expect(human.stdout).not.toContain("frontmatter");

      const cyclic = await runCli(
        ["knowledge", "concepts", "get", "@acme/knowledge/platform#cyclic", "--json"],
        { cwd: temp.path },
      );
      expect(cyclic.exitCode).not.toBe(0);
      expect(JSON.parse(cyclic.stdout)).toMatchObject({ ok: false });
      expect(cyclic.stdout).not.toContain('"concept"');
    } finally {
      temp.cleanup();
    }
  }, 60_000);

  it("searches normalized tokens, phrases, and exact literals with stable validation", async () => {
    const temp = createTempDir();
    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        [
          "---",
          "type: reference",
          "description: Specification guide",
          "tags: [source-of-truth]",
          "---",
          "# SpecDrivenDevelopment",
          "",
          "Treat the spec as authoritative.",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "split.md"),
        "---\ntype: reference\ndescription: boundary only\n---\n# Cross field\n",
      );
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: { platform: { source: "./knowledge-source", enabled: true } },
      });
      const install = await runCli(["knowledge", "install", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(install.exitCode, install.stdout + install.stderr).toBe(0);

      const cases = [
        ["specification source of truth", 1],
        ["spec as source", 1],
        ["truth specification source", 1],
        ["  SOURCE\tOF  TRUTH  ", 1],
        ['"source of truth"', 1],
        ['literal:"SOURCE-OF-TRUTH"', 1],
        ['literal:"source of truth"', 0],
        ["spec driven development", 1],
        ["specifications", 0],
        ["field boundary", 1],
        ['"field boundary"', 0],
        ["executed-zero-match", 0],
      ] as const;
      for (const [query, count] of cases) {
        const result = await runCli(["knowledge", "concepts", "search", query, "--json"], {
          cwd: temp.path,
        });
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, result: { count } });
      }

      for (const query of ["", " \t ", '""', 'literal:""']) {
        const result = await runCli(["knowledge", "concepts", "search", query, "--json"], {
          cwd: temp.path,
        });
        expect(result.exitCode, result.stdout + result.stderr).toBe(9);
        expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "validation" });
      }

      const help = await runCli(["help", "knowledge"], { cwd: temp.path });
      expect(help.exitCode, help.stdout + help.stderr).toBe(0);
      expect(help.stdout).toContain("Bare terms use all-terms matching");
      expect(help.stdout).toContain('literal:"<text>"');
      expect(help.stdout).toContain("never matches by spanning two searchable fields");
      expect(help.stdout).toContain("fail validation instead of enumerating the corpus");
    } finally {
      temp.cleanup();
    }
  }, 60_000);

  it("discovers versioned concepts through query, pagination, resolution, retrieval, and graph navigation", async () => {
    const temp = createTempDir();
    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      fs.writeFileSync(
        path.join(sourceRoot, "src", "index.md"),
        '---\nokf_version: "0.2"\n---\n# Platform\n\n[Security](security.md)\n',
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "architecture.md"),
        [
          "---",
          "type: reference",
          "description: Platform architecture",
          "tags: [platform]",
          "status: stable",
          "audience: agents",
          "---",
          "# Architecture",
          "",
          "[Security](security.md)",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "security.md"),
        "---\ntype: guide\ndescription: Security controls\ntags: [security]\nstatus: draft\n---\n# Security\n\nSafe \u001b[31mred\u001b[0m \u202etext.\n",
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "deprecated.md"),
        "---\ntype: reference\ndescription: Retired guidance\nstatus: deprecated\n---\n# Deprecated\n",
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "alpha.md"),
        "---\ntype: reference\ndescription: First shared concept\n---\n# Shared\n",
      );
      fs.writeFileSync(
        path.join(sourceRoot, "src", "beta.md"),
        "---\ntype: reference\ndescription: Second shared concept\n---\n# Shared\n",
      );

      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: { platform: { source: "./knowledge-source", enabled: true } },
      });
      const install = await runCli(["knowledge", "install", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(install.exitCode, install.stdout + install.stderr).toBe(0);

      const status = await runCli(["knowledge", "concepts", "status", "--json"], {
        cwd: temp.path,
      });
      expect(status.exitCode, status.stdout + status.stderr).toBe(0);
      expect(JSON.parse(status.stdout)).toMatchObject({
        ok: true,
        result: {
          readiness: "ready",
          health: { status: "healthy" },
          capabilities: {
            operations: ["resolve", "search", "query", "get", "related", "status"],
            strategies: ["lexical"],
            operators: ["term", "phrase", "literal", "equals", "not-equals", "contains"],
          },
        },
      });

      const firstPage = await runCli(["knowledge", "concepts", "query", "--limit", "1", "--json"], {
        cwd: temp.path,
      });
      expect(firstPage.exitCode, firstPage.stdout + firstPage.stderr).toBe(0);
      const firstDocument = JSON.parse(firstPage.stdout);
      expect(firstDocument.result).toMatchObject({ count: 4, hasMore: true });
      expect(firstDocument.result.items).toHaveLength(1);
      expect(firstDocument.result.items[0].kind).toBe("concept");

      const secondPage = await runCli(
        [
          "knowledge",
          "concepts",
          "query",
          "--limit",
          "1",
          "--cursor",
          firstDocument.result.cursor,
          "--json",
        ],
        { cwd: temp.path },
      );
      expect(secondPage.exitCode, secondPage.stdout + secondPage.stderr).toBe(0);
      const secondDocument = JSON.parse(secondPage.stdout);
      expect(secondDocument.result.items[0].ref).not.toEqual(firstDocument.result.items[0].ref);

      for (const [filter, count] of [
        [["--metadata", "tag~=form"], 1],
        [["--lifecycle", "status!=draft"], 4],
        [["--property", "/audience=agents"], 1],
      ] as const) {
        const query = await runCli(
          ["knowledge", "concepts", "query", ...filter, "--explain", "--json"],
          { cwd: temp.path },
        );
        expect(query.exitCode, query.stdout + query.stderr).toBe(0);
        expect(JSON.parse(query.stdout)).toMatchObject({
          ok: true,
          result: { count, explanation: { strategy: "lexical" } },
        });
      }

      const reserved = await runCli(
        ["knowledge", "concepts", "query", "--kind", "index", "--json"],
        { cwd: temp.path },
      );
      expect(JSON.parse(reserved.stdout)).toMatchObject({
        ok: true,
        result: { count: 1, items: [{ kind: "index" }] },
      });
      const deprecated = await runCli(
        ["knowledge", "concepts", "query", "--status", "deprecated", "--json"],
        { cwd: temp.path },
      );
      expect(JSON.parse(deprecated.stdout)).toMatchObject({ ok: true, result: { count: 1 } });

      for (const reference of [
        "@acme/knowledge/platform#architecture",
        "https://agentxm.ai/@acme/knowledge/platform/concepts/architecture",
      ]) {
        const resolved = await runCli(["knowledge", "concepts", "resolve", reference, "--json"], {
          cwd: temp.path,
        });
        expect(resolved.exitCode, resolved.stdout + resolved.stderr).toBe(0);
        expect(JSON.parse(resolved.stdout)).toMatchObject({
          ok: true,
          result: { outcome: "resolved", candidate: { ref: { conceptId: "architecture" } } },
        });
      }
      const noImplicitFuzzy = await runCli(
        ["knowledge", "concepts", "resolve", "Shared", "--json"],
        { cwd: temp.path },
      );
      expect(noImplicitFuzzy.exitCode).toBe(3);
      const ambiguous = await runCli(
        ["knowledge", "concepts", "resolve", "Shared", "--fuzzy", "--json"],
        { cwd: temp.path },
      );
      expect(ambiguous.exitCode, ambiguous.stdout + ambiguous.stderr).toBe(6);
      expect(JSON.parse(ambiguous.stdout)).toMatchObject({
        ok: false,
        result: { outcome: "ambiguous", reason: "ambiguous-reference" },
      });

      const related = await runCli(
        ["knowledge", "concepts", "related", "@acme/knowledge/platform#security", "--json"],
        { cwd: temp.path },
      );
      expect(related.exitCode, related.stdout + related.stderr).toBe(0);
      expect(JSON.parse(related.stdout)).toMatchObject({
        result: {
          count: 1,
          includesIndexBacklinks: false,
          items: [{ relation: "backlink", evidence: { sourceRelativePath: "architecture.md" } }],
        },
      });
      const withIndexBacklinks = await runCli(
        [
          "knowledge",
          "concepts",
          "related",
          "@acme/knowledge/platform#security",
          "--include-index-backlinks",
          "--json",
        ],
        { cwd: temp.path },
      );
      expect(JSON.parse(withIndexBacklinks.stdout)).toMatchObject({ result: { count: 2 } });

      const get = await runCli(
        ["knowledge", "concepts", "get", "@acme/knowledge/platform#architecture", "--json"],
        { cwd: temp.path },
      );
      const revision = JSON.parse(get.stdout).result.concept.ref.contentRevision;
      fs.appendFileSync(path.join(sourceRoot, "src", "architecture.md"), "\nChanged.\n");
      const updateRevision = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(updateRevision.exitCode, updateRevision.stdout + updateRevision.stderr).toBe(0);
      const guarded = await runCli(
        [
          "knowledge",
          "concepts",
          "get",
          "@acme/knowledge/platform#architecture",
          "--if-revision",
          revision,
          "--json",
        ],
        { cwd: temp.path },
      );
      expect(guarded.exitCode).toBe(6);
      expect(JSON.parse(guarded.stdout)).toMatchObject({
        ok: false,
        result: { outcome: "failed", reason: "revision-changed" },
      });
      const expiredCursor = await runCli(
        [
          "knowledge",
          "concepts",
          "query",
          "--limit",
          "1",
          "--cursor",
          firstDocument.result.cursor,
          "--json",
        ],
        { cwd: temp.path },
      );
      expect(expiredCursor.exitCode).toBe(6);
      expect(JSON.parse(expiredCursor.stdout)).toMatchObject({
        ok: false,
        result: { outcome: "failed", reason: "cursor-expired" },
      });

      for (const removed of ["search", "open"]) {
        const invocation = await runCli(["knowledge", removed], { cwd: temp.path });
        expect(invocation.exitCode).toBe(2);
      }
    } finally {
      temp.cleanup();
    }
  }, 120_000);

  it("converges configured local Knowledge through install, update, sync, activation, and uninstall", async () => {
    const temp = createTempDir();

    try {
      const sourceRoot = path.join(temp.path, "knowledge-source");
      createKnowledgePackage(sourceRoot);
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );

      const settingsPath = path.join(temp.path, "axm.json");
      writeJson(settingsPath, {
        ...readJson(settingsPath),
        agents: [],
        knowledge: {
          platform: { source: "./knowledge-source", enabled: true },
        },
      });

      const install = await runCli(["knowledge", "install", "--non-interactive"], {
        cwd: temp.path,
      });
      expect({
        exitCode: install.exitCode,
        output: install.stdout + install.stderr,
      }).toEqual({ exitCode: 0, output: expect.any(String) });
      expect(install.stdout + install.stderr).not.toContain("No configured extensions");

      const canonical = path.join(temp.path, "agent_extensions", "local", "knowledge-source");
      expect(fs.existsSync(path.join(canonical, "src", "architecture.md"))).toBe(true);
      expect(fs.existsSync(path.join(temp.path, ".agents", "knowledge"))).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, "axm-lock.yaml"), "utf8")).toContain("platform:");
      const installedInstructions = fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8");
      expect(installedInstructions).toContain("## Knowledge Bundles");
      expect(installedInstructions).toContain(
        "Use `axm knowledge concepts --help` to search, read, and explore these bundles.",
      );
      expect(installedInstructions).toContain("### @acme");
      expect(installedInstructions).toContain(
        "[platform](agent_extensions/local/knowledge-source/src/index.md)",
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
      const update = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(update.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(canonical, "src", "architecture.md"), "utf8")).toContain(
        "Updated architecture",
      );
      expect(fs.readFileSync(path.join(temp.path, "axm-lock.yaml"), "utf8")).toContain("platform:");
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "Updated platform guidance.",
      );

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledgeConfig: { instructions: false },
      });
      const preview = await runCli(["sync", "--preview", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(preview.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain(
        "## Knowledge Bundles",
      );

      const sync = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect({ exitCode: sync.exitCode, output: sync.stdout + sync.stderr }).toEqual({
        exitCode: 0,
        output: expect.any(String),
      });
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "## Knowledge Bundles",
      );
      expect(fs.existsSync(canonical)).toBe(true);
      const searchWhileHidden = await runCli(["knowledge", "concepts", "search", "architecture"], {
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

      writeJson(path.join(sourceRoot, "knowledge.json"), {
        ...readJson(path.join(sourceRoot, "knowledge.json")),
        instructionEntry: false,
      });
      const applyManifestDefault = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(
        applyManifestDefault.exitCode,
        applyManifestDefault.stdout + applyManifestDefault.stderr,
      ).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
      const searchWithManifestExclusion = await runCli(
        ["knowledge", "concepts", "search", "architecture"],
        { cwd: temp.path },
      );
      expect(searchWithManifestExclusion.exitCode).toBe(0);
      expect(searchWithManifestExclusion.stdout).toContain("Updated architecture");

      const currentSettings = readJson(settingsPath);
      writeJson(settingsPath, {
        ...currentSettings,
        knowledge: {
          platform: {
            source: "./knowledge-source",
            instructionEntry: true,
          },
        },
      });
      const includeOverride = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect(includeOverride.exitCode, includeOverride.stdout + includeOverride.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain("[platform]");
      const updateWithIncludeOverride = await runCli(["knowledge", "update", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(
        updateWithIncludeOverride.exitCode,
        updateWithIncludeOverride.stdout + updateWithIncludeOverride.stderr,
      ).toBe(0);
      expect(readJson(settingsPath)).toMatchObject({
        knowledge: { platform: { instructionEntry: true } },
      });

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledge: {
          platform: {
            source: "./knowledge-source",
            instructionEntry: false,
          },
        },
      });
      const excludeOverride = await runCli(["sync", "--non-interactive"], { cwd: temp.path });
      expect(excludeOverride.exitCode, excludeOverride.stdout + excludeOverride.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
      const list = await runCli(["knowledge", "list", "--json"], { cwd: temp.path });
      expect(list.exitCode, list.stdout + list.stderr).toBe(0);
      expect(JSON.parse(list.stdout)).toMatchObject({
        result: {
          items: [
            {
              name: "platform",
              instructionEntry: { included: false, reason: "workspace-excluded" },
            },
          ],
        },
      });

      const disable = await runCli(["knowledge", "disable", "platform"], { cwd: temp.path });
      expect(disable.exitCode, disable.stdout + disable.stderr).toBe(0);
      expect(fs.existsSync(canonical)).toBe(true);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );

      const enable = await runCli(["knowledge", "enable", "platform"], { cwd: temp.path });
      expect(enable.exitCode, enable.stdout + enable.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
      expect(readJson(settingsPath)).toMatchObject({
        knowledge: { platform: { instructionEntry: false } },
      });
      const searchAfterEnable = await runCli(["knowledge", "concepts", "search", "architecture"], {
        cwd: temp.path,
      });
      expect(searchAfterEnable.exitCode).toBe(0);

      writeJson(settingsPath, {
        ...readJson(settingsPath),
        knowledge: {
          platform: {
            source: "./knowledge-source",
            instructionEntry: true,
          },
        },
      });
      const restoreOverride = await runCli(["sync", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(restoreOverride.exitCode, restoreOverride.stdout + restoreOverride.stderr).toBe(0);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).toContain("[platform]");

      const uninstall = await runCli(["knowledge", "uninstall", "platform", "--non-interactive"], {
        cwd: temp.path,
      });
      expect(uninstall.exitCode).toBe(0);
      expect(fs.existsSync(canonical)).toBe(false);
      expect(fs.readFileSync(path.join(temp.path, "AGENTS.md"), "utf8")).not.toContain(
        "[platform]",
      );
    } finally {
      temp.cleanup();
    }
  }, 120_000);
});
