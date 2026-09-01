import { describe, expect, it } from "@effect/vitest";
import {
  hasManagedFileBanner,
  insertManagedFileBanner,
  managedFileFormatForPath,
  stripManagedFileBanner,
} from "./managed-file-banner.js";

describe("managedFileFormatForPath", () => {
  it("detects markdown and TOML commentable files", () => {
    expect(managedFileFormatForPath(".claude/rules/review.md")).toBe("markdown");
    expect(managedFileFormatForPath(".github/prompts/review.prompt.md")).toBe("markdown");
    expect(managedFileFormatForPath(".gemini/rules/review.toml")).toBe("toml");
  });

  it("skips non-commentable rendered files", () => {
    expect(managedFileFormatForPath(".kiro/agents/review.json")).toBeUndefined();
    expect(managedFileFormatForPath(".kiro/prompts/review.txt")).toBeUndefined();
    expect(managedFileFormatForPath(".roomodes")).toBeUndefined();
  });
});

describe("insertManagedFileBanner", () => {
  it("inserts markdown banner below frontmatter", () => {
    const content = `---
name: reviewer
---

Review code.`;

    const result = insertManagedFileBanner(content, {
      ext: "@acme/subagents/reviewer",
      source: {
        kind: "acquired",
        path: "agent_extensions/agentxm/@acme/subagents/reviewer/src/reviewer.md",
      },
      helpTopic: "subagents",
      format: "markdown",
    });

    expect(result).toBe(`---
name: reviewer
---
<!-- axm:file v=1 ext=@acme/subagents/reviewer src=agent_extensions/agentxm/@acme/subagents/reviewer/src/reviewer.md
     AXM managed projection — do not edit directly.
     Source: agent_extensions/agentxm/@acme/subagents/reviewer/src/reviewer.md (acquired, immutable)
     Use \`axm fork\` to create an authored copy before customizing.
     Learn more: \`axm help subagents\` -->


Review code.`);
  });

  it("inserts markdown banner at the top without frontmatter", () => {
    const result = insertManagedFileBanner("Review code.", {
      ext: "@acme/rules/review",
      source: { kind: "workspace-authored", path: "rules/review/src/review.md" },
      helpTopic: "rules",
      format: "markdown",
    });

    expect(result).toBe(`<!-- axm:file v=1 ext=@acme/rules/review src=rules/review/src/review.md
     AXM managed projection — do not edit directly.
     Source: rules/review/src/review.md
     Change the source, then run \`axm sync\`.
     Learn more: \`axm help rules\` -->

Review code.`);
  });

  it("prepends TOML banner", () => {
    const result = insertManagedFileBanner('prompt = "Review code."\n', {
      ext: "@acme/rules/review",
      source: {
        kind: "acquired",
        path: "agent_extensions/agentxm/@acme/rules/review/src/review.md",
      },
      helpTopic: "rules",
      format: "toml",
    });

    expect(result)
      .toBe(`# axm:file v=1 ext=@acme/rules/review src=agent_extensions/agentxm/@acme/rules/review/src/review.md
# AXM managed projection — do not edit directly.
# Source: agent_extensions/agentxm/@acme/rules/review/src/review.md (acquired, immutable)
# Use \`axm fork\` to create an authored copy before customizing.
# Learn more: \`axm help rules\`

prompt = "Review code."
`);
  });

  it("names workspace configuration without presenting it as an authored package", () => {
    const result = insertManagedFileBanner("# Workspace\n", {
      ext: "@agentxm/instructions/alias",
      source: { kind: "workspace-config", path: "AGENTS.md" },
      helpTopic: "instructions",
      format: "markdown",
    });

    expect(result).toContain("Configuration source: AGENTS.md");
    expect(result).toContain("Change the configuration source, then run `axm sync`.");
    expect(result).not.toContain("Use `axm fork`");
  });

  it("identifies bundled sources without offering an edit path", () => {
    const result = insertManagedFileBanner("# Review\n", {
      ext: "@agentxm/subagents/reviewer",
      source: { kind: "bundled", path: "bundled/subagents/reviewer.md" },
      helpTopic: "subagents",
      format: "markdown",
    });

    expect(result).toContain("Source: bundled/subagents/reviewer.md (bundled with AXM)");
    expect(result).toContain("Manage this source through AXM; do not modify it directly.");
    expect(result).not.toContain("Change the source");
    expect(result).not.toContain("Use `axm fork`");
  });

  it("does not duplicate an existing banner", () => {
    const first = insertManagedFileBanner("Review code.", {
      ext: "@acme/rules/review",
      source: {
        kind: "acquired",
        path: "agent_extensions/agentxm/@acme/rules/review/src/review.md",
      },
      helpTopic: "rules",
      format: "markdown",
    });

    const second = insertManagedFileBanner(first, {
      ext: "@acme/rules/review",
      source: {
        kind: "acquired",
        path: "agent_extensions/agentxm/@acme/rules/review/src/review.md",
      },
      helpTopic: "rules",
      format: "markdown",
    });

    expect(second).toBe(first);
  });

  it("does not claim prose and still inserts a structured marker", () => {
    const prose = "This document explains how an AXM managed file behaves.";
    expect(hasManagedFileBanner(prose)).toBe(false);
    expect(
      insertManagedFileBanner(prose, {
        ext: "@acme/rules/review",
        source: {
          kind: "acquired",
          path: "agent_extensions/agentxm/@acme/rules/review/src/review.md",
        },
        helpTopic: "rules",
        format: "markdown",
      }),
    ).toContain("axm:file v=1");
  });

  it("recognizes ownership independently of human banner prose", () => {
    const content = `<!-- axm:file v=1 ext=@acme/rules/review src=source.md
     Completely different guidance. -->

# Review\n`;
    expect(hasManagedFileBanner(content)).toBe(true);
    expect(stripManagedFileBanner(content, "markdown")).toBe("# Review\n");
  });

  it("strips an existing markdown banner", () => {
    const content = insertManagedFileBanner("# Workspace\n", {
      ext: "@agentxm/rules/managed-file",
      source: { kind: "workspace-config", path: "AGENTS.md" },
      helpTopic: "instructions",
      format: "markdown",
    });

    expect(stripManagedFileBanner(content, "markdown")).toBe("# Workspace\n");
  });

  it.each(["\n", "\r\n"])("strips markdown and TOML banners under %j", (eol) => {
    const markdown = insertManagedFileBanner("---\nname: review\n---\n# Body\n", {
      ext: "@acme/rules/review",
      source: { kind: "workspace-authored", path: "source.md" },
      helpTopic: "rules",
      format: "markdown",
    }).replaceAll("\n", eol);
    expect(stripManagedFileBanner(markdown, "markdown")).toBe(
      `---${eol}name: review${eol}---${eol}# Body${eol}`,
    );

    const tomlBody = 'prompt = "Review"\n';
    const toml = insertManagedFileBanner(tomlBody, {
      ext: "@agentxm/subagents/managed-file",
      source: { kind: "bundled", path: "source.md" },
      helpTopic: "rules",
      format: "toml",
    }).replaceAll("\n", eol);
    expect(stripManagedFileBanner(toml, "toml")).toBe(tomlBody.replaceAll("\n", eol));
  });
});
