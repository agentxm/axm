import { describe, expect, it } from "vitest";
import {
  selectRenderer,
  renderMarkdownWithFrontmatter,
  renderMarkdownOnly,
  renderToml,
  renderPlainText,
} from "./index.js";

describe("selectRenderer", () => {
  it("selects markdown+frontmatter for claude-code", () => {
    expect(selectRenderer("claude-code")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for codex", () => {
    expect(selectRenderer("codex")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for opencode", () => {
    expect(selectRenderer("opencode")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for augment", () => {
    expect(selectRenderer("augment")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for junie", () => {
    expect(selectRenderer("junie")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for kilo", () => {
    expect(selectRenderer("kilo")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown+frontmatter for roo", () => {
    expect(selectRenderer("roo")).toBe(renderMarkdownWithFrontmatter);
  });

  it("selects markdown-only for cursor", () => {
    expect(selectRenderer("cursor")).toBe(renderMarkdownOnly);
  });

  it("does not select a command renderer for github-copilot-cli", () => {
    expect(selectRenderer("github-copilot-cli")).toBeUndefined();
  });

  it("selects toml for gemini-cli", () => {
    expect(selectRenderer("gemini-cli")).toBe(renderToml);
  });

  it("selects plain-text for kiro-cli", () => {
    expect(selectRenderer("kiro-cli")).toBe(renderPlainText);
  });

  it("returns undefined for unsupported agents", () => {
    expect(selectRenderer("unknown-agent")).toBeUndefined();
  });
});
