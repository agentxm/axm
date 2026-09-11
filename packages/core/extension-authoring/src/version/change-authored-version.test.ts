import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypes, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { ChangeAuthoredVersion } from "./change-authored-version.js";

/**
 * Exhaustive per-type coverage behind
 * `cli/version/changes-only-the-authored-manifest-version`: the rule is one
 * decision, and this sweep verifies every authored type carries a version the
 * workspace can change.
 */
describe("ChangeAuthoredVersion over every extension type", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of authoringTypes)
    it.effect(`bumps an authored ${row.type}`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        created.writeSettings({
          owner: "@acme",
          agents: [],
          [row.settingsKey]: { review: "workspace" },
        });
        writeAuthoringPackage(created.root, row, "review", { parent: row.plural });

        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* ChangeAuthoredVersion.prepare({
            fqn: `@acme/${row.plural}/review`,
            change: { _tag: "Increment", rule: "minor" },
          });
          return yield* ChangeAuthoredVersion.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(
          JSON.parse(created.read(`${row.plural}/review/${row.manifest}`) ?? "null"),
        ).toMatchObject({ version: "1.3.0" });
      }),
    );
});
