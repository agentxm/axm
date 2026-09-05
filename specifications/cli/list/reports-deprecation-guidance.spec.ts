import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";
import { handleList, ExtensionListDocumentSchema } from "axm.sh/specification-harness";
import { makeInstalledReadFixture } from "../../support/read-inventory-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/list/reports-deprecation-guidance",
  title: "Deprecation listings report available replacement guidance",
  statement:
    "When listing deprecated installations, AXM shall return the Registry\u2019s deprecation message and replacement availability for each matching installation.",
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

describe("Installation deprecation guidance", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const row of [
    {
      label: "message and visible replacement",
      guidance: {
        message: "Use the replacement.",
        replacement: { status: "available", fqn: "@acme/skills/replacement" },
      },
    },
    {
      label: "message and unavailable replacement",
      guidance: {
        message: "Use the replacement when available.",
        replacement: { status: "unavailable" },
      },
    },
    { label: "message only", guidance: { message: "This extension is no longer maintained." } },
    {
      label: "replacement only",
      guidance: { replacement: { status: "available", fqn: "@acme/skills/replacement" } },
    },
  ])
    it.effect(row.label, () =>
      Effect.gen(function* () {
        const { workspace, setDeprecation } = yield* makeInstalledReadFixture(cleanups);
        setDeprecation({ deprecatedAt: "2026-03-01T00:00:00.000Z", ...row.guidance });
        yield* handleList({ type: Option.none(), outdated: false, deprecated: true }).pipe(
          Effect.provide(workspace.layer),
        );
        const result = Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(result).toMatchObject({
          filter: "deprecated",
          count: 1,
          coverage: { eligible: 1, checked: 1, unknown: 0 },
          items: [
            { name: "review", assessment: { state: "deprecated", deprecation: row.guidance } },
          ],
        });
      }),
    );
});
