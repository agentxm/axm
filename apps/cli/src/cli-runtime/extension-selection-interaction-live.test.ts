import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  SkillSelectionCancelled,
  SkillSelectionInteraction,
} from "@agentxm/workspace/skills/lifecycle/application";

import { TestRenderer } from "../test-support/presenter-test.js";
import { SkillSelectionLive } from "./extension-selection-interaction-live.js";

const candidate = (value: string): SkillExtensionRef => {
  const name = Schema.decodeUnknownSync(ExtensionNameSchema)(value);
  return {
    type: "skill",
    refType: "local",
    source: { type: "local", path: "/fixture/source" },
    owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
    name,
    location: `file:///fixture/source/${name}`,
    skill: { name, description: Option.some(`Description for ${name}`), metadata: Option.none() },
  };
};

const first = candidate("inspect-patch");
const second = candidate("draft-release");

const harness = () => {
  const renderer = TestRenderer.make();
  return {
    layer: SkillSelectionLive.pipe(Layer.provide(renderer.layer)),
    state: renderer.state,
  };
};

describe("SkillSelectionLive", () => {
  it.effect("uses the real bounded Pick and preserves its non-interactive guard", () => {
    const test = harness();
    test.state.script.answers.push({ _tag: "Pick", titles: ["draft-release"] });
    return Effect.gen(function* () {
      const interaction = yield* SkillSelectionInteraction;
      const selected = yield* interaction.select([first, second]);

      expect(selected).toEqual([second]);
      expect(test.state.script.views.length).toBeGreaterThan(1);
      expect(test.state.script.guards).toEqual([
        {
          message: "Select skills to install",
          guidance:
            "Name the skills with --skill, take them all with --all, or rerun without --json.",
        },
      ]);
      expect(test.state.script.asks[0]).toMatchObject({ _tag: "Pick", min: 1 });
    }).pipe(Effect.provide(test.layer));
  });

  it.effect("maps cancellation through the skill-owned failure", () => {
    const test = harness();
    test.state.script.answers.push({ _tag: "Cancel" });
    return Effect.gen(function* () {
      const interaction = yield* SkillSelectionInteraction;
      const error = yield* interaction.select([first, second]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(SkillSelectionCancelled);
    }).pipe(Effect.provide(test.layer));
  });
});
