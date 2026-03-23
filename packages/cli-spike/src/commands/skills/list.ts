import * as Schema from "effect/Schema"
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { outputFormatFlag } from "../../main.js";
import { resolveOutputFormat, writeOutput } from "../../output.js";

// ---------------------------------------------------------------------------
// Output schema — the JSON contract for `skills list`
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
