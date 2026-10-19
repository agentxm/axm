import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { authoringTypes } from "../test-support/authoring-packages.js";
import {
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { createRequestFor } from "../test-support/create-requests.js";
import { CreateExtension } from "./create-extension.js";

describe("CreateExtension name validation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const invalidNames = ["review-", "-review", "Review", "re view", "a".repeat(65)];

  for (const row of authoringTypes)
    for (const name of invalidNames)
      it.effect(`refuses ${row.type} name ${JSON.stringify(name)} as a typed failure`, () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
          cleanups.push(created.cleanup);
          const before = created.snapshot();

          const failure = yield* CreateExtension.prepare(createRequestFor(row.type, name)).pipe(
            Effect.provide(authoringWorkspaceLayer(created)),
            Effect.flip,
          );

          expect(failure).toMatchObject({ _tag: "ScaffoldNameInvalid", name, maxLength: 64 });
          expect(created.snapshot()).toEqual(before);
        }),
      );
});
