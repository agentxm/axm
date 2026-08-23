import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import { parseSkillMd } from "@agentxm/client-core/unstable/skills";

const packageRoot = "../../.axm/extensions/@agentxm/skills/axm";
const skillMd = readFileSync(`${packageRoot}/src/SKILL.md`, "utf8");
const manifest = JSON.parse(readFileSync(`${packageRoot}/skill.json`, "utf8"));

const requireString = (record: unknown, key: string): string => {
  if (typeof record !== "object" || record === null) throw new Error("Expected an object");
  const value = Reflect.get(record, key);
  if (typeof value !== "string") throw new Error(`Expected ${key} to be a string`);
  return value;
};

const requireStringArray = (record: unknown, key: string): ReadonlyArray<string> => {
  if (typeof record !== "object" || record === null) throw new Error("Expected an object");
  const value: unknown = Reflect.get(record, key);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Expected ${key} to be an array of strings`);
  }
  return value;
};

describe("official AXM skill contract", () => {
  it("routes the complete lifecycle vocabulary and all supported extension types", () => {
    const parsed = Option.getOrThrow(parseSkillMd(skillMd, "axm"));

    for (const operation of [
      "discover",
      "find",
      "inspect",
      "create",
      "scaffold",
      "import",
      "fork",
      "adopt",
      "install",
      "add",
      "configure",
      "edit",
      "update",
      "upgrade",
      "enable",
      "disable",
      "sync",
      "lint",
      "validate",
      "package",
      "bundle",
      "version",
      "publish",
      "deprecate",
      "yank",
      "uninstall",
      "remove",
      "delete",
    ]) {
      expect(parsed.description).toContain(operation);
    }

    for (const extensionType of [
      "skills or SKILL.md",
      "subagents or agent definitions",
      "MCP server configurations",
      "rules or instructions",
      "hooks",
      "Knowledge bundles",
      "packs",
    ]) {
      expect(parsed.description).toContain(extensionType);
    }

    expect(parsed.description).toContain("Not for implementing or debugging MCP server software");
    expect(parsed.description).toContain("merely using an installed extension");
  });

  it("keeps live CLI details out of the compact control plane", () => {
    expect(skillMd).not.toContain("Execute `!axm help` now");
    expect(skillMd).not.toContain("## Quick Reference");
    expect(skillMd).not.toContain("--sandbox workspace-write");
    expect(skillMd).not.toContain("AXM_TOKEN_FILE");
    expect(skillMd).not.toContain("result.axmSkillCompatibility from");
    expect(skillMd).toMatch(/Live help is\s+authoritative/);
  });

  it("ships complete human-facing discovery and license metadata", () => {
    expect(requireString(manifest, "description")).toContain("Broad, bounded extension management");
    expect(requireStringArray(manifest, "keywords")).toEqual(
      expect.arrayContaining(["agent-extensions", "skills", "subagents", "mcp", "packs"]),
    );
    expect(requireString(manifest, "homepage")).toBe("https://axm.sh");
    expect(requireString(manifest, "license")).toBe("FSL-1.1-MIT");

    const repository: unknown = Reflect.get(manifest, "repository");
    expect(requireString(repository, "url")).toBe("https://github.com/agentxm/axm");
    expect(requireString(repository, "directory")).toBe(".axm/extensions/@agentxm/skills/axm");
    expect(readFileSync(`${packageRoot}/README.md`, "utf8")).toContain("## Install");
    expect(readFileSync(`${packageRoot}/LICENSE`, "utf8")).toContain(
      "https://github.com/agentxm/axm/blob/main/LICENSE",
    );
  });

  it("keeps routing and activated-execution evaluation source outside runtime src", () => {
    const suite: unknown = JSON.parse(readFileSync(`${packageRoot}/evals/evals.json`, "utf8"));
    if (typeof suite !== "object" || suite === null) throw new Error("Expected evaluation suite");
    const cases: unknown = Reflect.get(suite, "evals");
    if (!Array.isArray(cases)) throw new Error("Expected evaluation cases");

    const stages = cases.map((item) => requireString(item, "stage"));
    expect(stages.filter((stage) => stage === "routing")).toHaveLength(30);
    expect(stages.filter((stage) => stage === "execution")).toHaveLength(31);
    expect(skillMd).not.toContain("evaluation-contract.json");
  });
});
