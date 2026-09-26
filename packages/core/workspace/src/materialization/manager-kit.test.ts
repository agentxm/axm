import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { SettingsReader, WorkspaceRecords } from "../desired-state/index.js";
import { createDefaultSettings } from "../desired-state/settings/index.js";
import { WorkspaceReadTest, configuredRow } from "../desired-state/testing.js";
import { countExtensionInventory } from "../desired-state/workspace/read-model/extensions/inventory.js";
import { makeBaseManagerMembers } from "./manager-kit.js";

describe("shared manager members", () => {
  it.effect("reads installed and configured state and refuses a missing retained canonical", () =>
    Effect.gen(function* () {
      const records = yield* WorkspaceRecords;
      const settings = yield* SettingsReader;
      const members = makeBaseManagerMembers({
        type: "hook",
        spanPrefix: "HookManager",
        records,
        settings,
        refName: (ref) => ref.hook.name,
        materializeInstall: () => Effect.die("No install expected"),
      });

      expect(yield* members.isInstalled({ target: { type: "hook", name: "audit" } })).toBe(true);
      expect(yield* members.isInstalled({ target: { type: "hook", name: "missing" } })).toBe(false);
      expect(
        yield* members.getConfiguredSource({ target: { type: "hook", name: "audit" } }),
      ).toEqual(Option.some("./source-hook"));
      expect(
        yield* members.getConfiguredSource({ target: { type: "hook", name: "missing" } }),
      ).toEqual(Option.none());
      const failure = yield* members
        .materializeRetained({
          target: { type: "hook", name: "audit" },
        })
        .pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "LifecyclePostconditionViolated",
        postcondition: "materialize-observable",
        targetType: "hook",
        targetName: "audit",
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          WorkspaceReadTest({
            baseDir: "/workspace",
            settings: {
              ...createDefaultSettings(),
              hooks: { audit: { source: "./source-hook", enabled: true } },
            },
            records: {
              getExtensionInventory: () =>
                Effect.succeed(
                  countExtensionInventory([
                    {
                      ...configuredRow({ type: "hook", name: "audit", source: "./source-hook" }),
                      agentOutcomes: [],
                    },
                  ]),
                ),
            },
          }),
          NodeServices.layer,
        ),
      ),
    ),
  );
});
