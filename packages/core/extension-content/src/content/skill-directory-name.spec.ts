import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { extractSkillMetadata, skillDirectoryName } from "../index.js";

export const specification = defineSpecification({
  requirement: "skills/identity/content-names-native-directories",
  title: "Skill content names its native directory independently of package identity",
  statement:
    "AXM shall use a skill's declared name unchanged as its native directory name when it is a safe portable path component, otherwise use the selected source or package identity as a stable safe fallback, without rewriting skill content or deriving the name from an envelope's src directory.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "extension-adoption"],
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Skill directory identity", () => {
  it.each(["con", "aux", "nul", "com1", "lpt9"])(
    "makes reserved package fallback %s portable",
    (name) => {
      expect(skillDirectoryName(undefined, name)).toBe(`skill-${name}`);
      expect(skillDirectoryName(name, name)).toBe(`skill-${name}`);
    },
  );

  it.each(["review", "Review", "café-review", "review_tools", "review.v2"])(
    "preserves the usable declaration %s despite a different package name",
    (name) => {
      const content = `---\nname: ${name}\nvendor: { enabled: true }\n---\n# Instructions\n`;
      expect(skillDirectoryName(extractSkillMetadata(content).name, "review-package")).toBe(name);
    },
  );

  it.each([
    undefined,
    "",
    ".",
    "..",
    "../outside",
    "a/b",
    "a\\b",
    "C:review",
    "review.",
    " review",
    "review ",
    "NUL",
    "con.txt",
    "x\u0000y",
    "x".repeat(256),
  ])("falls back for an unusable declaration %s", (name) =>
    expect(skillDirectoryName(name, "review-package")).toBe("review-package"),
  );

  it.each(["# Plain instructions\n", "---\nname: [unfinished\n---\n"])(
    "uses package identity for missing descriptive metadata",
    (content) =>
      expect(skillDirectoryName(extractSkillMetadata(content).name, "review-package")).toBe(
        "review-package",
      ),
  );
});
