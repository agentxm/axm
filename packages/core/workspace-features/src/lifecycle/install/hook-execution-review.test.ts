import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { InstallExtensions } from "./install-extensions.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";

it.effect("reviews a warning-free Registry Hook listed twice by its install step once", () => {
  const { workspace, registry, cleanup } = makeInstallWorld();
  registry.writeHook("audit", [{ version: "1.0.0" }]);
  return workspace
    .provide(
      Effect.gen(function* () {
        const facts: WorkFact[] = [];
        const candidate = yield* InstallExtensions.prepare(
          installRequest({
            type: "hook",
            subject: { kind: "source", source: "@acme/hooks/audit" },
          }),
        ).pipe(
          Effect.provideService(CurrentWorkObserver, {
            record: (fact) => {
              facts.push(fact);
            },
            detailSelected: () => false,
          }),
        );
        const hookRefs = candidate.execution.plan.jobs
          .flatMap((job) => job.steps)
          .flatMap((step) => step.exposureRefs ?? [])
          .filter((ref) => ref.type === "hook");
        // The install step lists the resolved ref and, among its projection's
        // exposure sources, the same ref again.
        expect(hookRefs).toHaveLength(2);
        for (const ref of hookRefs) {
          expect(ref.refType).toBe("registry");
          if (ref.refType !== "registry") continue;
          expect(Option.isSome(ref.integrity)).toBe(true);
          expect(ref.lifecycleWarnings ?? []).toEqual([]);
        }
        expect(hookRefs[1]).toBe(hookRefs[0]);
        // One review: the duplicate's fetch could neither warn nor publish progress.
        expect(
          facts.filter((fact) => fact.kind === "axm.hash.execution-configuration"),
        ).toHaveLength(1);
        const changes = (candidate.execution.plan.riskConditions ?? []).flatMap((risk) =>
          risk.level === "override-required" ? (risk.executionChanges ?? []) : [],
        );
        expect(changes.map(({ name }) => name)).toEqual(["audit"]);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
});
