import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { extractSkillMetadata, validateSkillFrontmatter } from "../index.js";

export const specification = defineSpecification({
  requirement: "skills/acquisition/external-metadata-is-descriptive",
  title: "External skill metadata describes content without gating acquisition",
  statement:
    "When reading externally distributed SKILL.md content, AXM shall extract available display metadata without rejecting additional fields, nonstandard names or metadata values, and shall leave unavailable metadata absent without altering the source content or applying authoring conformance checks.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("External skill metadata", () => {
  it("preserves vendor fields, display names and structured metadata", () => {
    const content = [
      "---",
      "name: Poteto Mode",
      "description: Review --- including release notes",
      "disable-model-invocation: true",
      "argument-hint: '[topic]'",
      "hidden: true",
      "metadata:",
      "  revision: 3",
      "  tags: [review, release]",
      "---",
      "# Run the upstream instructions unchanged.",
    ].join("\n");
    const before = content;
    const extracted = extractSkillMetadata(content);
    expect(extracted).toEqual({
      name: "Poteto Mode",
      description: "Review --- including release notes",
      metadata: { revision: 3, tags: ["review", "release"] },
      frontmatter: {
        name: "Poteto Mode",
        description: "Review --- including release notes",
        "disable-model-invocation": true,
        "argument-hint": "[topic]",
        hidden: true,
        metadata: { revision: 3, tags: ["review", "release"] },
      },
    });
    expect(content).toBe(before);
    expect(validateSkillFrontmatter(extracted.frontmatter, "poteto-mode").valid).toBe(false);
  });

  it.each([
    ["no frontmatter", "# An upstream skill", {}],
    ["missing description", "---\nname: Display Name\n---\n", { name: "Display Name" }],
    ["missing name", "---\ndescription: Use this skill\n---\n", { description: "Use this skill" }],
    ["malformed YAML", "---\nname: [broken\n---\n", {}],
    ["scalar frontmatter", "---\nplain text\n---\n", {}],
    ["non-string name", "---\nname: 42\n---\n", {}],
    ["byte order mark", "\uFEFF---\nname: Display Name\n---\n", { name: "Display Name" }],
  ])("extracts whatever is available with %s", (_condition, content, expected) => {
    expect(extractSkillMetadata(content)).toMatchObject(expected);
  });

  it("does not normalize declared names or enforce authoring length limits", () => {
    const name = "Cafe\u0301 Review";
    const description = "Long description. ".repeat(200);
    expect(
      extractSkillMetadata(`---\nname: ${name}\ndescription: ${description}\n---\n`),
    ).toMatchObject({
      name,
      description: description.trimEnd(),
    });
  });
});
