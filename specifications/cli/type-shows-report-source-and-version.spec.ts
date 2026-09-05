import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { ManifestIdentitySchema } from "@agentxm/registry-protocol/unstable/publish";
import {
  handleExtensionShow,
  ExtensionShowResultSchema,
  handleInstall,
} from "axm.sh/specification-harness";
import { authoringTypes, readPackageJson } from "../support/authoring-fixtures.js";
import { createNewExtension } from "../support/new-extension-fixture.js";
import { makeReadSpecWorkspace } from "../support/read-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-report-source-and-version",
  title: "Type inspection distinguishes source and observed version",
  statement:
    "When emitting machine output from skills show, mcps show, subagents show, rules show, hooks show, or knowledge show for a configured extension, AXM shall report its local identity, activation, source, and version from the accepted resolution or the matching authored manifest when no resolution exists.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/shared/extension-show.internal.test.ts",
    "packages/cli/src/root/shared/extension-show.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Installed extension detail", () => {
  for (const row of authoringTypes) {
    if (row.type === "pack") continue;
    const type = row.type;
    it.effect(`authored ${type}`, () => {
      const workspace = makeReadSpecWorkspace({ settings: { agents: ["claude-code"] } });
      return workspace.provide(
        Effect.gen(function* () {
          yield* createNewExtension(row, "example");
          const manifest = Schema.decodeUnknownSync(ManifestIdentitySchema)(
            readPackageJson(workspace.root, `${row.plural}/example/${row.manifest}`),
          );
          yield* handleExtensionShow({ type, name: "example" });
          const result = Schema.decodeUnknownSync(Schema.toType(ExtensionShowResultSchema))(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(result.item).toEqual({
            type,
            name: "example",
            enabled: true,
            source: "workspace",
            version: manifest.version,
            scope: "project",
            locked: false,
          });
          expect(Array.isArray(result.agents)).toBe(true);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    });
  }
  it.effect("reports an installation’s accepted version", () => {
    const registry = makeSpecRegistry();
    registry.writeSkill("review", [{ version: "1.2.3", body: "Review instructions." }]);
    const workspace = makeReadSpecWorkspace({ settings: { sources: [registry.source] } });
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleInstall({
          source: Option.some("@acme/skills/review"),
          preview: false,
          force: false,
        });
        yield* handleExtensionShow({ type: "skill", name: "review" });
        expect(
          Schema.decodeUnknownSync(Schema.toType(ExtensionShowResultSchema))(
            workspace.rendererState.results.at(-1)?.data,
          ).item,
        ).toMatchObject({
          name: "review",
          source: "agentxm:@acme/skills/review",
          version: "1.2.3",
          locked: true,
        });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      ),
    );
  });
});
