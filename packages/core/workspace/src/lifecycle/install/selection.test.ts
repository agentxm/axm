import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ExtensionNameSchema, HandleSchema } from "@agentxm/extension-model/unstable/extensions";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";

import { ExtensionLifecycleFailed } from "../errors.js";
import { InstallSelectionInteraction, selectInstallRefs } from "./selection.js";

const candidate = (value: string): RuleExtensionRef => {
  const name = Schema.decodeUnknownSync(ExtensionNameSchema)(value);
  return {
    type: "rule",
    refType: "local",
    source: { type: "local", path: "/fixture/source" },
    owner: Schema.decodeUnknownSync(HandleSchema)("@publisher"),
    name,
    location: `file:///fixture/source/${name}`,
    rule: { name },
  };
};

const first = candidate("safe-shell");
const second = candidate("commit-style");

describe("install source selection", () => {
  it.effect("requires a selector or --all when no prompt can open", () =>
    Effect.gen(function* () {
      const failure = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: [],
        all: false,
        nonInteractive: true,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: () => Effect.die("Non-interactive selection must not prompt"),
        }),
        Effect.flip,
      );
      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({ category: "usage" });
    }),
  );

  it.effect("accepts every candidate when --all supplies the decision", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: [],
        all: true,
        nonInteractive: true,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: () => Effect.die("--all selection must not prompt"),
        }),
      );
      expect(selected).toEqual([first, second]);
    }),
  );

  it.effect("lists candidates and honors an interactive selection", () =>
    Effect.gen(function* () {
      const selected = yield* selectInstallRefs([first, second], {
        type: "rule",
        selectors: [],
        all: false,
        nonInteractive: false,
      }).pipe(
        Effect.provideService(InstallSelectionInteraction, {
          select: (candidates) => {
            expect(candidates.map(({ name }) => name)).toEqual(["safe-shell", "commit-style"]);
            return Effect.succeed([candidates[1]].filter((value) => value !== undefined));
          },
        }),
      );
      expect(selected).toEqual([second]);
    }),
  );
});
