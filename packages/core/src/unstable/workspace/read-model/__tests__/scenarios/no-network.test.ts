/**
 * Scenario: WorkspaceReadModel performs no source resolution or network I/O.
 *
 * Spec requirement coverage:
 *
 * - Declared `github:owner/repo` source string passes through verbatim from
 *   the settings entry to `skills.declared`.
 * - No registry / source-host / network call is attempted.
 *
 * The strongest guarantee here is the compile-time check below: every cell
 * yielded from `WorkspaceReadModel` carries only `WorkspaceReadModel` in its `R`
 * channel. Any future introduction of a network service requirement
 * (`HttpClient`, `RegistryClient`, etc.) surfaces as a type error. We do not
 * patch `globalThis.fetch` — the spec depends on the type system, not on
 * runtime sentinel detection.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { FixtureSpec } from "../../__fixtures__/builder.js";
import {
  expectSome,
  runScenario,
  SCENARIO_USER_HOME,
  SCENARIO_WORKSPACE_ROOT,
} from "./_harness.js";

// ---------------------------------------------------------------------------
// Fixture: settings declares a skill with a github source string
// ---------------------------------------------------------------------------

const githubSourceSpec: FixtureSpec = {
  workspaceRoot: SCENARIO_WORKSPACE_ROOT,
  userHome: SCENARIO_USER_HOME,
  project: {
    settings: {
      _tag: "valid",
      contents: {
        skills: { "some-skill": "github:owner/repo" },
      },
    },
  },
};

describe("no source resolution or network I/O", () => {
  it.effect("declared source string passes through verbatim — no resolution applied", () =>
    runScenario(githubSourceSpec, (ctx) =>
      Effect.gen(function* () {
        const declared = expectSome(yield* ctx.scope("project").skills.declared);
        const skill = declared.find((s) => s.name === "some-skill");
        expect(skill).toBeDefined();
        // The declared cell preserves the entry as written in settings.
        expect(skill?.entry.source).toBe("github:owner/repo");
      }),
    ),
  );

  it.effect("the full read surface for both scopes runs without an HttpClient layer", () =>
    runScenario(githubSourceSpec, (ctx) =>
      Effect.gen(function* () {
        // Touch every cell that could plausibly trigger source resolution if
        // WorkspaceReadModel were to lapse from its contract. The compile-time
        // assertion below guarantees no network service is in `R`; this
        // runtime traversal proves the read surface is exercisable end-to-end
        // without one.
        const project = ctx.scope("project");
        yield* project.skills.declared;
        yield* project.skills.resolved;
        yield* project.skills.actual;
        yield* project.skills.installed;
        yield* project.skills.active;
        yield* project.skills.unmanaged;
        yield* project.skills.ignored;
        yield* project.commands.installed;
        yield* project.mcpServers.installed;
        yield* project.subagents.installed;
        yield* project.files.installed;
        yield* project.rules.installed;
        yield* project.packs.installed;
        yield* project.agents.list;
        yield* project.agents.detected;
        yield* project.state.settings;
        yield* project.state.lockfile;
        yield* project.sourceHosts.declared;
        yield* project.sourceHosts.effective;
        yield* project.sourceHosts.registryHosts;
        yield* project.sourceHosts.byName("anything");
        yield* project.profile.declared;
        yield* project.profile.effective;
        yield* project.diagnostics;

        const user = ctx.scope("user");
        yield* user.skills.declared;
        yield* user.skills.installed;
        yield* user.state.settings;
        yield* user.state.lockfile;
        yield* user.sourceHosts.declared;
        yield* user.profile.declared;
      }),
    ),
  );
});

// Compile-time `R` channel assertion lives in `no-network.type-test.ts` so it
// runs under typecheck without occupying the runtime suite.
