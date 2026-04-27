/**
 * Command subject module tests: declared/resolved/actual payloads, scanner
 * composition (canonical + agent-dir), and projections via the shared helper.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedSettings } from "../../__fixtures__/decoders.js";
import { makeAgentDirOccurrence, makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeCommandExtensionsApi } from "../../extensions/command.js";
import type { AgentDirOccurrence, CanonicalExtensionOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";

const settingsWithCommands = (
  commands: Record<string, { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ commands }).pipe(Effect.orDie);

const harness = (params: {
  readonly settings?: Settings;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly agentDirOccurrences?: ReadonlyArray<AgentDirOccurrence>;
  readonly ignoredNames?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    return yield* makeCommandExtensionsApi({
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

describe("makeCommandExtensionsApi", () => {
  it.effect("declared returns Option.none() when settings absent", () =>
    Effect.gen(function* () {
      const api = yield* harness({});
      const declared = yield* api.declared;
      expect(Option.isNone(declared)).toBe(true);
    }),
  );

  it.effect("declared parses commands from settings", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithCommands({
        build: { source: "github:owner/build", enabled: true },
      });
      const api = yield* harness({ settings });
      const declared = yield* api.declared;
      const arr = Option.match(declared, { onNone: () => [], onSome: (d) => d });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("build");
    }),
  );

  it.effect("actual composes canonical + agent-dir command occurrences", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "command",
            origin: "canonical-axm",
            name: "build",
            owner: "@owner",
            contentLocation: "/ws/.axm/extensions/@owner/commands/src/build",
          }),
        ],
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "command",
            agentId: "claude-code",
            name: "build",
            contentLocation: "/ws/.claude/commands/build",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(2);
    }),
  );

  it.effect("active excludes disabled-direct rows", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithCommands({
        build: { source: "github:owner/build", enabled: false },
      });
      const api = yield* harness({ settings });
      const installed = yield* api.installed;
      const active = yield* api.active;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.activation).toBe("disabled");
      expect(active).toHaveLength(0);
    }),
  );

  it.effect("unmanaged surfaces actual-only commands", () =>
    Effect.gen(function* () {
      const api = yield* harness({
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "command",
            agentId: "claude-code",
            name: "legacy",
            contentLocation: "/ws/.claude/commands/legacy",
          }),
        ],
      });
      const unmanaged = yield* api.unmanaged;
      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0]?.key.name).toBe("legacy");
    }),
  );
});
