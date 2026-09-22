import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";

import { DesiredStateReader, WorkspaceRecords } from "../../desired-state/index.js";
import { applyInstall, installRequest, makeInstallWorld } from "../install/test-helpers.js";
import { configuredUpdateRequest } from "./test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";

it.effect("shares one installed skill inventory across a configured update sweep", () => {
  const { workspace, registry, cleanup } = makeInstallWorld();
  const names = ["review", "triage"];
  return workspace
    .provide(
      Effect.gen(function* () {
        for (const name of names) {
          registry.writeSkill(name, [{ version: "1.0.0", body: `Initial ${name}.` }]);
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: `@acme/skills/${name}` },
            }),
          );
          registry.writeSkill(name, [
            { version: "1.0.0", body: `Initial ${name}.` },
            { version: "2.0.0", body: `Changed ${name}.` },
          ]);
        }

        const records = yield* WorkspaceRecords;
        const desiredState = yield* DesiredStateReader;
        let skillInventoryReads = 0;
        let graphReads = 0;
        const observed = {
          ...records,
          getExtensionInventory: (type, options) =>
            Effect.sync(() => {
              if (type === "skill") skillInventoryReads += 1;
            }).pipe(Effect.andThen(records.getExtensionInventory(type, options))),
        } satisfies typeof records;
        const observedGraph = {
          ...desiredState,
          graph: (options) =>
            Effect.sync(() => {
              graphReads += 1;
            }).pipe(Effect.andThen(desiredState.graph(options))),
        } satisfies typeof desiredState;
        const candidate = yield* UpdateExtensions.prepare(
          configuredUpdateRequest({ type: "skill" }),
        ).pipe(
          Effect.provideService(WorkspaceRecords, observed),
          Effect.provideService(DesiredStateReader, observedGraph),
        );
        expect(candidate.outcome).toBe("planned");
        expect(skillInventoryReads).toBe(1);
        expect(graphReads).toBe(1);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});
