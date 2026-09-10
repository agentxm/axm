import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManifestIdentitySchema } from "@agentxm/extension-content";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ShowExtension } from "./show/show-extension.js";
import {
  AUTHORING_TYPES,
  authoredManifestPath,
  makeAuthoredExtensionFixture,
  type AuthoringType,
} from "./testing.js";
import {
  installRegistrySkill,
  makeFileRegistry,
  makeInstalledWorkspace,
} from "./test-support/installed-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/type-shows-report-source-and-version",
  title: "Type inspection distinguishes source and observed version",
  statement:
    "When inspecting one configured skill, MCP server, subagent, rule, hook, or Knowledge bundle, AXM shall report its local identity, activation, source, and version from the accepted resolution, or from the matching authored manifest when no resolution exists.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/shared/extension-show.test.ts",
    "packages/core/workspace-inspection/src/show/show-extension.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Packs report membership rather than a single source; `packs show` covers them. */
const shownTypes: ReadonlyArray<Exclude<AuthoringType, "pack">> = AUTHORING_TYPES.filter(
  (type): type is Exclude<AuthoringType, "pack"> => type !== "pack",
);

describe("Installed extension detail", () => {
  // No resolution exists for an authored package, so the version reported must
  // come from the manifest on disk. The expectation reads that manifest back
  // rather than restating a literal, so a report that stopped consulting it
  // fails here instead of agreeing with the fixture.
  for (const type of shownTypes)
    it.effect(`authored ${type}`, () => {
      const fixture = makeAuthoredExtensionFixture(type);
      const manifest = Schema.decodeUnknownSync(ManifestIdentitySchema)(
        JSON.parse(fixture.readFile(authoredManifestPath(type, "example"))),
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* ShowExtension.query({ type, name: "example" });
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
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });

  // The arrangement is an installation, not a lockfile written by hand: the
  // source and version below are what installing recorded, so this example
  // fails if a shown extension ever stops reporting what it was installed from.
  it.effect("reports an installation's accepted version", () => {
    const registry = makeFileRegistry();
    registry.publishSkill("review", [{ version: "1.2.3", body: "Review instructions." }]);
    const workspace = makeInstalledWorkspace({ sources: [registry.source] });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* installRegistrySkill({ name: "review", source: "agentxm:@acme/skills/review" });
          const result = yield* ShowExtension.query({ type: "skill", name: "review" });
          expect(result.item).toMatchObject({
            name: "review",
            source: "agentxm:@acme/skills/review",
            version: "1.2.3",
            locked: true,
          });
        }),
      )
      .pipe(
        Effect.ensuring(
          Effect.sync(() => {
            workspace.cleanup();
            registry.cleanup();
          }),
        ),
      );
  });
});
