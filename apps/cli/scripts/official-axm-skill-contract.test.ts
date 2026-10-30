import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";

import { parseSkillMd } from "@agentxm/extension-content";
import { AXM_SKILL_MD } from "../src/__generated__/bundled-axm-skill.js";

const packageRoot = "../../skills/axm";
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
  it("bundles the canonical, parseable skill entrypoint", () => {
    expect(AXM_SKILL_MD).toBe(skillMd);
    const parsed = Option.getOrThrow(parseSkillMd(AXM_SKILL_MD, "axm"));
    expect(parsed.description.length).toBeGreaterThan(0);
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
    expect(requireString(repository, "directory")).toBe("skills/axm");
    expect(readFileSync(`${packageRoot}/README.md`, "utf8")).toContain("## Install");
    expect(readFileSync(`${packageRoot}/LICENSE`, "utf8")).toContain(
      "https://github.com/agentxm/axm/blob/main/LICENSE",
    );
  });
});
