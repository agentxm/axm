import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import {
  handleList,
  handleInstall,
  ExtensionListDocumentSchema,
  handleSkillsDisable,
} from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../support/read-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/list/assesses-updates-through-recorded-registry",
  title: "Update listings use each installation\u2019s recorded Registry",
  statement:
    "When listing outdated extensions, AXM shall assess installed extensions, including disabled installations, against their recorded Registry source and return those with a newer version that satisfies the recorded version constraint.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/list/command.internal.test.ts",
    "packages/cli/src/root/list/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should Git update assessment treat a changed commit with an unchanged extension tree as an available update? Current code compares both identities; Registry version eligibility is the accepted scope of this requirement.",
  ],
});

describe("Recorded Registry update assessment", () => {
  it.effect(
    "assesses a disabled installation after its Registry publishes a newer matching version",
    () => {
      const registry = makeSpecRegistry();
      registry.writeSkill("review", [{ version: "1.0.0", body: "First release." }]);
      const workspace = makeReadSpecWorkspace({
        settings: { agents: ["claude-code"], sources: [registry.source] },
      });
      const cleanup = () => {
        workspace.cleanup();
        registry.cleanup();
      };
      return workspace.withRegistry(
        Effect.gen(function* () {
          yield* handleInstall({
            source: Option.some("@acme/skills/review@^1.0.0"),
            preview: false,
            force: false,
          });
          yield* handleSkillsDisable({ name: "review", preview: false });
          registry.writeSkill("review", [
            { version: "1.1.0", body: "New release." },
            { version: "1.0.0", body: "First release." },
          ]);
          yield* handleList({ type: Option.none(), outdated: true, deprecated: false });
          const result = Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(result).toMatchObject({
            filter: "outdated",
            count: 1,
            coverage: { eligible: 1, checked: 1, unknown: 0 },
            items: [
              {
                name: "review",
                enabled: false,
                installed: true,
                sourceName: registry.source.name,
                assessment: {
                  state: "available",
                  installedVersion: "1.0.0",
                  latestMatching: "1.1.0",
                },
              },
            ],
          });
          registry.writeSkill("review", [
            { version: "2.0.0", body: "Incompatible new release." },
            { version: "1.0.0", body: "First release." },
          ]);
          yield* handleList({ type: Option.none(), outdated: true, deprecated: false });
          expect(
            Schema.decodeUnknownSync(Schema.toType(ExtensionListDocumentSchema))(
              workspace.rendererState.results.at(-1)?.data,
            ),
          ).toMatchObject({
            count: 0,
            items: [],
            coverage: { eligible: 1, checked: 1, unknown: 0 },
          });
          expect(workspace.requests).toEqual([]);
        }).pipe(Effect.ensuring(Effect.sync(cleanup))),
        () => ({ status: 404, body: {} }),
      );
    },
  );
});
