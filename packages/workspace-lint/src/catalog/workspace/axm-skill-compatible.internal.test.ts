import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { SettingsIoError } from "@agentxm/workspace-state";
import { contextFor, validLockfile, validSettings } from "./conformance/test-helpers.js";
import { axmSkillCompatibleRule } from "./axm-skill-compatible.js";

it.effect("reports an unreadable AXM skill compatibility state", () =>
  Effect.gen(function* () {
    const context = yield* contextFor({ settings: validSettings(), lockfile: validLockfile });
    expect(
      yield* axmSkillCompatibleRule.check({
        ...context,
        axmSkillCompatibility: Effect.fail(
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
        location: { file: "skills/axm" },
      },
    ]);
  }),
);
