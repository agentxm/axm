import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { AGENT_IDS } from "@agentxm/client-core/unstable/agent-capabilities";
import { SuggestedActionSchema } from "@agentxm/client-core/unstable/cli-runtime";
import { buildPermissionSuggestions } from "./permission-suggestions.js";

const decodeSuggestion = Schema.decodeUnknownSync(SuggestedActionSchema);

describe("buildPermissionSuggestions", () => {
  it("returns one suggestion per agent with a permissions capability", () => {
    expect(buildPermissionSuggestions(AGENT_IDS)).toEqual([
      {
        description:
          "Allow AXM in Antigravity by adding `command(axm)` to `~/.gemini/antigravity-cli/settings.json`",
        url: "https://antigravity.google/docs/cli-permissions",
      },
      {
        description: "Allow AXM in Augment by adding `^axm(\\s|$)` to `.augment/settings.json`",
        url: "https://docs.augmentcode.com/cli/permissions",
      },
      {
        description: "Allow AXM in Claude Code by adding `Bash(axm:*)` to `.claude/settings.json`",
        url: "https://code.claude.com/docs/en/permissions",
      },
      {
        description: "Allow AXM in CodeBuddy by adding `Bash(axm:*)` to `.codebuddy/settings.json`",
        url: "https://www.codebuddy.ai/docs/cli/settings",
      },
      {
        description:
          'Allow AXM in Codex by adding `[permissions.agentxm.filesystem.":workspace_roots"] "." = "write"` to `~/.codex/axm.config.toml`',
        url: "https://learn.chatgpt.com/docs/config-file/config-reference",
      },
      {
        description: "Allow AXM in Cursor by adding `axm` to `~/.cursor/permissions.json`",
        url: "https://cursor.com/docs/cli/reference/permissions.md",
      },
      {
        description: "Allow AXM in Devin CLI by adding `Exec(axm)` to `.devin/config.json`",
        url: "https://docs.devin.ai/cli/reference/permissions",
      },
      {
        description:
          "Allow AXM in Gemini CLI by adding `run_shell_command(axm)` to `.gemini/settings.json`",
        url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
      },
      {
        description:
          "Allow AXM in GitHub Copilot CLI by adding `--allow-tool='shell(axm:*)'` to `.github/copilot/settings.json`",
        url: "https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools",
      },
      {
        description: "Allow AXM in Kilo Code by adding a permission rule to `kilo.jsonc`",
        url: "https://kilo.ai/docs/code-with-ai/platforms/cli",
      },
      {
        description: "Configure Kode to allow AXM without per-call prompts",
        url: "https://github.com/shareAI-lab/Kode-Agent",
      },
      {
        description: "Allow AXM in OpenCode by adding a permission rule to `opencode.json`",
        url: "https://opencode.ai/docs/permissions/",
      },
      {
        description: "Allow AXM in Qoder by adding `Bash(axm:*)` to `.qoder/settings.json`",
        url: "https://docs.qoder.com/en/cli/permissions",
      },
      {
        description: "Allow AXM in Qwen Code by adding a permission rule to `.qwen/settings.json`",
        url: "https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/",
      },
      {
        description:
          "Allow AXM in Devin Desktop (Windsurf) by adding `axm` to `VS Code settings (Settings UI)`",
        url: "https://docs.devin.ai/desktop/terminal",
      },
    ]);
  });

  it("includes agents with supported permission-rule metadata", () => {
    expect(buildPermissionSuggestions(["opencode"])).toEqual([
      {
        description: "Allow AXM in OpenCode by adding a permission rule to `opencode.json`",
        url: "https://opencode.ai/docs/permissions/",
      },
    ]);
  });

  it("omits agents whose permissions capability is unsupported", () => {
    expect(buildPermissionSuggestions(["pi"])).toEqual([]);
  });

  it("prefers project scope over user scope when both are defined", () => {
    expect(buildPermissionSuggestions(["claude-code"])[0]).toEqual({
      description: "Allow AXM in Claude Code by adding `Bash(axm:*)` to `.claude/settings.json`",
      url: "https://code.claude.com/docs/en/permissions",
    });
  });

  it("falls back to user scope when project scope is absent", () => {
    expect(buildPermissionSuggestions(["windsurf"])[0]).toEqual({
      description:
        "Allow AXM in Devin Desktop (Windsurf) by adding `axm` to `VS Code settings (Settings UI)`",
      url: "https://docs.devin.ai/desktop/terminal",
    });
  });

  it("uses Devin's catalog permission writer dialect", () => {
    expect(buildPermissionSuggestions(["devin"])).toEqual([
      {
        description: "Allow AXM in Devin CLI by adding `Exec(axm)` to `.devin/config.json`",
        url: "https://docs.devin.ai/cli/reference/permissions",
      },
    ]);
  });

  it("produces descriptions that pass SuggestedAction validation", () => {
    for (const suggestion of buildPermissionSuggestions(AGENT_IDS)) {
      expect(decodeSuggestion(suggestion)).toEqual(suggestion);
    }
  });
});
