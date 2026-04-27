/**
 * Subagent subject module tests.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedSettings } from "../../__fixtures__/decoders.js";
import { makeAgentDirOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeSubagentExtensionsApi } from "../../extensions/subagent.js";
import type { AgentDirOccurrence, CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";

const settingsWithSubagents = (
  subagents: Record<string, { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ subagents }).pipe(Effect.orDie);

const harness = (params: {
  readonly settings?: Settings;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly agentDirOccurrences?: ReadonlyArray<AgentDirOccurrence>;
  readonly ignoredNames?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    return yield* makeSubagentExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.none()),
      },
      scanners: {
        canonical: Effect.succeed(params.canonicalOccurrences ?? []),
        agentDir: Effect.succeed(params.agentDirOccurrences ?? []),
      },
      installedPacks: Effect.succeed([]),
      ignoredNames: new Set(params.ignoredNames ?? []),
      diagnostics,
    });
  });

describe("makeSubagentExtensionsApi", () => {
  it.effect("declared parses subagents from settings", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithSubagents({
        "code-reviewer": { source: "github:owner/cr", enabled: true },
      });
      const api = yield* harness({ settings });
      const declared = yield* api.declared;
      const arr = Option.match(declared, { onNone: () => [], onSome: (d) => d });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("code-reviewer");
    }),
  );

  it.effect("actual composes canonical + agent-dir subagent occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "subagent",
            agentId: "claude-code",
            name: "code-reviewer",
            contentLocation: "/ws/.claude/agents/code-reviewer",
          }),
          makeAgentDirOccurrence({
            scope: "project",
            type: "subagent",
            agentId: "roo",
            name: ".roomodes",
            contentLocation: "/ws/.roomodes",
            singleFile: true,
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(2);
    }),
  );

  it.effect("disabled-direct still claims actual and excludes from active", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithSubagents({
        "code-reviewer": { source: "github:owner/cr", enabled: false },
      });
      const api = yield* harness({
        settings,
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "subagent",
            agentId: "claude-code",
            name: "code-reviewer",
            contentLocation: "/ws/.claude/agents/code-reviewer",
          }),
        ],
      });
      const installed = yield* api.installed;
      const active = yield* api.active;
      const unmanaged = yield* api.unmanaged;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.activation).toBe("disabled");
      expect(installed[0]?.actual).toHaveLength(1);
      expect(active).toHaveLength(0);
      expect(unmanaged).toHaveLength(0);
    }),
  );
});
