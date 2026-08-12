import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { normalizeHandle } from "../../../extensions/handle.js";

import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import type { WorkspaceRuleContext } from "../../context.js";
import { releaseAgeExcludeOwnerTrustedRule } from "./release-age-exclude-owner-trusted.js";

const contextFor = (
  settings: Readonly<Record<string, unknown>>,
  owner = Option.some(normalizeHandle("@acme")),
) =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      owner: Effect.succeed(owner),
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/tmp/ws",
        userHome: "/tmp/user",
        project: { settings: { _tag: "valid", contents: settings } },
      }),
    ),
    Effect.orDie,
  );

describe("workspace/release-age-exclude-owner-trusted", () => {
  it.effect("accepts exclusions for the declared workspace owner", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({
        owner: "@acme",
        minimumReleaseAgeExclude: ["@acme/skills/*", "@acme/*"],
      });
      expect(yield* releaseAgeExcludeOwnerTrustedRule.check(context)).toEqual([]);
    }),
  );

  it.effect("warns for exclusions owned by another publisher", () =>
    Effect.gen(function* () {
      const context = yield* contextFor({
        owner: "@acme",
        minimumReleaseAgeExclude: ["@vendor/skills/tool"],
      });
      const findings = yield* releaseAgeExcludeOwnerTrustedRule.check(context);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("differs from workspace owner @acme");
    }),
  );

  it.effect("does not warn when no workspace owner is configured", () =>
    Effect.gen(function* () {
      const context = yield* contextFor(
        { minimumReleaseAgeExclude: ["@vendor/skills/tool"] },
        Option.none(),
      );
      expect(yield* releaseAgeExcludeOwnerTrustedRule.check(context)).toEqual([]);
    }),
  );
});
