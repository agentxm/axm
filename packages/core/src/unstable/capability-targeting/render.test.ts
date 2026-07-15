import { describe, expect, it } from "@effect/vitest";

import { renderCapabilityTargetedMarkdown } from "./render.js";

const codexTarget = {
  agentId: "codex",
  inheritedAgentIds: [],
  capabilities: {
    subagents: ["native", "permissioned"],
    "image-gen": ["native"],
  },
  tokens: {
    "do:ask-structured": "Use the structured input tool, then wait.",
  },
} as const;

describe("renderCapabilityTargetedMarkdown", () => {
  it("returns directive-free markdown byte-for-byte", () => {
    const source = "# Review\r\n\r\nKeep  two spaces.  \r\n";

    expect(renderCapabilityTargetedMarkdown(source, codexTarget)).toEqual({
      content: source,
      didRender: false,
      degraded: false,
      findings: [],
      referencedCapabilities: [],
      referencedConditions: [],
    });
  });

  it("applies the most-specific satisfied replacement and additive enhancements", () => {
    const source = [
      "# Review",
      "",
      '<axm-region id="review">',
      "Review the change directly.",
      "</axm-region>",
      "",
      '<axm-enhance when="subagents" replaces="review">',
      "Delegate the review.",
      "</axm-enhance>",
      "",
      '<axm-enhance when="subagents:permissioned" replaces="review">',
      "Delegate after permission is granted.",
      "</axm-enhance>",
      "",
      '<axm-enhance when="image-gen">',
      "Generate a visual diff.",
      "</axm-enhance>",
      "",
    ].join("\n");

    const rendered = renderCapabilityTargetedMarkdown(source, codexTarget);

    expect(rendered.content).toBe(
      "# Review\n\nDelegate after permission is granted.\n\nGenerate a visual diff.\n",
    );
    expect(rendered.degraded).toBe(false);
    expect(rendered.referencedCapabilities).toEqual(["image-gen", "subagents"]);
    expect(rendered.referencedConditions).toEqual([
      "image-gen",
      "subagents",
      "subagents:permissioned",
    ]);
  });

  it("selects an exact-agent variant before capability variants", () => {
    const source = [
      '<axm-variants id="flow">',
      '<axm-variant when="image-gen:native">',
      "Use native image generation.",
      "</axm-variant>",
      '<axm-variant agent="codex">',
      "Use the Codex-specific flow.",
      "</axm-variant>",
      "<axm-variant>",
      "Describe the image in prose.",
      "</axm-variant>",
      "</axm-variants>",
      "",
    ].join("\n");

    expect(renderCapabilityTargetedMarkdown(source, codexTarget).content).toBe(
      "Use the Codex-specific flow.\n",
    );
  });

  it("uses the mandatory default variant for an empty capability profile", () => {
    const source = [
      "<axm-variants>",
      '<axm-variant when="image-gen">',
      "Generate an image.",
      "</axm-variant>",
      "<axm-variant>",
      "Describe the image.",
      "</axm-variant>",
      "</axm-variants>",
    ].join("\n");

    const rendered = renderCapabilityTargetedMarkdown(source, {
      agentId: "universal",
      inheritedAgentIds: [],
      capabilities: {},
      tokens: {},
    });

    expect(rendered.content).toBe("Describe the image.\n");
  });

  it("leaves directives in fenced code blocks literal", () => {
    const source = [
      "```markdown",
      '<axm-enhance when="subagents">',
      "Literal example",
      "</axm-enhance>",
      "```",
      "",
    ].join("\n");

    expect(renderCapabilityTargetedMarkdown(source, codexTarget)).toEqual({
      content: source,
      didRender: false,
      degraded: false,
      findings: [],
      referencedCapabilities: [],
      referencedConditions: [],
    });
  });

  it("leaves tokens in fenced code blocks literal while resolving prose tokens", () => {
    const source = [
      "Use {{do:ask-structured|ask in chat}}.",
      "",
      "```markdown",
      "{{do:ask-structured|literal example}}",
      "```",
      "",
    ].join("\n");

    expect(renderCapabilityTargetedMarkdown(source, codexTarget).content).toBe(
      [
        "Use Use the structured input tool, then wait..",
        "",
        "```markdown",
        "{{do:ask-structured|literal example}}",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("preserves content but strips semantics for unknown future directives", () => {
    const source = '<axm-future when="subagents">\nKeep this content.\n</axm-future>\n';
    const rendered = renderCapabilityTargetedMarkdown(source, codexTarget);

    expect(rendered.content).toBe("Keep this content.\n");
    expect(rendered.degraded).toBe(true);
    expect(rendered.findings).toContainEqual({
      code: "unknown-directive",
      message: 'unknown directive "axm-future"; preserved its content without targeting',
      structural: true,
    });
  });

  it("resolves fallback tokens across soft prose wraps", () => {
    const source = "Ask with {{do:unknown|ask in plain chat and\nSTOP}}, then wait.\n";

    expect(renderCapabilityTargetedMarkdown(source, codexTarget).content).toBe(
      "Ask with ask in plain chat and STOP, then wait.\n",
    );
  });

  it("falls back to verbatim source when structure is malformed", () => {
    const source = [
      "<axm-variants>",
      '<axm-variant when="image-gen">',
      "Generate an image.",
      "</axm-variant>",
      "</axm-variants>",
      "",
    ].join("\n");

    const rendered = renderCapabilityTargetedMarkdown(source, codexTarget);

    expect(rendered.content).toBe(source);
    expect(rendered.didRender).toBe(false);
    expect(rendered.degraded).toBe(true);
    expect(rendered.findings).toContainEqual({
      code: "missing-default-variant",
      message: "axm-variants requires one bare default axm-variant",
      structural: true,
    });
  });

  it("degrades a missing replacement anchor to additive content", () => {
    const source = [
      '<axm-enhance when="subagents" replaces="missing">',
      "Delegate the review.",
      "</axm-enhance>",
      "",
    ].join("\n");

    const rendered = renderCapabilityTargetedMarkdown(source, codexTarget);

    expect(rendered.content).toBe("Delegate the review.\n");
    expect(rendered.degraded).toBe(true);
    expect(rendered.findings).toContainEqual({
      code: "missing-replacement-region",
      message: 'axm-enhance replaces unknown region "missing"; rendered additively',
      structural: true,
    });
  });

  it("resolves markdown affordance tokens and their baseline fallbacks", () => {
    const source =
      "Ask with {{do:ask-structured|ask in plain chat and STOP}}\nThen {{do:unknown|continue manually}}.\n";

    const enhanced = renderCapabilityTargetedMarkdown(source, codexTarget);
    const baseline = renderCapabilityTargetedMarkdown(source, {
      agentId: "universal",
      inheritedAgentIds: [],
      capabilities: {},
      tokens: {},
    });

    expect(enhanced.content).toBe(
      "Ask with Use the structured input tool, then wait.\nThen continue manually.\n",
    );
    expect(baseline.content).toBe("Ask with ask in plain chat and STOP\nThen continue manually.\n");
  });
});
