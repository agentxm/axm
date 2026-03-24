// ==========================================================================
// list.ts — Reference pattern for INSTANT commands using Output service
//
// Demonstrates the idiomatic command structure with @axm.sh/core services:
//   1. Output schema — defines the JSON contract (with _version)
//   2. Text renderer — pure function for human-readable output
//   3. Command handler — uses Output.result() via withRuntime()
//
// The key improvement over manual format branching: the handler doesn't
// know or care about the output format. Output.result() handles text/json/
// stream-json routing transparently based on which layer was provided.
// ==========================================================================
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { Output } from "@axm.sh/core/unstable/output";
import { FakeSkillInfoSchema, FakeSkillsManager } from "../../fake-skills-manager.js";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Output schema — the JSON contract for `skills list`
//
// Every JSON output includes _version: 1 for forward-compatible schema
// evolution. When we make breaking changes, we bump _version and consumers
// can branch on it. Additive changes (new fields) don't bump the version.
//
// Schema.NullOr(Schema.String) for version means the field is ALWAYS present
// in JSON output — it's either a string or null, never omitted. This gives
// consumers a stable shape to destructure without checking for missing keys.
// Compare: { version?: string } would omit the key entirely, forcing
// consumers to check `"version" in obj` before accessing it.
// ---------------------------------------------------------------------------

export const SkillListOutputSchema = Schema.Array(FakeSkillInfoSchema);
export type SkillListOutput = typeof SkillListOutputSchema.Type;

// ---------------------------------------------------------------------------
// Text renderer — human-friendly table for TTY output
//
// Text rendering is a pure function (data → string) separated from the
// handler for testability. The same data flows through both paths: text
// mode calls renderText(), json/stream-json mode calls Schema.encodeSync().
// This ensures text and JSON output always represent the same data.
// ---------------------------------------------------------------------------

const renderText = (skills: SkillListOutput): string => {
  if (skills.length === 0) return "No skills installed.";

  const header = `${"Name".padEnd(16)} ${"Source".padEnd(16)} ${"Version".padEnd(10)} ${"Enabled".padEnd(8)} Scope`;
  const separator = "\u2500".repeat(header.length);
  const rows = skills.map(
    (s) =>
      `${s.name.padEnd(16)} ${s.source.padEnd(16)} ${(s.version ?? "\u2014").padEnd(10)} ${(s.enabled ? "yes" : "no").padEnd(8)} ${s.scope}`,
  );
  return [header, separator, ...rows].join("\n");
};

// ---------------------------------------------------------------------------
// Command
//
// The handler is now format-agnostic:
//   1. withRuntime() resolves format and provides Output + Activity services
//   2. yield* Output to get the service
//   3. yield* output.result(schema, data, renderText) to emit output
//
// No more: const format = resolveOutputFormat(yield* outputFormatFlag)
// No more: yield* writeOutput(format, schema, data, renderText)
// ---------------------------------------------------------------------------

export const listCommand = Command.make(
  "list",
  {
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
  },
  (config) =>
    withRuntime(
      Effect.gen(function* () {
        const output = yield* Output;
        const fakeSkillsManager = yield* FakeSkillsManager;
        const skills = yield* fakeSkillsManager.listSkills(config.scope);
        yield* output.result(SkillListOutputSchema, skills, renderText);
      }),
      { command: "skills list" },
    ),
).pipe(
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List all installed skills" },
    { command: "axm-spike skills list --scope user", description: "List user-scope skills" },
    {
      command: "axm-spike skills list --agent claude-code",
      description: "List skills for an agent",
    },
    {
      command: "axm-spike skills list --output-format json",
      description: "List skills as JSON (for piping)",
    },
  ]),
);
