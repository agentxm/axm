import { describe, expect, it } from "@effect/vitest";
import type * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import {
  determineSubagentsToInstall,
  SubagentSelectionCancelled,
  SubagentSelectionInteraction,
  SubagentSelectionNotFound,
  SubagentSelectionUnavailable,
} from "./index.js";

const candidate = (value: string): SubagentExtensionRef => {
  const name = Schema.decodeUnknownSync(ExtensionNameSchema)(value);
  return {
    type: "subagent",
    refType: "local",
    source: { type: "local", path: "/fixture/source" },
    owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
    name,
    location: `file:///fixture/source/${name}`,
    subagent: { name, description: Option.none() },
  };
};
const first = candidate("inspect-patch");
const second = candidate("draft-release");
const candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef> = [first, second];
const request = { requestedSubagents: [], all: false, nonInteractive: false };

describe("subagent selection application", () => {
  it.effect("uses a subagent-only interface without storage, transport, or another kind", () =>
    Effect.gen(function* () {
      const selected = yield* determineSubagentsToInstall(candidates, request).pipe(
        Effect.provideService(SubagentSelectionInteraction, {
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
      const selected = yield* determineSubagentsToInstall(candidates, {
        ...request,
        requestedSubagents: ["inspect-*"],
      }).pipe(
        Effect.provideService(SubagentSelectionInteraction, {
          select: () => Effect.die("Explicit selection must not prompt"),
        }),
      );
      expect(selected).toEqual([first]);
    }),
  );
  it.effect("returns unmatched facts without interface-specific wording", () =>
    Effect.gen(function* () {
      const result = yield* determineSubagentsToInstall(candidates, {
        ...request,
        requestedSubagents: ["missing"],
      }).pipe(
        Effect.provideService(SubagentSelectionInteraction, {
          select: () => Effect.die("Unmatched selection must not prompt"),
        }),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SubagentSelectionNotFound);
        expect(result.failure).toMatchObject({
          requested: ["missing"],
          available: ["inspect-patch", "draft-release"],
        });
      }
    }),
  );
  for (const failure of [
    new SubagentSelectionCancelled({ message: "Choice declined" }),
    new SubagentSelectionUnavailable({ cause: new Error("Interface unavailable") }),
  ]) {
    it.effect(`preserves ${failure._tag} distinctly through the owner contract`, () =>
      Effect.gen(function* () {
        const result = yield* determineSubagentsToInstall(candidates, request).pipe(
          Effect.provideService(SubagentSelectionInteraction, {
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
