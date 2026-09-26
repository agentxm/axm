import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { authoringTypes } from "../test-support/authoring-packages.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { createRequestFor } from "../test-support/create-requests.js";
import { CreateExtension } from "./create-extension.js";

/**
 * Exhaustive per-type coverage behind
 * `cli/creation-uses-configured-workspace-ownership`: ownership is one
 * decision, and this sweep verifies every type creates under the owner the
 * scope records and refuses one it does not.
 */
describe("Ownership over every extension type", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of authoringTypes)
    it.effect(`creates a ${row.type} under the configured owner`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);

        yield* Effect.gen(function* () {
          const candidate = yield* CreateExtension.prepare(createRequestFor(row.type, "review"));
          return yield* CreateExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

        expect(
          JSON.parse(created.read(`${row.plural}/review/${row.manifest}`) ?? "null"),
        ).toMatchObject({ owner: "@acme", name: "review", type: row.type });
        expect(created.settings()).toMatchObject({ owner: "@acme" });
      }),
    );

  for (const row of authoringTypes)
    it.effect(`refuses a ${row.type} under an owner the scope does not record`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        const before = created.snapshot();

        const failure = yield* CreateExtension.prepare(
          createRequestFor(row.type, "review", Option.some("@other")),
        ).pipe(Effect.provide(authoringWorkspaceLayer(created)), Effect.flip);

        expect(failure).toMatchObject({ _tag: "AuthoringOwnerMismatch" });
        expect(created.snapshot()).toEqual(before);
      }),
    );
});
