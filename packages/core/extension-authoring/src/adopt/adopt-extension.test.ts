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
import { AdoptExtension } from "./adopt-extension.js";

/**
 * Exhaustive per-type coverage behind
 * `cli/adopt/moves-package-into-workspace-authorship`: the rule is one
 * decision, and this sweep verifies it is total over the seven types.
 */
describe("AdoptExtension over every extension type", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of authoringTypes)
    it.effect(`adopts a ${row.type} into workspace authorship`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        const parent = `agent_extensions/agentxm/@acme/${row.plural}`;
        writeAuthoringPackage(created.root, row, "review", { parent });
        const before = created.snapshot(`${parent}/review`);

        const resolution = yield* Effect.gen(function* () {
          const candidate = yield* AdoptExtension.prepare({
            fqn: `@acme/${row.plural}/review`,
            nonInteractive: true,
          });
          return yield* AdoptExtension.previewOrApply(candidate, applyExecution);
        }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(created.snapshot(`${row.plural}/review`)).toEqual(before);
        expect(created.exists(`${parent}/review`)).toBe(false);
        expect(created.settings()).toMatchObject({ [row.settingsKey]: { review: "workspace" } });
      }),
    );
});
