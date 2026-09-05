import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleView, handleInstall } from "axm.sh/specification-harness";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import {
  makeReadSpecWorkspace,
  readExtensionIndex,
  readRegistry,
} from "../../support/read-harness.js";

export const specification = defineSpecification({
  requirement: "cli/view/explicit-type-selects-the-local-identity",
  title: "View uses the selected type to resolve a local name",
  statement:
    "When viewing a configured Registry extension by local name with an explicit type, AXM shall retrieve metadata for the Registry identity configured for that name and type.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/view/command.ts", "packages/cli/src/root/view/handler.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Without --type, the current local-name fallback searches only skills and subagents. Whether bare-name lookup should search every non-container type is undecided; this requirement covers the explicit public type selector.",
  ],
});

describe("Typed local-name lookup", () => {
  for (const row of [
    { type: "skill", plural: "skills", name: "review" },
    { type: "knowledge", plural: "knowledge", name: "review" },
  ] as const)
    it.effect(row.type, () => {
      const registry = makeSpecRegistry();
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review guidance." }]);
      registry.writeKnowledge("review", [{ version: "1.0.0", body: "# Review knowledge\n" }]);
      const workspace = makeReadSpecWorkspace({ settings: { sources: [registry.source] } });
      return workspace.withRegistry(
        Effect.gen(function* () {
          for (const source of ["@acme/skills/review", "@acme/knowledge/review"])
            yield* handleInstall({ source: Option.some(source), preview: false, force: false });
          workspace.rendererState.results.length = 0;
          yield* handleView({
            handle: "review",
            type: Option.some(row.type),
            field: Option.none(),
            registry: Option.none(),
          });
          expect(workspace.rendererState.results[0]?.data).toMatchObject({
            handle: `@acme/${row.plural}/${row.name}`,
            type: row.type,
            name: row.name,
          });
          expect(workspace.requests.map((request) => request.url)).toEqual([
            `${readRegistry}/v1/extensions/@acme/${row.plural}/${row.name}`,
          ]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              workspace.cleanup();
              registry.cleanup();
            }),
          ),
        ),
        () => ({ body: { ...readExtensionIndex, type: row.type, name: row.name } }),
      );
    });
  it.effect("uses configured identity despite a populated receipt for another owner", () => {
    const workspace = makeReadSpecWorkspace({
      settings: {
        sources: [{ type: "registry", name: "agentxm", location: readRegistry }],
        skills: { review: "@acme/skills/review" },
        lockfileSkills: {
          "stale-review": {
            type: "registry",
            owner: "@stale",
            name: "review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            publisherBindingId: "hbnd_stale",
          },
        },
      },
    });
    return workspace.withRegistry(
      Effect.gen(function* () {
        expect(workspace.readLockfileText()).toContain("@stale");
        yield* handleView({
          handle: "review",
          type: Option.some("skill"),
          field: Option.none(),
          registry: Option.none(),
        });
        expect(workspace.rendererState.results[0]?.data).toMatchObject({
          handle: "@acme/skills/review",
          type: "skill",
          name: "review",
        });
        expect(workspace.requests.map((request) => request.url)).toEqual([
          `${readRegistry}/v1/extensions/@acme/skills/review`,
        ]);
      }).pipe(Effect.ensuring(Effect.sync(() => workspace.cleanup()))),
      (request) => ({
        body: {
          ...readExtensionIndex,
          owner: request.url.includes("/@stale/") ? "@stale" : "@acme",
          name: "review",
        },
      }),
    );
  });
});
