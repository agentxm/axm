import { describe, expect, it } from "@effect/vitest";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  SkillSelectionCancelled,
  SkillSelectionInteraction,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";

import { AppError } from "../app-error/index.js";
import {
  OutputWriteFailed,
  Screen,
  plain,
  promptRequired,
  type AskFailure,
} from "../screen/index.js";
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

  it.effect("carries a closed prompt's own usage guidance to the boundary", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const closed = Layer.succeed(Screen, {
        ...screen,
        canAsk: Effect.succeed(false),
        ask: (ask, guard) => Effect.fail(promptRequired(plain(ask.question), guard)),
      });
      const error = yield* Effect.gen(function* () {
        const interaction = yield* SkillSelectionInteraction;
        return yield* interaction.select([first, second]);
      }).pipe(Effect.provide(SkillSelectionLive.pipe(Layer.provide(closed))), Effect.flip);
      expect(error).toBeInstanceOf(SkillSelectionUnavailable);
      expect(error.cause).toBeInstanceOf(AppError);
      expect(error.cause).toMatchObject({
        code: "usage",
        detail: "Interactive prompt required: Select skills to install",
        suggestions: [
          {
            description:
              "Name the skills with --skill, take them all with --all, or rerun without --json.",
          },
        ],
      });
    }),
  );

  it.effect.each([
    {
      failure: "a failed write",
      failing: Effect.succeed<AskFailure>(
        new OutputWriteFailed({ channel: "stderr", reason: "EPIPE" }),
      ),
      detail: "The selection could not be displayed.",
    },
    {
      failure: "unreadable configuration",
      failing: Config.String("CI").pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.make(() =>
              Effect.fail(new ConfigProvider.SourceError({ message: "private source detail" })),
            ),
          ),
        ),
        Effect.flip,
        Effect.catch((value) => Effect.die(new Error(`configuration read succeeded: ${value}`))),
        Effect.map((error): AskFailure => error),
      ),
      detail: "Interaction configuration could not be read.",
    },
  ])("reports $failure as an internal failure with the port's wording", ({ failing, detail }) =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const cause = yield* failing;
      const error = yield* Effect.gen(function* () {
        const interaction = yield* SkillSelectionInteraction;
        return yield* interaction.select([first, second]);
      }).pipe(
        Effect.provide(
          SkillSelectionLive.pipe(
            Layer.provide(Layer.succeed(Screen, { ...screen, ask: () => Effect.fail(cause) })),
          ),
        ),
        Effect.flip,
      );
      expect(error).toBeInstanceOf(SkillSelectionUnavailable);
      expect(error.cause).toMatchObject({ _tag: "AppError", code: "internal", detail });
      expect(error.cause).toHaveProperty("cause", cause);
    }),
  );

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
