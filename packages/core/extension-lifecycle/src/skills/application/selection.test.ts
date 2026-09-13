import { describe, expect, it } from "@effect/vitest";
import type * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  determineSkillsToInstall,
  SkillSelectionCancelled,
  SkillSelectionInteraction,
  SkillSelectionNotFound,
  SkillSelectionUnavailable,
} from "./index.js";

const candidate = (value: string): SkillExtensionRef => {
  const name = Schema.decodeUnknownSync(ExtensionNameSchema)(value);
  return {
    type: "skill",
    refType: "local",
    source: { type: "local", path: "/fixture/source" },
    owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
    name,
    location: `file:///fixture/source/${name}`,
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};
const first = candidate("inspect-patch");
const second = candidate("draft-release");
const candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef> = [first, second];
const request = { requestedSkills: [], all: false, nonInteractive: false };

describe("skill selection application", () => {
  it.effect("uses a skill-only interface without storage, transport, or another kind", () =>
    Effect.gen(function* () {
      const selected = yield* determineSkillsToInstall(candidates, request).pipe(
        Effect.provideService(SkillSelectionInteraction, {
          select: (offered) => {
            expect(offered).toEqual(candidates);
            return Effect.succeed([second]);
          },
        }),
      );
      expect(selected).toEqual([second]);
    }),
  );
  it.effect("does not open the interface for an explicit selection", () =>
    Effect.gen(function* () {
      const selected = yield* determineSkillsToInstall(candidates, {
        ...request,
        requestedSkills: ["inspect-*"],
      }).pipe(
        Effect.provideService(SkillSelectionInteraction, {
          select: () => Effect.die("Explicit selection must not prompt"),
        }),
      );
      expect(selected).toEqual([first]);
    }),
  );
  it.effect("returns unmatched facts without interface-specific wording", () =>
    Effect.gen(function* () {
      const result = yield* determineSkillsToInstall(candidates, {
        ...request,
        requestedSkills: ["missing"],
      }).pipe(
        Effect.provideService(SkillSelectionInteraction, {
          select: () => Effect.die("Unmatched selection must not prompt"),
        }),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SkillSelectionNotFound);
        expect(result.failure).toMatchObject({
          requested: ["missing"],
          available: ["inspect-patch", "draft-release"],
        });
      }
    }),
  );
  for (const failure of [
    new SkillSelectionCancelled({ message: "Choice declined" }),
    new SkillSelectionUnavailable({ cause: new Error("Interface unavailable") }),
  ]) {
    it.effect(`preserves ${failure._tag} distinctly through the owner contract`, () =>
      Effect.gen(function* () {
        const result = yield* determineSkillsToInstall(candidates, request).pipe(
          Effect.provideService(SkillSelectionInteraction, {
            select: () => Effect.fail(failure),
          }),
          Effect.result,
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) expect(result.failure).toBe(failure);
      }),
    );
  }
});
