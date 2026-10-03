import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";

export const executionBinding = {
  requirements: [
    "settings-contract/withdraws-new-settings-entries-exactly",
    "workspace/lockfile/withdraws-new-resolutions-exactly",
    "workspace/mcps/withdraws-eligible-native-insertions-exactly",
    "workspace/locations/container-receipts-require-continuous-identity",
    "cli/uninstall/preserves-unrelated-and-unowned-state",
  ],
  boundary: "process",
  rationale:
    "Independent built CLI invocations must preserve durable cleanup authority and restore actual bytes, symlink text, and preexisting empty directories across process exit.",
} as const;

const write = (target: string, contents: string) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};

const settings = (agent: string) =>
  `{"owner":"@acme","agents":["${agent}"],"skills":{},"mcpServers":{}}\r\n`;

const execute = async (
  fixture: ReturnType<typeof makeDirectoryFixture>,
  args: ReadonlyArray<string>,
) => {
  const result = await fixture.run([
    "-C",
    fixture.selected,
    ...args,
    "--non-interactive",
    "--json",
  ]);
  expect(result.exitCode, `${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
  return result;
};

describe("new intent and precise withdrawal across CLI processes", () => {
  for (const preexistingContainers of [false, true]) {
    it(`restores a Skill tree with ${preexistingContainers ? "authored empty" : "absent"} containers`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        write(path.join(fixture.selected, "axm.json"), settings("claude-code"));
        const source = writeLocalSkillPackage(fixture.selected, { name: "review" });
        if (preexistingContainers) {
          fs.mkdirSync(path.join(fixture.selected, ".claude", "skills"), { recursive: true });
          fs.mkdirSync(path.join(fixture.selected, ".axm"));
          write(
            path.join(fixture.selected, "axm-lock.yaml"),
            "# Authored baseline\r\nlockfileVersion: 9\r\nskills: {}\r\n",
          );
        }
        const before = snapshotTree(fixture.selected);
        await execute(fixture, ["install", source, "--skill", "review"]);
        expect(
          fs.readFileSync(
            path.join(fixture.selected, ".claude", "skills", "review", "SKILL.md"),
            "utf8",
          ),
        ).toContain("review");
        await execute(fixture, ["skills", "uninstall", "review"]);
        expect(snapshotTree(fixture.selected)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }

  it("imported MCP intent does not acquire inverse cleanup authority over native containers", async () => {
    const fixture = makeDirectoryFixture();
    try {
      write(
        path.join(fixture.selected, "axm.json"),
        JSON.stringify({ owner: "@acme", agents: ["claude-code", "cursor"] }),
      );
      const original = path.join(fixture.selected, ".mcp.json");
      const propagated = path.join(fixture.selected, ".cursor", "mcp.json");
      write(
        original,
        '{"keep":"foreign","mcpServers":{"adopted":{"command":"node","args":["server.js"]}}}',
      );
      expect(fs.existsSync(propagated)).toBe(false);
      await execute(fixture, ["mcps", "import"]);
      for (const native of [original, propagated])
        expect(JSON.parse(fs.readFileSync(native, "utf8"))).toHaveProperty(
          "mcpServers.adopted.command",
          "node",
        );
      await execute(fixture, ["mcps", "uninstall", "adopted"]);
      for (const native of [original, propagated]) {
        expect(fs.statSync(native).isFile()).toBe(true);
        expect(JSON.parse(fs.readFileSync(native, "utf8"))).toMatchObject({ mcpServers: {} });
        expect(JSON.parse(fs.readFileSync(native, "utf8"))).not.toHaveProperty(
          "mcpServers.adopted",
        );
      }
      expect(JSON.parse(fs.readFileSync(original, "utf8"))).toHaveProperty("keep", "foreign");
      expect(fs.statSync(path.dirname(propagated)).isDirectory()).toBe(true);
      expect(
        JSON.parse(fs.readFileSync(path.join(fixture.selected, "axm.json"), "utf8")),
      ).not.toHaveProperty("mcpServers.adopted");
      expect(fs.existsSync(path.join(fixture.selected, ".axm", "projection-containers.json"))).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("does not acquire empty-directory cleanup authority by repairing existing Skill intent", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const source = writeLocalSkillPackage(fixture.selected, { name: "review" });
      write(
        path.join(fixture.selected, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: ["claude-code"],
          skills: { review: { source: "./vendor/review", enabled: true } },
        }),
      );
      await execute(fixture, ["install", source, "--skill", "review"]);
      expect(
        fs.readFileSync(
          path.join(fixture.selected, ".claude", "skills", "review", "SKILL.md"),
          "utf8",
        ),
      ).toContain("review");
      const repaired = snapshotTree(fixture.selected);
      await execute(fixture, ["install", source, "--skill", "review"]);
      expect(snapshotTree(fixture.selected)).toEqual(repaired);
      await execute(fixture, ["skills", "uninstall", "review"]);
      for (const relative of [".agents/skills", ".claude/skills"]) {
        expect(fs.readdirSync(path.join(fixture.selected, relative))).toEqual([]);
      }
      expect(fs.existsSync(path.join(fixture.selected, ".axm", "projection-containers.json"))).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("does not gain native container cleanup authority by enabling existing disabled intent", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const source = writeLocalSkillPackage(fixture.selected, { name: "review" });
      write(
        path.join(fixture.selected, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: ["claude-code"],
          skills: { review: { source: "./vendor/review", enabled: false } },
        }),
      );
      await execute(fixture, ["install", source, "--skill", "review"]);
      expect(fs.existsSync(path.join(fixture.selected, ".claude", "skills", "review"))).toBe(false);
      await execute(fixture, ["skills", "enable", "review"]);
      expect(
        fs.readFileSync(
          path.join(fixture.selected, ".claude", "skills", "review", "SKILL.md"),
          "utf8",
        ),
      ).toContain("review");
      const enabled = snapshotTree(fixture.selected);
      await execute(fixture, ["skills", "enable", "review"]);
      expect(snapshotTree(fixture.selected)).toEqual(enabled);
      await execute(fixture, ["skills", "uninstall", "review"]);
      for (const relative of [".agents/skills", ".claude/skills"])
        expect(fs.readdirSync(path.join(fixture.selected, relative))).toEqual([]);
      expect(fs.existsSync(path.join(fixture.selected, ".axm", "projection-containers.json"))).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  for (const change of ["container replaced", "parent replaced", "alias retargeted"] as const) {
    it(`preserves a new native container incarnation across CLI processes after its ${change}`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        write(path.join(fixture.selected, "axm.json"), settings("claude-code"));
        const source = writeLocalSkillPackage(fixture.selected, { name: "review" });
        const sourceBefore = snapshotTree(source);
        await execute(fixture, ["install", source, "--skill", "review"]);
        const parent = path.join(fixture.selected, ".claude");
        const container = path.join(parent, "skills");
        const original = path.join(fixture.root, "original-native");
        let replacement = container;
        if (change === "parent replaced") {
          fs.renameSync(parent, original);
          fs.mkdirSync(parent);
          fs.renameSync(path.join(original, "skills"), container);
        } else {
          fs.renameSync(container, original);
          if (change === "alias retargeted") {
            replacement = path.join(fixture.selected, ".replacement", "skills");
            fs.mkdirSync(replacement, { recursive: true });
            fs.symlinkSync("../.replacement/skills", container);
          } else fs.mkdirSync(container);
          fs.renameSync(path.join(original, "review"), path.join(replacement, "review"));
        }
        const replacementIdentity = fs.statSync(replacement, { bigint: true });
        await execute(fixture, ["skills", "uninstall", "review"]);
        expect(fs.readdirSync(replacement)).toEqual([]);
        const remainingIdentity = fs.statSync(replacement, { bigint: true });
        expect(remainingIdentity.ino).toBe(replacementIdentity.ino);
        expect(remainingIdentity.dev).toBe(replacementIdentity.dev);
        if (change === "alias retargeted")
          expect(fs.readlinkSync(container)).toBe("../.replacement/skills");
        expect(snapshotTree(source)).toEqual(sourceBefore);
      } finally {
        fixture.cleanup();
      }
    });
  }

  it("expires cleanup evidence when the whole workspace moves between CLI processes", async () => {
    const fixture = makeDirectoryFixture();
    try {
      write(path.join(fixture.selected, "axm.json"), settings("claude-code"));
      const authored = "# Workspace notes\r\nKeep these exact bytes.\r\n";
      write(path.join(fixture.selected, "README.md"), authored);
      fs.mkdirSync(path.join(fixture.selected, "authored-empty"));
      await execute(fixture, [
        "mcps",
        "add",
        "context",
        "--command",
        "node",
        "--arg",
        "context.js",
      ]);
      const native = path.join(fixture.selected, ".mcp.json");
      expect(fs.readFileSync(native, "utf8")).toContain("context");
      expect(fs.existsSync(path.join(fixture.selected, ".axm", "projection-containers.json"))).toBe(
        true,
      );
      const nativeIdentity = fs.statSync(native, { bigint: true });
      const runtimeIdentity = fs.statSync(path.join(fixture.selected, ".axm"), { bigint: true });
      const installed = snapshotTree(fixture.selected);
      const moved = path.join(fixture.root, "moved-workspace");
      fs.renameSync(fixture.selected, moved);
      expect(snapshotTree(moved)).toEqual(installed);
      expect(fs.statSync(path.join(moved, ".mcp.json"), { bigint: true }).ino).toBe(
        nativeIdentity.ino,
      );

      // A new process may withdraw the owned entry, but the old workspace's
      // receipt no longer authorizes removing its now-empty native container.
      await execute({ ...fixture, selected: moved }, ["mcps", "uninstall", "context"]);
      const remainingNative = path.join(moved, ".mcp.json");
      expect(JSON.parse(fs.readFileSync(remainingNative, "utf8"))).not.toHaveProperty(
        "mcpServers.context",
      );
      expect(fs.statSync(remainingNative).isFile()).toBe(true);
      const remainingRuntime = fs.statSync(path.join(moved, ".axm"), { bigint: true });
      expect(remainingRuntime.ino).toBe(runtimeIdentity.ino);
      expect(remainingRuntime.dev).toBe(runtimeIdentity.dev);
      expect(fs.readFileSync(path.join(moved, "README.md"), "utf8")).toBe(authored);
      expect(fs.readdirSync(path.join(moved, "authored-empty"))).toEqual([]);
      expect(fs.existsSync(fixture.selected)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("does not remove a recreated receipt directory in a later CLI process", async () => {
    const fixture = makeDirectoryFixture();
    try {
      write(path.join(fixture.selected, "axm.json"), settings("claude-code"));
      const source = writeLocalSkillPackage(fixture.selected, { name: "review" });
      await execute(fixture, ["install", source, "--skill", "review"]);
      const runtime = path.join(fixture.selected, ".axm");
      const original = path.join(fixture.root, "original-runtime");
      fs.renameSync(runtime, original);
      fs.mkdirSync(runtime);
      fs.copyFileSync(
        path.join(original, "projection-containers.json"),
        path.join(runtime, "projection-containers.json"),
      );
      const replacementIdentity = fs.statSync(runtime, { bigint: true });
      await execute(fixture, ["skills", "uninstall", "review"]);
      expect(fs.existsSync(path.join(runtime, "projection-containers.json"))).toBe(false);
      const remainingIdentity = fs.statSync(runtime, { bigint: true });
      expect(remainingIdentity.ino).toBe(replacementIdentity.ino);
      expect(remainingIdentity.dev).toBe(replacementIdentity.dev);
    } finally {
      fixture.cleanup();
    }
  });

  it("restores the complete tree after precisely withdrawing a newly introduced Pack graph", async () => {
    const fixture = makeDirectoryFixture();
    try {
      write(path.join(fixture.selected, "axm.json"), settings("claude-code"));
      writeLocalSkillPackage(fixture.selected, { name: "review" });
      writeLocalSkillPackage(fixture.selected, { name: "docs" });
      const source = path.join(fixture.selected, "vendor");
      write(
        path.join(source, "workflow", "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "workflow",
          version: "1.0.0",
          dependencies: { "@acme/skills/review": "*", "@acme/skills/docs": "*" },
        }),
      );
      const before = snapshotTree(fixture.selected);
      await execute(fixture, ["install", source, "--pack", "workflow"]);
      expect(
        fs.readFileSync(
          path.join(fixture.selected, ".claude", "skills", "review", "SKILL.md"),
          "utf8",
        ),
      ).toContain("review");
      const installedLock = fs.readFileSync(path.join(fixture.selected, "axm-lock.yaml"), "utf8");
      const removal = await execute(fixture, ["packs", "uninstall", "workflow"]);
      expect(
        snapshotTree(fixture.selected),
        `Installed lock:\n${installedLock}\nRemoval:\n${removal.stdout}`,
      ).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  for (const kind of ["subagent", "rule", "hook", "knowledge"] as const) {
    it(`restores authored native bytes after precisely withdrawing a new ${kind}`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        write(
          path.join(fixture.selected, "axm.json"),
          '{"owner":"@acme","agents":["claude-code"],"instructionFiles":{}}\r\n',
        );
        write(
          path.join(fixture.selected, "AGENTS.md"),
          "# Authored instructions\r\n\r\nKeep this exact text.",
        );
        if (kind === "rule" || kind === "knowledge")
          fs.symlinkSync("AGENTS.md", path.join(fixture.selected, "CLAUDE.md"));
        write(
          path.join(fixture.selected, ".claude", "settings.json"),
          '{\r\n  "keep": true, "hooks": {}\r\n}\r\n',
        );
        const source = path.join(fixture.selected, "vendor", "context");
        write(
          path.join(source, `${kind}.json`),
          JSON.stringify({
            owner: "@acme",
            type: kind,
            name: "context",
            version: "1.0.0",
            ...(kind === "subagent"
              ? { description: "Context helper", core: { instructions: "src/context.md" } }
              : {}),
            ...(kind === "hook"
              ? {
                  implementations: [
                    {
                      id: "claude",
                      protocol: "claude-code",
                      bindings: [
                        {
                          id: "start",
                          event: "SessionStart",
                          handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
                        },
                      ],
                    },
                  ],
                }
              : {}),
            ...(kind === "knowledge"
              ? {
                  description: "Context fixture",
                  format: { name: "okf", version: "0.2" },
                  bundleRoot: "src",
                }
              : {}),
          }),
        );
        if (kind === "subagent") write(path.join(source, "src", "context.md"), "# Context\n");
        if (kind === "rule") write(path.join(source, "src", "RULE.md"), "Preserve context.\n");
        if (kind === "hook")
          write(path.join(source, "src", "hook.sh"), "#!/usr/bin/env bash\nexit 0\n");
        if (kind === "knowledge")
          write(path.join(source, "src", "index.md"), '---\nokf_version: "0.2"\n---\n# Context\n');
        const before = snapshotTree(fixture.selected);
        await execute(fixture, ["install", source, `--${kind}`, "context"]);
        const nativePath =
          kind === "subagent"
            ? path.join(fixture.selected, ".claude", "agents", "context.md")
            : kind === "hook"
              ? path.join(fixture.selected, ".claude", "settings.json")
              : path.join(fixture.selected, "AGENTS.md");
        expect(fs.readFileSync(nativePath, "utf8")).toContain("context");
        await execute(fixture, [
          kind === "knowledge" ? "knowledge" : `${kind}s`,
          "uninstall",
          "context",
        ]);
        expect(snapshotTree(fixture.selected)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }

  const cases = [
    {
      label: "absent JSON",
      agent: "claude-code",
      relative: ".mcp.json",
      scope: "project",
      before: undefined,
    },
    {
      label: "JSON CRLF alias",
      agent: "claude-code",
      relative: ".mcp.json",
      scope: "project",
      before: '{\r\n  "keep": true, "mcpServers": {}\r\n}\r\n',
      alias: true,
    },
    {
      label: "JSONC comments",
      agent: "codearts-agent",
      relative: ".codeartsdoer/codearts_cli.jsonc",
      scope: "project",
      before: '{\n  // Authored comment\n  "keep": true,\n  "mcp": {},\n}\n',
    },
    {
      label: "TOML without final newline",
      agent: "codex",
      relative: ".codex/config.toml",
      scope: "project",
      before: '# Authored comment\nmodel = "custom"',
    },
    {
      label: "YAML anchors",
      agent: "hermes",
      relative: ".hermes/config.yaml",
      scope: "user",
      before:
        "# Authored comment\r\nlabels: &labels [one, two]\r\ncopy: *labels\r\nmcp_servers: {}\r\n",
    },
  ] as const;
  for (const row of cases)
    for (const sourceKind of ["inline", "local"] as const) {
      it(`restores ${row.label} after a new ${sourceKind} MCP connection`, async () => {
        const fixture = makeDirectoryFixture();
        try {
          const workspace =
            row.scope === "project"
              ? fixture.selected
              : path.join(fixture.home, ".axm", "workspace");
          const nativeRoot = row.scope === "project" ? fixture.selected : fixture.home;
          write(path.join(workspace, "axm.json"), settings(row.agent));
          const target = path.join(nativeRoot, row.relative);
          if (row.before !== undefined) {
            if ("alias" in row && row.alias) {
              write(path.join(nativeRoot, ".native", "shared.json"), row.before);
              fs.symlinkSync(".native/shared.json", target);
            } else write(target, row.before);
          }
          const source = path.join(workspace, "vendor", "context");
          if (sourceKind === "local")
            write(
              path.join(source, "mcp.json"),
              JSON.stringify({
                owner: "@acme",
                type: "mcp-server",
                name: "context",
                version: "1.0.0",
                server: {
                  name: "io.example/context",
                  description: "Context fixture",
                  version: "1.0.0",
                  packages: [
                    {
                      registryType: "npm",
                      identifier: "@example/context",
                      version: "1.0.0",
                      transport: { type: "stdio" },
                    },
                  ],
                },
              }),
            );
          const beforeWorkspace = snapshotTree(workspace);
          const beforeNative =
            row.scope === "user" ? snapshotTree(path.join(nativeRoot, ".hermes")) : undefined;
          await execute(
            fixture,
            sourceKind === "inline"
              ? [
                  "mcps",
                  "add",
                  "context",
                  "--command",
                  "node",
                  "--arg",
                  "context.js",
                  "--scope",
                  row.scope,
                ]
              : ["install", source, "--mcp", "context", "--scope", row.scope],
          );
          expect(fs.readFileSync(target, "utf8")).toContain("context");
          await execute(fixture, ["mcps", "uninstall", "context", "--scope", row.scope]);
          expect(snapshotTree(workspace)).toEqual(beforeWorkspace);
          if (beforeNative !== undefined)
            expect(snapshotTree(path.join(nativeRoot, ".hermes"))).toEqual(beforeNative);
        } finally {
          fixture.cleanup();
        }
      });
    }
});
