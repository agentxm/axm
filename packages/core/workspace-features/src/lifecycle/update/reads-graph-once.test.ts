import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";

import * as Tracer from "effect/Tracer";
import { withDetailedWork } from "@agentxm/workspace-kernel/locations/testing";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
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

        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const candidate = yield* UpdateExtensions.prepare(
          configuredUpdateRequest({ type: "skill" }),
        ).pipe(withDetailedWork(tracer));
        expect(candidate.outcome).toBe("planned");
        expect(spans.filter((span) => span.name === "DesiredStateReader.evaluate")).toHaveLength(1);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});
