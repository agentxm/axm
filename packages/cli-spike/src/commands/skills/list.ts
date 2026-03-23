// ==========================================================================
// list.ts — Reference pattern for INSTANT commands with structured output
//
// This file demonstrates the standard command structure:
//   1. Output schema — defines the JSON contract (with _version)
//   2. Text renderer — pure function for human-readable output
//   3. Command handler — resolves format, does work, writes output
//   4. Command definition — args, flags, description, examples
//
// "Instant" means the command completes quickly and emits a single result.
// Compare with install.ts which demonstrates long-running commands with
// NDJSON streaming progress events.
//
// Handler pattern (3 steps, same for every command):
//   1. const format = resolveOutputFormat(yield* outputFormatFlag)
//   2. const data = yield* doWork(config)
//   3. yield* writeOutput(format, schema, data, renderText)
// ==========================================================================
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { outputFormatFlag } from "../../main.js";
import { resolveOutputFormat, writeOutput } from "../../output.js";

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

export const SkillInfoSchema = Schema.Struct({
  _version: Schema.Literal(1),
  name: Schema.String,
  source: Schema.String,
  version: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  scope: Schema.Literals(["project", "user"] as const),
});
export type SkillInfo = typeof SkillInfoSchema.Type;

export const SkillListOutputSchema = Schema.Array(SkillInfoSchema);
export type SkillListOutput = typeof SkillListOutputSchema.Type;

// ---------------------------------------------------------------------------
// Mock data — demonstrates consistent JSON shape with _version and null fields
// ---------------------------------------------------------------------------

const MOCK_SKILLS: ReadonlyArray<SkillInfo> = [
  {
    _version: 1,
    name: "pr-review",
    source: "acme/tools",
    version: "1.2.0",
    enabled: true,
    scope: "project",
  },
  {
    _version: 1,
    name: "test-gen",
    source: "acme/tools",
    version: "1.0.3",
    enabled: true,
    scope: "project",
  },
  { _version: 1, name: "my-custom", source: "local", version: null, enabled: false, scope: "user" },
];

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
  const separator = "─".repeat(header.length);
  const rows = skills.map(
    (s) =>
      `${s.name.padEnd(16)} ${s.source.padEnd(16)} ${(s.version ?? "—").padEnd(10)} ${(s.enabled ? "yes" : "no").padEnd(8)} ${s.scope}`,
  );
  return [header, separator, ...rows].join("\n");
};

// ---------------------------------------------------------------------------
// Command
//
// The handler follows the standard 3-step pattern:
//   1. Resolve output format (yield global flag → detect TTY)
//   2. Do work (here: filter mock data; real impl would query workspace)
//   3. Write output (format-aware: text table, JSON array, or NDJSON result)
//
// Note: resolveOutputFormat(explicit) without isLongRunning=true means
// piped output defaults to "json" (single array), not "stream-json".
// This is correct for instant commands that return a complete result.
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
    Effect.gen(function* () {
      const explicitFormat = yield* outputFormatFlag;
      const format = resolveOutputFormat(explicitFormat);

      // Filter mock data by scope
      const filtered = MOCK_SKILLS.filter((s) => s.scope === config.scope);

      yield* writeOutput(format, SkillListOutputSchema, filtered, renderText);
    }),
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
