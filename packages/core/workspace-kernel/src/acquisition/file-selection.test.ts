import { describe, expect, it } from "@effect/vitest";
import { resolveFileSelection, type FileSelectionInput } from "./index.js";

const selection = (input: Partial<FileSelectionInput> = {}) =>
  resolveFileSelection({
    packageDirectory: "",
    gitignore: [],
    manifest: "skill.json",
    ...input,
  });

describe("distribution file selection", () => {
  it("uses case-sensitive Git patterns, anchoring, dotfiles and directory kinds", () => {
    const policy = selection({
      exclude: ["**/*.json", "/README.md", "docs/", "?.map", "[ab].txt"],
    });
    for (const path of [
      "config.json",
      "deep/config.json",
      "README.md",
      "docs/note",
      ".hidden.json",
      "x.map",
      "a.txt",
    ])
      expect(policy.evaluate({ path, kind: "file" }).included, path).toBe(false);
    for (const path of ["readme.md", "nested/README.md", "docs", "xx.map", "c.txt"])
      expect(policy.evaluate({ path, kind: "file" }).included, path).toBe(true);
    expect(policy.evaluate({ path: "docs", kind: "symlink" }).included).toBe(true);
    expect(policy.evaluate({ path: "docs", kind: "directory" }).included).toBe(false);
  });

  it("preserves escaped special characters and ignores comments", () => {
    const policy = selection({ exclude: ["# comment", "\\#tag", "\\!important", "space\\ "] });
    for (const path of ["#tag", "!important", "space "])
      expect(policy.evaluate({ path, kind: "file" }).included).toBe(false);
    for (const path of ["# comment", "important", "space"])
      expect(policy.evaluate({ path, kind: "file" }).included).toBe(true);
  });

  it("distinguishes omitted, empty and publish-all includes", () => {
    const gitignore = [
      {
        pattern: "dist/",
        baseDirectory: "",
        origin: { kind: "gitignore", file: ".gitignore", line: 1 },
      },
    ] as const;
    expect(selection({ gitignore }).evaluate({ path: "dist/code.js", kind: "file" }).included).toBe(
      false,
    );
    expect(
      selection({ gitignore, include: [] }).evaluate({ path: "src/SKILL.md", kind: "file" })
        .included,
    ).toBe(false);
    expect(
      selection({ gitignore, include: [] }).evaluate({ path: "skill.json", kind: "file" }).included,
    ).toBe(true);
    expect(
      selection({ gitignore, include: ["**"] }).evaluate({ path: "dist/code.js", kind: "file" })
        .included,
    ).toBe(true);
    expect(selection({ include: ["**"] }).evaluate({ path: ".git", kind: "file" }).included).toBe(
      false,
    );
    expect(
      selection({ include: ["**"] }).evaluate({ path: ".git/objects/blob", kind: "file" }).included,
    ).toBe(false);
  });

  it("applies ordered exceptions with excluded-parent semantics", () => {
    expect(
      selection({ exclude: ["*.md", "!README.md"] }).evaluate({ path: "README.md", kind: "file" })
        .included,
    ).toBe(true);
    expect(
      selection({ exclude: ["docs/", "!docs/README.md"] }).evaluate({
        path: "docs/README.md",
        kind: "file",
      }).included,
    ).toBe(false);
    expect(
      selection({ exclude: ["docs/", "!docs/", "docs/*", "!docs/README.md"] }).evaluate({
        path: "docs/README.md",
        kind: "file",
      }).included,
    ).toBe(true);
    expect(
      selection({ include: ["/src/", "!*.test.ts"] }).evaluate({
        path: "src/a.test.ts",
        kind: "file",
      }).included,
    ).toBe(false);
    expect(
      selection({ include: ["/src/", "!*.test.ts"] }).evaluate({ path: "src/a.ts", kind: "file" })
        .included,
    ).toBe(true);
  });

  it("preserves rule bases and line provenance for nested overrides", () => {
    const policy = selection({
      packageDirectory: "skills/review",
      gitignore: [
        {
          pattern: "*.log",
          baseDirectory: "",
          origin: { kind: "gitignore", file: ".gitignore", line: 3 },
        },
        {
          pattern: "!keep.log",
          baseDirectory: "skills/review/src",
          origin: { kind: "gitignore", file: "skills/review/src/.gitignore", line: 2 },
        },
      ],
    });
    expect(policy.evaluate({ path: "src/keep.log", kind: "file" }).included).toBe(true);
    expect(policy.evaluate({ path: "keep.log", kind: "file" }).decidingRule?.origin).toEqual({
      kind: "gitignore",
      file: ".gitignore",
      line: 3,
    });
  });

  it("keeps a package excluded when a repository ancestor is excluded", () => {
    const policy = selection({
      packageDirectory: "skills/review",
      gitignore: [
        {
          pattern: "skills/",
          baseDirectory: "",
          origin: { kind: "gitignore", file: ".gitignore", line: 1 },
        },
        {
          pattern: "!keep.log",
          baseDirectory: "skills/review",
          origin: { kind: "gitignore", file: "skills/review/.gitignore", line: 1 },
        },
      ],
    });
    expect(policy.evaluate({ path: "keep.log", kind: "file" }).included).toBe(false);
  });
});
