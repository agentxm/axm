import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";
import { handlePacksShow, PackShowResultSchema, handleInstall } from "axm.sh/specification-harness";
import { makeReadSpecWorkspace } from "../../../support/read-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";
import { makePackEditingFixture } from "../../../support/pack-editing-fixture.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/packs/show/reports-authored-membership-and-observed-state",
  title: "Pack inspection reports declared members and observed state",
  statement:
    "When inspecting a configured pack, AXM shall report the pack\u2019s source authority, canonical manifest, declared member constraints, and desired dependency reachability.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "packages/cli/src/root/packs/show.ts",
    "packages/cli-e2e/src/scope-consistency.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The current pack result reports member version as null and derives reachability from desired graph presence. Should future inspection distinguish desired membership from verified installed member resolution and exclusions?",
  ],
});

describe("Pack state inspection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const target of ["toolkit", "@acme/packs/toolkit"])
    it.effect(target, () =>
      Effect.gen(function* () {
        const { workspace } = yield* makePackEditingFixture(cleanups);
        const before = snapshotWorkspaceContent(workspace.root);
        yield* handlePacksShow(target).pipe(Effect.provide(workspace.layer));
        const result = Schema.decodeUnknownSync(Schema.toType(PackShowResultSchema))(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(result).toMatchObject({
          scope: "project",
          pack: "@acme/packs/toolkit",
          sourceAuthority: "workspace",
          manifestVersion: "0.0.1",
          acceptedResolution: "authored",
          desiredDependencies: expect.arrayContaining([
            expect.objectContaining({
              fqn: "@acme/skills/review",
              constraint: ">=1.2.3",
              reachability: "satisfying",
            }),
            expect.objectContaining({
              fqn: "@acme/skills/test-helper",
              constraint: ">=1.2.3",
              reachability: "satisfying",
            }),
          ]),
        });
        expect(result.canonicalPath).toBe(`${workspace.root}/packs/toolkit/pack.json`);
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
    );
  it.effect("reports a Registry pack’s accepted resolution", () => {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writePack("toolkit", [{ version: "2.3.4", dependencies: {} }]);
    const workspace = makeReadSpecWorkspace({ settings: { sources: [registry.source] } });
    cleanups.push(workspace.cleanup);
    return workspace.provide(
      Effect.gen(function* () {
        yield* handleInstall({
          source: Option.some("@acme/packs/toolkit@2.3.4"),
          preview: false,
          force: false,
        });
        yield* handlePacksShow("@acme/packs/toolkit");
        const result = Schema.decodeUnknownSync(Schema.toType(PackShowResultSchema))(
          workspace.rendererState.results.at(-1)?.data,
        );
        expect(result).toMatchObject({
          pack: "@acme/packs/toolkit",
          sourceAuthority: "registry",
          acceptedResolution: "accepted",
          manifestVersion: "2.3.4",
          desiredDependencies: [],
        });
        expect(result.canonicalPath).toBe(
          `${workspace.root}/agent_extensions/agentxm/@acme/packs/toolkit/pack.json`,
        );
      }),
    );
  });
});
