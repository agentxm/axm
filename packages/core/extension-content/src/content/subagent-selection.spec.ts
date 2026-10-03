import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  readSubagentPackage,
  selectSubagentImplementation,
  SubagentContentError,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "subagents/selection-keeps-native-implementations-independent",
  title:
    "Subagent selection composes only explicit customization and keeps native definitions complete",
  statement:
    "AXM shall select a target's complete native implementation without merging the portable core, otherwise apply only its explicit instruction append or replacement and native configuration to the core, report unsupported when neither exists, and identify only the selected implementation's compile-time dependencies.",
  class: "functional",
  role: "interface",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const native =
  'name = "codex-review"\ndescription = "Native description"\ndeveloper_instructions = "Native instructions"\nmodel = "native-model"\n';
const files: Readonly<Record<string, string>> = {
  "prompts/core.md": "Portable instructions.\n",
  "prompts/claude.md": "Claude instructions.\n",
  "prompts/cursor.md": "Cursor replacement.\n",
  "native/codex.toml": native,
};
const readFile = (source: string) => {
  const content = files[source];
  return content === undefined
    ? Effect.fail(
        new SubagentContentError({
          reason: "reference-invalid",
          source,
          detail: `Missing ${source}`,
        }),
      )
    : Effect.succeed(content);
};
const identity = { owner: "@acme", type: "subagent", name: "review", version: "1.0.0" };

it.effect("selects native, customized, and portable implementations independently", () =>
  Effect.gen(function* () {
    const pkg = yield* readSubagentPackage({
      manifest: {
        ...identity,
        description: "Portable description",
        core: { name: "portable-review", instructions: "prompts/core.md" },
        implementations: {
          codex: { kind: "native", source: "native/codex.toml" },
          "claude-code": {
            kind: "customized",
            configuration: { model: "opus", disallowedTools: ["Write"] },
            instructions: { mode: "append", source: "prompts/claude.md" },
          },
          cursor: {
            kind: "customized",
            instructions: { mode: "replace", source: "prompts/cursor.md" },
          },
        },
      },
      readFile,
    });
    expect(selectSubagentImplementation(pkg, "codex")).toMatchObject({
      kind: "native",
      native: { content: native, name: "codex-review", instructions: "Native instructions" },
      sourceDependencies: ["subagent.json", "native/codex.toml"],
    });
    expect(selectSubagentImplementation(pkg, "claude-code")).toEqual({
      kind: "customized",
      name: "portable-review",
      description: "Portable description",
      instructions: "Portable instructions.\n\n\nClaude instructions.\n",
      configuration: { model: "opus", disallowedTools: ["Write"] },
      sourceDependencies: ["subagent.json", "prompts/core.md", "prompts/claude.md"],
    });
    expect(selectSubagentImplementation(pkg, "cursor")).toMatchObject({
      kind: "customized",
      instructions: "Cursor replacement.\n",
      sourceDependencies: ["subagent.json", "prompts/cursor.md"],
    });
    expect(selectSubagentImplementation(pkg, "gemini-cli")).toMatchObject({
      kind: "core",
      instructions: "Portable instructions.\n",
      configuration: {},
      sourceDependencies: ["subagent.json", "prompts/core.md"],
    });
  }),
);

it.effect("reports a missing native-only target without borrowing another host's definition", () =>
  Effect.gen(function* () {
    const pkg = yield* readSubagentPackage({
      manifest: {
        ...identity,
        implementations: { codex: { kind: "native", source: "native/codex.toml" } },
      },
      readFile,
    });
    expect(selectSubagentImplementation(pkg, "claude-code")).toMatchObject({
      kind: "unsupported",
      sourceDependencies: ["subagent.json"],
    });
  }),
);
