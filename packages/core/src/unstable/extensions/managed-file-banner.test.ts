import { describe, expect, it } from "@effect/vitest";
import {
  insertManagedFileBanner,
  managedFileFormatForPath,
  stripManagedFileBanner,
} from "./managed-file-banner.js";

describe("managedFileFormatForPath", () => {
  it("detects markdown and TOML commentable files", () => {
    expect(managedFileFormatForPath(".claude/commands/review.md")).toBe("markdown");
    expect(managedFileFormatForPath(".github/prompts/review.prompt.md")).toBe("markdown");
    expect(managedFileFormatForPath(".gemini/commands/review.toml")).toBe("toml");
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
      editPath: ".axm/extensions/@acme/subagents/reviewer/src/reviewer.md",
      helpTopic: "subagents",
      format: "markdown",
    });

    expect(result).toBe(`---
name: reviewer
---
<!-- AXM managed file — do not edit directly, instead:
     1. Edit: .axm/extensions/@acme/subagents/reviewer/src/reviewer.md
     2. Sync: \`axm sync\`
     Learn more: \`axm help subagents\` -->


Review code.`);
  });

  it("inserts markdown banner at the top without frontmatter", () => {
    const result = insertManagedFileBanner("Review code.", {
      editPath: ".axm/extensions/@acme/commands/review/src/review.md",
      helpTopic: "commands",
      format: "markdown",
    });

    expect(result).toBe(`<!-- AXM managed file — do not edit directly, instead:
     1. Edit: .axm/extensions/@acme/commands/review/src/review.md
     2. Sync: \`axm sync\`
     Learn more: \`axm help commands\` -->

Review code.`);
  });

  it("prepends TOML banner", () => {
    const result = insertManagedFileBanner('prompt = "Review code."\n', {
      editPath: ".axm/extensions/@acme/commands/review/src/review.md",
      helpTopic: "commands",
      format: "toml",
    });

    expect(result).toBe(`# AXM managed file — do not edit directly, instead:
# 1. Edit: .axm/extensions/@acme/commands/review/src/review.md
# 2. Sync: \`axm sync\`
# Learn more: \`axm help commands\`

prompt = "Review code."
`);
  });

  it("does not duplicate an existing banner", () => {
    const first = insertManagedFileBanner("Review code.", {
      editPath: ".axm/extensions/@acme/commands/review/src/review.md",
      helpTopic: "commands",
      format: "markdown",
    });

    const second = insertManagedFileBanner(first, {
      editPath: ".axm/extensions/@acme/commands/review/src/review.md",
      helpTopic: "commands",
      format: "markdown",
    });

    expect(second).toBe(first);
  });

  it("strips an existing markdown banner", () => {
    const content = insertManagedFileBanner("# Workspace\n", {
      editPath: "AGENTS.md",
      helpTopic: "docs",
      format: "markdown",
    });

    expect(stripManagedFileBanner(content, "markdown")).toBe("# Workspace\n");
  });
});
