import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as fs from "node:fs";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";
import { handleList, ExtensionListDocumentSchema } from "axm.sh/specification-harness";
import { makeInstalledReadFixture } from "../../support/read-inventory-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-incomplete-assessment",
  title: "List reports incomplete Registry assessment",
  statement:
    "When an installation\u2019s recorded Registry source is not configured or its extension index is not found, AXM shall mark that assessment as unknown in coverage instead of treating it as a confirmed current installation.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/list/command.internal.test.ts",
    "packages/workspace-inspection/src/extension-list.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Incomplete Registry assessment", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const filter of ["outdated", "deprecated"] as const)
    for (const missing of ["index", "source"] as const)
      it.effect(`${filter}: missing ${missing}`, () =>
        Effect.gen(function* () {
          const { workspace, indexPath } = yield* makeInstalledReadFixture(cleanups);
          if (missing === "index") fs.rmSync(indexPath);
          else {
            const settings = workspace.readSettings();
            if (typeof settings !== "object" || settings === null)
              throw new Error("Expected workspace settings");
            workspace.writeSettings({ ...settings, sources: [] });
          }
          yield* handleList({
            type: Option.none(),
            outdated: filter === "outdated",
            deprecated: filter === "deprecated",
          }).pipe(Effect.provide(workspace.layer));
          expect(
            Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
              workspace.rendererState.results.at(-1)?.data,
            ),
          ).toMatchObject({
            filter,
            count: 0,
            items: [],
            coverage: { eligible: 1, checked: 0, unknown: 1 },
          });
        }),
      );
});
