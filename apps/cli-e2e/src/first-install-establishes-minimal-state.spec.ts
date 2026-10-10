import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/install/first-install-establishes-minimal-state",
  title: "First install establishes only selected management state",
  statement:
    "An explicit source install into an uninitialized scope shall establish the explicit or project-detected agent configuration and selected extension in the same operation, without Registry authentication, bundled extras, or instruction synchronization. With no explicit or detected agents it shall ask which agents to configure where a prompt can open, after the person has selected what to install, and establish the ones chosen; a selection that is cancelled or finds nothing to install shall not ask. Where no prompt can open it shall refuse without writing state and permit retry with --agent, and a cancelled question shall write no state. Its report shall name native destinations accurately. Preview, malformed existing settings or resolution locks, and an unowned native collision shall preserve existing content without accepting partial workspace state.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "A shipped CLI process owns first-use argument handling and workspace initialization; each case runs against isolated application and platform homes with no credentials.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The agent question, its place after the selection, and its cancellation are exercised in process against a scripted screen at apps/cli/src/root/install/first-install-order.test.ts and apps/cli/src/runtime.test.ts; the process examples here cover only the refusal where no prompt can open.",
      retirementCondition:
        "Add a first-install example that answers and cancels the agent question through a supported terminal process harness.",
    },
  ],
});

const payload = "---\r\nname: review\r\ncustom: unchanged\r\n---\r\n# Review\r\n";
const writeSource = (root: string) => {
  const source = path.join(root, "upstream", "review");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "SKILL.md"), payload);
  return source;
};

describe("First install", () => {
  for (const scope of ["project", "user"] as const) {
    it(`establishes minimal ${scope} state without setup or credentials`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const source = writeSource(fixture.root);
        const result = await fixture.run([
          "install",
          source,
          "--skill",
          "review",
          "--scope",
          scope,
          "--agent",
          "claude-code",
          "--json",
          "--non-interactive",
        ]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const workspace =
          scope === "project"
            ? fixture.invoking
            : path.join(fixture.applicationHome, ".axm", "workspace");
        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(workspace, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({ agents: ["claude-code"], instructionFiles: false });
        expect(settings).toHaveProperty("skills.review");
        expect(settings).not.toHaveProperty("skills.axm");
        expect(fs.existsSync(path.join(workspace, "axm-lock.yaml"))).toBe(true);
        expect(fs.existsSync(path.join(workspace, "AGENTS.md"))).toBe(false);
        expect(fs.existsSync(path.join(workspace, "CLAUDE.md"))).toBe(false);
        expect(fs.readFileSync(path.join(source, "SKILL.md"), "utf8")).toBe(payload);
        const nativeRoot = scope === "project" ? fixture.invoking : fixture.applicationHome;
        expect(
          fs.readFileSync(path.join(nativeRoot, ".claude", "skills", "review", "SKILL.md"), "utf8"),
        ).toBe(payload);
      } finally {
        fixture.cleanup();
      }
    });
  }

  for (const [command, scope] of [
    [["install"], "project"],
    [["skills", "install"], "project"],
    [["install"], "user"],
  ] as const) {
    it(`detects project agents and reports their native destinations for ${command.join(" ")} in ${scope} scope`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const source = writeSource(fixture.root);
        fs.mkdirSync(path.join(fixture.invoking, ".claude"));
        const result = await fixture.run([
          ...command,
          source,
          "--skill",
          "review",
          "--scope",
          scope,
          "--non-interactive",
        ]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const workspace =
          scope === "project"
            ? fixture.invoking
            : path.join(fixture.applicationHome, ".axm/workspace");
        const nativeRoot = scope === "project" ? fixture.invoking : fixture.applicationHome;
        expect(JSON.parse(fs.readFileSync(path.join(workspace, "axm.json"), "utf8"))).toMatchObject(
          {
            agents: ["claude-code"],
            instructionFiles: false,
          },
        );
        expect(
          fs.readFileSync(path.join(nativeRoot, ".claude/skills/review/SKILL.md"), "utf8"),
        ).toBe(payload);
        if (scope === "project")
          expect(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8")).toContain("/.axm/");
        expect(result.stdout).toContain(".claude/skills/review");
        expect(result.stdout + result.stderr).not.toContain("No coding agents received");
      } finally {
        fixture.cleanup();
      }
    });
  }

  it("refuses undetected first use without writing and permits an explicit retry", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const source = writeSource(fixture.root);
      const args = ["install", source, "--skill", "review", "--non-interactive"];
      const refused = await fixture.run(args);
      expect(refused.exitCode).toBe(2);
      expect(refused.stdout + refused.stderr).toContain("--agent");
      expect(fs.readdirSync(fixture.invoking)).toEqual([]);
      const retry = await fixture.run([...args, "--agent", "claude-code"]);
      expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
      expect(retry.stdout).toContain(".claude/skills/review");
      expect(retry.stdout + retry.stderr).not.toContain("No coding agents received");
    } finally {
      fixture.cleanup();
    }
  });

  for (const condition of [
    "preview",
    "malformed-settings",
    "malformed-lock",
    "native-collision",
  ] as const) {
    it(`preserves prior state on ${condition}`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const source = writeSource(fixture.root);
        const settingsPath = path.join(fixture.invoking, "axm.json");
        const lockPath = path.join(fixture.invoking, "axm-lock.yaml");
        if (condition === "malformed-lock") fs.writeFileSync(lockPath, "skills: [");
        const native = path.join(fixture.invoking, ".claude", "skills", "review");
        if (condition === "malformed-settings")
          fs.writeFileSync(settingsPath, "{ invalid settings");
        if (condition === "native-collision") {
          fs.mkdirSync(native, { recursive: true });
          fs.writeFileSync(path.join(native, "SKILL.md"), "# Unowned local edits\n");
        }
        const result = await fixture.run([
          "install",
          source,
          "--skill",
          "review",
          "--agent",
          "claude-code",
          "--scope",
          "project",
          "--non-interactive",
          "--json",
          ...(condition === "preview" ? ["--preview"] : []),
        ]);
        if (condition === "preview") expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        else expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
        if (condition === "malformed-lock")
          expect(fs.readFileSync(lockPath, "utf8")).toBe("skills: [");
        else expect(fs.existsSync(lockPath)).toBe(false);
        if (condition === "malformed-settings")
          expect(fs.readFileSync(settingsPath, "utf8")).toBe("{ invalid settings");
        else expect(fs.existsSync(settingsPath)).toBe(false);
        if (condition === "native-collision")
          expect(fs.readFileSync(path.join(native, "SKILL.md"), "utf8")).toBe(
            "# Unowned local edits\n",
          );
        else expect(fs.existsSync(native)).toBe(false);
      } finally {
        fixture.cleanup();
      }
    });
  }
});

describe("First portable plugin MCP install", () => {
  for (const [agent, nativePath] of [
    ["claude-code", ".mcp.json"],
    ["cursor", ".cursor/mcp.json"],
    ["codex", ".codex/config.toml"],
  ] as const) {
    it(`previews, installs and removes only the selected connection for ${agent}`, async () => {
      const fixture = makeEnvironmentProcessFixture();
      try {
        const source = path.join(fixture.root, "upstream", "plugin");
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(
          path.join(source, "plugin.json"),
          JSON.stringify({
            $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            name: "example",
          }),
        );
        const payload = JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: {
            context: { type: "streamable-http", url: "https://example.test/sse" },
            future: { type: "future-runtime", unchanged: true },
          },
        });
        fs.writeFileSync(path.join(source, "mcp.json"), payload);
        const args = [
          "mcps",
          "install",
          source,
          "--mcp-server",
          "context",
          "--as",
          "work-context",
          "--agent",
          agent,
          "--json",
          "--non-interactive",
        ];
        const preview = await fixture.run([...args, "--preview"]);
        expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
        expect(fs.existsSync(path.join(fixture.invoking, "axm.json"))).toBe(false);
        const installed = await fixture.run(args);
        expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
        const settings: unknown = JSON.parse(
          fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
        );
        expect(settings).toMatchObject({
          agents: [agent],
          instructionFiles: false,
          mcpServers: {
            "work-context": {
              nativeComponent: { format: "agent-plugins", configPath: "mcp.json", name: "context" },
            },
          },
        });
        const native = fs.readFileSync(path.join(fixture.invoking, nativePath), "utf8");
        if (agent === "codex") {
          expect(native).toMatch(/\[mcp_servers\.(?:"work-context"|work-context)\]/u);
          expect(native).toContain('url = "https://example.test/sse"');
        } else {
          expect(JSON.parse(native)).toMatchObject({
            mcpServers: { "work-context": { url: "https://example.test/sse" } },
          });
        }
        expect(native).not.toContain("future-runtime");
        expect(fs.existsSync(path.join(fixture.invoking, "AGENTS.md"))).toBe(false);
        expect(fs.existsSync(path.join(fixture.invoking, "CLAUDE.md"))).toBe(false);
        const removed = await fixture.run([
          "mcps",
          "uninstall",
          "work-context",
          "--json",
          "--non-interactive",
        ]);
        expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
        if (fs.existsSync(path.join(fixture.invoking, nativePath)))
          expect(fs.readFileSync(path.join(fixture.invoking, nativePath), "utf8")).not.toContain(
            "work-context",
          );
        expect(fs.readFileSync(path.join(source, "mcp.json"), "utf8")).toBe(payload);
      } finally {
        fixture.cleanup();
      }
    });
  }
});
