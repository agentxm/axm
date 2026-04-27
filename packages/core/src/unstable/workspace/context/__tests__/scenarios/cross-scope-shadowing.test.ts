/**
 * Scenario: Cross-scope shadowing — project + user scope expose independent
 * reads with no implicit merge on `skills.declared`.
 *
 * Per the design _Settings shadowing_ note: "When the same source name is
 * declared at both scopes, today's `Effective Source Hosts` set merges with
 * `project > user`. There is no built-in merged view on
 * `ctx.scope(scope).skills.declared`. The two scope reads are exposed
 * separately; the migration target that needs the merge owns it locally."
 *
 * This scenario file proves the API contract: each scope read is computed
 * from its own scope's settings only.
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
// Spec: same source-host name "shared" declared at both scopes with
// different URLs. Same skill name "shadow-tool" declared at both scopes
// pointing to different sources.
// ---------------------------------------------------------------------------

const shadowingSpec: FixtureSpec = {
  workspaceRoot: SCENARIO_WORKSPACE_ROOT,
  userHome: SCENARIO_USER_HOME,
  project: {
    settings: {
      _tag: "valid",
      contents: {
        sources: [{ name: "shared", type: "github", url: "https://github.com/team" }],
        skills: { "shadow-tool": "github:team/shadow-tool" },
      },
    },
  },
  user: {
    settings: {
      _tag: "valid",
      contents: {
        sources: [{ name: "shared", type: "github", url: "https://github.com/user" }],
        skills: { "shadow-tool": "github:user/shadow-tool" },
      },
    },
  },
};

describe("cross-scope shadowing — independent reads", () => {
  it.effect("skills.declared on each scope returns only that scope's settings entries", () =>
    runScenario(shadowingSpec, (ctx) =>
      Effect.gen(function* () {
        const projectDeclared = expectSome(yield* ctx.scope("project").skills.declared);
        const userDeclared = expectSome(yield* ctx.scope("user").skills.declared);

        // Each scope returns its own entry.
        const projectShadow = projectDeclared.find((d) => d.name === "shadow-tool");
        const userShadow = userDeclared.find((d) => d.name === "shadow-tool");
        expect(projectShadow?.entry.source).toBe("github:team/shadow-tool");
        expect(userShadow?.entry.source).toBe("github:user/shadow-tool");
      }),
    ),
  );

  it.effect(
    "skills.declared performs no implicit merge: project entry not visible from user, and vice versa",
    () =>
      runScenario(shadowingSpec, (ctx) =>
        Effect.gen(function* () {
          const projectDeclared = expectSome(yield* ctx.scope("project").skills.declared);
          const userDeclared = expectSome(yield* ctx.scope("user").skills.declared);

          // The project read does not return the user-source entry.
          expect(projectDeclared.some((d) => d.entry.source === "github:user/shadow-tool")).toBe(
            false,
          );
          // The user read does not return the project-source entry.
          expect(userDeclared.some((d) => d.entry.source === "github:team/shadow-tool")).toBe(
            false,
          );

          // Both scopes have exactly one shadow-tool declaration each.
          expect(projectDeclared.filter((d) => d.name === "shadow-tool")).toHaveLength(1);
          expect(userDeclared.filter((d) => d.name === "shadow-tool")).toHaveLength(1);
        }),
      ),
  );

  it.effect(
    "sourceHosts.declared on each scope returns only that scope's source-host entries",
    () =>
      runScenario(shadowingSpec, (ctx) =>
        Effect.gen(function* () {
          const projectHosts = yield* ctx.scope("project").sourceHosts.declared;
          const userHosts = yield* ctx.scope("user").sourceHosts.declared;

          // Each scope sees one "shared" host with its scope's URL.
          expect(projectHosts).toHaveLength(1);
          expect(userHosts).toHaveLength(1);

          const projectShared = projectHosts.find((h) => h.name === "shared");
          const userShared = userHosts.find((h) => h.name === "shared");

          expect(projectShared).toBeDefined();
          expect(userShared).toBeDefined();
          if (projectShared === undefined || userShared === undefined) return;
          // Each scope's host has the URL declared in its own settings.
          if (projectShared.type === "github") {
            expect(projectShared.url.toString()).toContain("team");
          }
          if (userShared.type === "github") {
            expect(userShared.url.toString()).toContain("user");
          }
        }),
      ),
  );

  it.effect("scoped state.settings cells return distinct decoded settings per scope", () =>
    runScenario(shadowingSpec, (ctx) =>
      Effect.gen(function* () {
        const projectSettings = expectSome(yield* ctx.scope("project").state.settings);
        const userSettings = expectSome(yield* ctx.scope("user").state.settings);
        // Each scope's decoded settings are independent values.
        expect(projectSettings).not.toBe(userSettings);
      }),
    ),
  );
});
