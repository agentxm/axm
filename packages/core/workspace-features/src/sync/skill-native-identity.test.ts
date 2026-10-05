import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { applySync, expectResolved, makeSyncFixture } from "../testing/sync-fixture.js";

const body = "---\nname: review\n---\n# Review\n";
const files = {
  "skills/review-package/skill.json": JSON.stringify({
    owner: "@acme",
    name: "review-package",
    type: "skill",
    version: "1.0.0",
  }),
  "skills/review-package/src/SKILL.md": body,
};
const settings = {
  owner: "@acme",
  agents: ["claude-code"],
  skills: { "review-package": "workspace" },
};

describe("Native skill identity through reconciliation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "disables, enables and renames outputs by their owning package",
    () => {
      const workspace = makeSyncFixture({ settings, files });
      cleanups.push(workspace.cleanup);
      return Effect.gen(function* () {
        expect(deriveOperationOutcome(expectResolved(yield* workspace.provide(applySync())))).toBe(
          "applied",
        );
        workspace.writeSettings({
          ...settings,
          skills: { "review-package": { source: "workspace", enabled: false } },
        });
        yield* workspace.provide(applySync());
        expect(workspace.exists(".claude/skills/review")).toBe(false);
        expect(workspace.exists("skills/review-package/src/SKILL.md")).toBe(true);
        workspace.writeSettings(settings);
        yield* workspace.provide(applySync());
        expect(workspace.exists(".claude/skills/review/SKILL.md")).toBe(true);
        workspace.writeFile(
          "skills/review-package/src/SKILL.md",
          body.replace("name: review", "name: inspect"),
        );
        const renamed = expectResolved(yield* workspace.provide(applySync()));
        expect(deriveOperationOutcome(renamed), JSON.stringify(renamed)).toBe("applied");
        expect(workspace.exists(".claude/skills/review")).toBe(false);
        expect(workspace.exists(".agents/skills/review")).toBe(false);
        expect(workspace.exists(".claude/skills/inspect/SKILL.md")).toBe(true);
        expect((yield* workspace.provide(applySync()))._tag).toBe("AlreadyReconciled");
        workspace.writeSettings({
          ...settings,
          skills: { "review-package": { source: "workspace", enabled: false } },
        });
        yield* workspace.provide(applySync());
        expect(workspace.exists(".claude/skills/inspect")).toBe(false);
        expect(workspace.exists("skills/review-package/src/SKILL.md")).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer));
    },
    30_000,
  );

  it.effect("protects an unowned destination with the declared skill name", () => {
    const workspace = makeSyncFixture({
      settings,
      files: { ...files, ".claude/skills/review/SKILL.md": "# User-owned\n" },
    });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const result = expectResolved(yield* workspace.provide(applySync()));
      expect(deriveOperationOutcome(result)).not.toBe("applied");
      expect(workspace.readFile(".claude/skills/review/SKILL.md")).toBe("# User-owned\n");
      expect(workspace.readFile("skills/review-package/src/SKILL.md")).toBe(body);
    }).pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("protects different packages that declare the same skill name", () => {
    const workspace = makeSyncFixture({
      settings: { ...settings, skills: { ...settings.skills, other: "workspace" } },
      files: {
        ...files,
        "skills/other/skill.json": JSON.stringify({
          owner: "@acme",
          name: "other",
          type: "skill",
          version: "1.0.0",
        }),
        "skills/other/src/SKILL.md": body + "Different content\n",
      },
    });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const result = expectResolved(yield* workspace.provide(applySync()));
      expect(deriveOperationOutcome(result)).not.toBe("applied");
      expect(workspace.readFile("skills/review-package/src/SKILL.md")).toBe(body);
      expect(workspace.readFile("skills/other/src/SKILL.md")).toBe(body + "Different content\n");
    }).pipe(Effect.provide(NodeServices.layer));
  });
});
