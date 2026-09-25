import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";

import { DesiredStateReader } from "../../desired-state/index.js";
import { applyInstall, installRequest, makeInstallWorld } from "../install/test-helpers.js";
import { configuredUpdateRequest } from "./test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";

it.effect("reads the desired graph once across a configured update sweep", () => {
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

        const desiredState = yield* DesiredStateReader;
        let graphReads = 0;
        const observedGraph = {
          ...desiredState,
          graph: (options) =>
            Effect.sync(() => {
              graphReads += 1;
            }).pipe(Effect.andThen(desiredState.graph(options))),
        } satisfies typeof desiredState;
        const candidate = yield* UpdateExtensions.prepare(
          configuredUpdateRequest({ type: "skill" }),
        ).pipe(Effect.provideService(DesiredStateReader, observedGraph));
        expect(candidate.outcome).toBe("planned");
        expect(graphReads).toBe(1);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});
