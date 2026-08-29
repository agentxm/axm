import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleUninstall } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makePackRetainedSkillWorkspace } from "../../support/reachability-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/removes-direct-route-and-recomputes-reachability",
  title: "Uninstall removes direct intent and keeps state another desired route still reaches",
  class: "functional",
  intents: ["extension-adoption", "workspace-intent-fidelity"],
  methods: ["example"],
  cases: {
    "removes-direct-route": "removes the direct workspace configuration route and its resolution",
    "removes-realized-state":
      "removes canonical content and agent projections nothing else desires",
    "preserves-other-extensions": "preserves other desired extensions and their realized state",
    "retains-pack-reached-state":
      "keeps the resolution, canonical content, and projection of a pack-reached extension",
  },
});

describe("Uninstall a directly desired extension", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const installLocalSkill = (workspace: ReturnType<typeof makeSpecWorkspace>, name: string) =>
    handleInstall({
      source: Option.some(writeLocalSkillPackage(workspace.root, { name })),
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  const uninstall = (workspace: ReturnType<typeof makeSpecWorkspace>, fqn: string) =>
    handleUninstall({ source: fqn, yes: true, preview: false }).pipe(
      Effect.provide(workspace.layer),
    );

  it.effect("removes the direct workspace configuration route and its resolution", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      yield* installLocalSkill(workspace, "code-review");

      yield* uninstall(workspace, "@acme/skills/code-review");

      expect(JSON.stringify(workspace.readSettings())).not.toContain("code-review");
      expect(workspace.readLockfileText()).not.toContain("code-review");
    }),
  );

  it.effect("removes canonical content and agent projections nothing else desires", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      yield* installLocalSkill(workspace, "code-review");
      expect(workspace.exists("agent_extensions/local/vendor/code-review/src/SKILL.md")).toBe(true);

      yield* uninstall(workspace, "@acme/skills/code-review");

      expect(workspace.exists("agent_extensions/local/vendor/code-review")).toBe(false);
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);
      expect(workspace.exists(".agents/skills/code-review")).toBe(false);
    }),
  );

  it.effect("preserves other desired extensions and their realized state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      yield* installLocalSkill(workspace, "code-review");
      yield* installLocalSkill(workspace, "release-notes");
      const projectedBefore = workspace.readFile(".claude/skills/release-notes/SKILL.md");

      yield* uninstall(workspace, "@acme/skills/code-review");

      expect(workspace.readSettings()).toMatchObject({
        skills: { "release-notes": "./vendor/release-notes" },
      });
      expect(workspace.readLockfileText()).toContain("release-notes");
      expect(workspace.readFile(".claude/skills/release-notes/SKILL.md")).toBe(projectedBefore);
      expect(workspace.exists("agent_extensions/local/vendor/release-notes/src/SKILL.md")).toBe(
        true,
      );
    }),
  );

  it.effect(
    "keeps the resolution, canonical content, and projection of a pack-reached extension",
    () =>
      Effect.gen(function* () {
        const { workspace, skillFqn, canonicalSkillPath, projectionPath } =
          makePackRetainedSkillWorkspace();
        cleanups.push(workspace.cleanup);

        yield* handleUninstall({ source: skillFqn, yes: true, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        const settingsText = JSON.stringify(workspace.readSettings());
        expect(settingsText).not.toContain("skills/review-helper");
        expect(settingsText).toContain("review-pack");
        expect(workspace.readLockfileText()).toContain("review-helper");
        expect(workspace.exists(canonicalSkillPath)).toBe(true);
        expect(workspace.exists(projectionPath)).toBe(true);

        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({ result: { outcome: "applied" } });
        expect(JSON.stringify(entry?.data)).toContain("retained");
      }),
  );
});
