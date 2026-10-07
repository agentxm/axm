import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { SettingsIoError } from "@agentxm/workspace-kernel/workspace-state";
import { contextFor, validLockfile, validSettings } from "./conformance/test-helpers.js";
import { axmSkillCompatibleRule } from "./axm-skill-compatible.js";

const OFFICIAL_SKILL_PATH = "/workspace/agent_extensions/registry.agentxm.ai/@agentxm/skills/axm";

it.effect("reports an unreadable AXM skill compatibility state against the settings", () =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
    expect(
      yield* axmSkillCompatibleRule.check({
        ...context,
        officialAxmSkill: Effect.fail(
          new SettingsIoError({ path: "/workspace/axm.json", cause: "denied" }),
        ),
      }),
    ).toEqual([
      {
        kind: "advisory",
        ruleId: "workspace/axm-skill-compatible",
        severity: "error",
        message:
          "The official AXM skill compatibility state is unreadable: SettingsIoError. Repair the workspace state, then rerun lint.",
        location: { file: "axm.json" },
      },
    ]);
  }),
);

it.effect("reports an unreadable selected package at its own location", () =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
    expect(
      yield* axmSkillCompatibleRule.check({
        ...context,
        officialAxmSkill: Effect.succeed({
          _tag: "unavailable",
          path: OFFICIAL_SKILL_PATH,
          authority: "registry",
          detail: "permission denied",
        } as const),
      }),
    ).toEqual([
      {
        kind: "advisory",
        ruleId: "workspace/axm-skill-compatible",
        severity: "error",
        message:
          "The official AXM skill package could not be read: permission denied. Repair access to the package, then rerun lint.",
        location: { file: OFFICIAL_SKILL_PATH },
      },
    ]);
  }),
);

it.effect("does not report compatibility when the official skill is undeclared", () =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
    expect(
      yield* axmSkillCompatibleRule.check({
        ...context,
        officialAxmSkill: Effect.succeed({ _tag: "undeclared" } as const),
      }),
    ).toEqual([]);
  }),
);

it.effect("leaves an unassessable canonical state to its canonical observation finding", () =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
    expect(
      yield* axmSkillCompatibleRule.check({
        ...context,
        officialAxmSkill: Effect.succeed({
          _tag: "canonical-state",
          path: OFFICIAL_SKILL_PATH,
          authority: "registry",
          status: "materialization-mismatch",
        } as const),
      }),
    ).toEqual([]);
  }),
);
