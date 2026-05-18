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
        description: "Allow AXM in Claude Code by adding `Bash(axm:*)` to `.claude/settings.json`",
        url: "https://docs.claude.com/en/docs/claude-code/iam",
      },
      {
        description:
          'Allow AXM in Codex by adding `prefix_rule(pattern=["axm"], decision="allow")` to `~/.codex/rules/${tool}.rules`',
        url: "https://developers.openai.com/codex/config-reference",
      },
      {
        description: "Allow AXM in Cursor by adding `axm` to `~/.cursor/permissions.json`",
        url: "https://cursor.com/docs/reference/permissions",
      },
      {
        description:
          "Allow AXM in Gemini CLI by adding `run_shell_command(axm)` to `.gemini/settings.json`",
        url: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md",
      },
      {
        description:
          'Allow AXM in GitHub Copilot by adding `"/^axm(\\\\s|$)/": true` to `.vscode/settings.json`',
        url: "https://code.visualstudio.com/docs/copilot/reference/copilot-settings",
      },
      {
        description: "Allow AXM in Windsurf by adding `axm` to `VS Code settings (Settings UI)`",
        url: "https://docs.windsurf.com/windsurf/terminal",
      },
    ]);
  });

  it("omits agents without a permissions capability", () => {
    expect(buildPermissionSuggestions(["opencode"])).toEqual([]);
  });

  it("omits agents whose permissions capability is unsupported", () => {
    expect(buildPermissionSuggestions(["pi"])).toEqual([]);
  });

  it("prefers project scope over user scope when both are defined", () => {
    expect(buildPermissionSuggestions(["claude-code"])[0]).toEqual({
      description: "Allow AXM in Claude Code by adding `Bash(axm:*)` to `.claude/settings.json`",
      url: "https://docs.claude.com/en/docs/claude-code/iam",
    });
  });

  it("falls back to user scope when project scope is absent", () => {
    expect(buildPermissionSuggestions(["windsurf"])[0]).toEqual({
      description: "Allow AXM in Windsurf by adding `axm` to `VS Code settings (Settings UI)`",
      url: "https://docs.windsurf.com/windsurf/terminal",
    });
  });

  it("produces descriptions that pass SuggestedAction validation", () => {
    for (const suggestion of buildPermissionSuggestions(AGENT_IDS)) {
      expect(decodeSuggestion(suggestion)).toEqual(suggestion);
    }
  });
});
