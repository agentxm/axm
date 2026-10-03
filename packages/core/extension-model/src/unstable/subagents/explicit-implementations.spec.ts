import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SubagentManifestSchema } from "./manifest-schema.js";

export const specification = defineSpecification({
  requirement: "subagents/packages-declare-explicit-implementations",
  title: "Subagent packages declare a portable core or complete native implementations",
  statement:
    "A subagent package shall declare a described portable core or at least one complete native implementation, permit customization only with a core, identify implementations by canonical agent identity, and reject obsolete fallback and override contracts, reserved customization fields, and unsafe compile-time source paths.",
  class: "functional",
  role: "interface",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const identity = { owner: "@acme", type: "subagent", name: "reviewer", version: "1.0.0" };
const core = { instructions: "prompts/core.md", name: "native-reviewer" };
const decode = Schema.decodeUnknownSync(SubagentManifestSchema, { onExcessProperty: "error" });

describe("explicit subagent package implementations", () => {
  it("accepts a native-only package and retains separate native and package names", () => {
    const native = decode({
      ...identity,
      implementations: { codex: { kind: "native", source: "native/review.toml" } },
    });
    expect(native.core).toBeUndefined();
    const portable = decode({ ...identity, description: "Reviews code", core });
    expect(portable.name).toBe("reviewer");
    expect(portable.core?.name).toBe("native-reviewer");
  });

  it("retains opaque native configuration without translating tool or model semantics", () => {
    const configuration = {
      model: "host-specific-model",
      tools: ["Read"],
      vendor: { behavior: [1, true, null] },
    };
    const result = decode({
      ...identity,
      description: "Reviews code",
      core,
      implementations: {
        "claude-code": {
          kind: "customized",
          configuration,
          instructions: { mode: "append", source: "prompts/claude.md" },
        },
      },
    });
    expect(result.implementations?.["claude-code"]).toMatchObject({ configuration });
  });

  it.each([
    ["empty package", {}],
    ["empty implementation map", { implementations: {} }],
    ["undescribed core", { core }],
    ["blank core description", { core, description: "  " }],
    ["customization without core", { implementations: { codex: { kind: "customized" } } }],
    [
      "unknown agent identity",
      { implementations: { typo: { kind: "native", source: "native/a.md" } } },
    ],
    [
      "mixed native and customized fields",
      {
        implementations: { codex: { kind: "native", source: "native/a.toml", configuration: {} } },
      },
    ],
    ["implicit override", { description: "Reviews code", core, agentOverrides: {} }],
    ["role fallback", { description: "Reviews code", core, fallback: "auto" }],
  ])("rejects %s", (_label, fields) => {
    expect(() => decode({ ...identity, ...fields })).toThrow();
  });

  it.each([
    "name",
    "description",
    "instructions",
    "developer_instructions",
    "prompt",
    "systemPrompt",
    "agentOverrides",
    "fallback",
    "constructor",
    "__proto__",
  ])("rejects reserved customization key %s", (key) => {
    expect(() =>
      decode({
        ...identity,
        description: "Reviews code",
        core,
        implementations: { codex: { kind: "customized", configuration: { [key]: "override" } } },
      }),
    ).toThrow();
  });

  it.each([
    "",
    "/tmp/a.md",
    "../a.md",
    "src/../../a.md",
    "src/./a.md",
    "src//a.md",
    "src/",
    "C:/a.md",
    "src\\a.md",
    "https://example.test/a.md",
    "src/\u0000.md",
  ])("rejects unsafe source %j", (source) => {
    expect(() =>
      decode({ ...identity, description: "Reviews code", core: { instructions: source } }),
    ).toThrow();
    expect(() =>
      decode({ ...identity, implementations: { codex: { kind: "native", source } } }),
    ).toThrow();
  });
});
