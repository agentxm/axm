/**
 * Skill subject module tests: declared/resolved/actual payload shapes,
 * scanner composition (canonical-extensions + agent-dir), and projections via
 * the shared helper.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import { decodedSettings } from "../../__fixtures__/decoders.js";
import { makeAgentDirOccurrence, makeCanonicalOccurrence } from "../../__fixtures__/occurrences.js";
import { makeDiagnostics, type Warning } from "../../diagnostics.js";
import { makeSkillExtensionsApi, type ActualSkill } from "../../extensions/skill.js";
import type { CanonicalExtensionOccurrence, AgentDirOccurrence } from "../../scanners/types.js";
import type { Settings } from "../../../../settings/schema.js";
import type { Lockfile } from "../../../../lockfile/schema.js";

const settingsWithSkills = (
  skills: Record<string, { source: string; enabled: boolean }>,
): Effect.Effect<Settings, never> => decodedSettings({ skills }).pipe(Effect.orDie);

const harness = (params: {
  readonly settings?: Settings;
  readonly lockfile?: Lockfile;
  readonly canonicalOccurrences?: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly agentDirOccurrences?: ReadonlyArray<AgentDirOccurrence>;
}) =>
  Effect.gen(function* () {
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diagnostics = makeDiagnostics(ref);
    const api = yield* makeSkillExtensionsApi({
      scope: "project",
      loaders: {
        settings: Effect.succeed(Option.fromUndefinedOr(params.settings)),
        lockfile: Effect.succeed(Option.fromUndefinedOr(params.lockfile)),
      },
      scanners: {
        canonical: Effect.succeed(params.canonicalOccurrences ?? []),
        agentDir: Effect.succeed(params.agentDirOccurrences ?? []),
      },
      installedPacks: Effect.succeed([]),
      diagnostics,
    });
    return { api, ref };
  });

describe("makeSkillExtensionsApi", () => {
  it.effect("declared returns Option.none() when settings are absent", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({});
      const declared = yield* api.declared;
      expect(Option.isNone(declared)).toBe(true);
    }),
  );

  it.effect("declared returns the parsed skill map when settings are present", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithSkills({
        alpha: { source: "github:owner/alpha", enabled: true },
      });
      const { api } = yield* harness({ settings });
      const declared = yield* api.declared;
      const arr = Option.match(declared, { onNone: () => [], onSome: (d) => d });
      expect(arr).toHaveLength(1);
      expect(arr[0]?.name).toBe("alpha");
      expect(arr[0]?.entry.source).toBe("github:owner/alpha");
    }),
  );

  it.effect("actual composes canonical + agent-dir occurrences", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "skill",
            origin: "canonical-axm",
            name: "alpha",
            owner: "@owner",
            contentLocation: "/ws/agent_extensions/@owner/skills/alpha",
          }),
        ],
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "skill",
            agentId: "claude-code",
            name: "alpha",
            contentLocation: "/ws/.claude/skills/alpha",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(2);
      const origins = actual.map((a: ActualSkill) => a.origin._tag).sort();
      expect(origins).toContain("canonical-axm-skill");
      expect(origins).toContain("agent-skill-dir");
    }),
  );

  it.effect("actual filters out non-skill canonical occurrences", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        canonicalOccurrences: [
          makeCanonicalOccurrence({
            scope: "project",
            type: "hook",
            origin: "canonical-axm",
            name: "wrong",
            owner: "@owner",
            contentLocation: "/ws/agent_extensions/@owner/hooks/wrong",
          }),
        ],
      });
      const actual = yield* api.actual;
      expect(actual).toHaveLength(0);
    }),
  );

  it.effect("installed combines declared with actual attached", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithSkills({
        alpha: { source: "github:owner/alpha", enabled: true },
      });
      const { api } = yield* harness({
        settings,
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "skill",
            agentId: "claude-code",
            name: "alpha",
            contentLocation: "/ws/.claude/skills/alpha",
          }),
        ],
      });
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.key.name).toBe("alpha");
      expect(installed[0]?.actual).toHaveLength(1);
      expect(installed[0]?.activation).toBe("enabled");
    }),
  );

  it.effect("active excludes disabled-direct rows", () =>
    Effect.gen(function* () {
      const settings = yield* settingsWithSkills({
        alpha: { source: "github:owner/alpha", enabled: false },
      });
      const { api } = yield* harness({ settings });
      const active = yield* api.active;
      const installed = yield* api.installed;
      expect(installed).toHaveLength(1);
      expect(installed[0]?.activation).toBe("disabled");
      expect(active).toHaveLength(0);
    }),
  );

  it.effect("unmanaged surfaces actual-only skills", () =>
    Effect.gen(function* () {
      const { api } = yield* harness({
        agentDirOccurrences: [
          makeAgentDirOccurrence({
            scope: "project",
            type: "skill",
            agentId: "claude-code",
            name: "legacy",
            contentLocation: "/ws/.claude/skills/legacy",
          }),
        ],
      });
      const unmanaged = yield* api.unmanaged;
      expect(unmanaged).toHaveLength(1);
      expect(unmanaged[0]?.key.name).toBe("legacy");
    }),
  );
});
