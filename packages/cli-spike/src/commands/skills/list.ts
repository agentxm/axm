// ==========================================================================
// list.ts — Reference pattern for INSTANT commands using CliRenderer
//
// Demonstrates the idiomatic command structure with @axm.sh/core services:
//   1. Fetch data via services
//   2. Format and emit output via CliRenderer service
//   3. withRuntime() provides CliRenderer + CliPrompt layers
// ==========================================================================
import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { type FakeSkillInfo, FakeSkillsManager } from "../../fake-skills-manager.js";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Text renderer — human-friendly table for TTY output
//
// Uses renderer.raw() intentionally to demonstrate the escape hatch for
// custom-formatted output. See CliRenderer.table() for the canonical
// column-based data display pattern.
// ---------------------------------------------------------------------------

const renderText = (skills: ReadonlyArray<FakeSkillInfo>): string => {
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
// ---------------------------------------------------------------------------

const listConfig = {
  scope: Flag.choice("scope", ["project", "user"] as const).pipe(
    Flag.withDescription("Configuration scope"),
    Flag.withDefault("project" as const),
  ),
  agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
} as const;

export const listCommand = Command.make("list", listConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const fakeSkillsManager = yield* FakeSkillsManager;
      const skills = yield* fakeSkillsManager.listSkills(config.scope);
      yield* renderer.raw(renderText(skills));
    }),
    { command: "skills list" },
  ),
).pipe(
  withArgvTracking(listConfig),
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List all installed skills" },
    { command: "axm-spike skills list --scope user", description: "List user-scope skills" },
    {
      command: "axm-spike skills list --agent claude-code",
      description: "List skills for an agent",
    },
  ]),
);
