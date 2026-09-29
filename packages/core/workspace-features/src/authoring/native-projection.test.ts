import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CreateExtension } from "./create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "./test-support/authoring-workspace.js";

describe("authored native projection outcomes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const type of ["rule", "hook", "knowledge"] as const) {
    it.effect(`reports final native locations after creating a ${type}`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
        cleanups.push(created.cleanup);
        created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
        const resolution = yield* Effect.gen(function* () {
          const candidate =
            type === "rule"
              ? yield* CreateExtension.prepare({
                  type,
                  name: "review",
                  owner: Option.none(),
                  title: Option.none(),
                })
              : type === "knowledge"
                ? yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    description: Option.none(),
                  })
                : yield* CreateExtension.prepare({
                    type,
                    name: "review",
                    owner: Option.none(),
                    runtime: "bash",
                    event: "session.start",
                    matcher: Option.none(),
                  });
          return yield* CreateExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
        const nativeLocations = resolution.units.flatMap(
          (unit) => unit.artifact?.nativeLocations ?? [],
        );
        expect(nativeLocations.length).toBeGreaterThan(0);
        expect(
          nativeLocations.every((location) => location.address.path.startsWith(`${created.root}/`)),
        ).toBe(true);
        expect(nativeLocations.some((location) => location.state === "created")).toBe(true);
        expect(
          nativeLocations
            .flatMap((location) => location.availability)
            .every((fact) => fact.state !== "verified"),
        ).toBe(true);
      }),
    );
  }
});
