/**
 * Agent-settings scanner: covers per-agent native settings files
 * (`.claude/settings.json`, etc.). Each occurrence carries
 * `agent-settings(agentId)` origins.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentSettingsScanner } from "../scanners/agent-settings.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: typeof AGENTS },
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeAgentSettingsScanner(
      options?.agentRegistry === undefined
        ? {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
          }
        : {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
            agentRegistry: options.agentRegistry,
          },
    );
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

describe("agent-settings scanner", () => {
  it.effect("emits no occurrences when no agent settings file exists", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits one occurrence per agent settings.json", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "valid", contents: { theme: "dark" } },
          },
        },
      });
      const claude = occurrences.filter((o) => o.agentId === "claude-code");
      expect(claude).toHaveLength(1);
      expect(claude[0]?._tag).toBe("agent-settings");
      expect(claude[0]?.scope).toBe("project");
      expect(claude[0]?.contentLocation).toBe("/ws/.claude/settings.json");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits multiple occurrences when multiple agents have settings", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "valid", contents: {} },
            cursor: { _tag: "valid", contents: {} },
            codex: { _tag: "valid", contents: {} },
          },
        },
      });
      const observed = occurrences.filter((o) =>
        new Set<string>(["claude-code", "cursor", "codex"]).has(o.agentId),
      );
      expect(observed).toHaveLength(3);
      const ids = observed.map((o) => o.agentId).sort();
      expect(ids).toEqual(["claude-code", "codex", "cursor"]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("does not parse the settings file (Phase 8 owns that)", () =>
    Effect.gen(function* () {
      // A byte-corrupt agent settings file SHALL still emit an occurrence —
      // the scanner reports presence, not validity.
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: {
            "claude-code": { _tag: "byteCorrupt", bytes: "{ not json" },
          },
        },
      });
      const claude = occurrences.filter((o) => o.agentId === "claude-code");
      expect(claude).toHaveLength(1);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("user scope is stamped onto every occurrence", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentSettings: { "claude-code": { _tag: "valid", contents: {} } },
        },
      });
      const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const occurrences = yield* makeAgentSettingsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: WORKSPACE_ROOT,
        scope: "user",
        diagnostics: makeDiagnostics(ref),
      });
      expect(occurrences.every((o) => o.scope === "user")).toBe(true);
    }).pipe(Effect.provide(Path.layer)),
  );
});
