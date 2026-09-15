import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  makeSyncFixture,
  writeLocalSkillPackage,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/removes-obsolete-storage-root-links",
  title: "Sync removes obsolete agent skill links into AXM storage",
  statement:
    "When an agent skill-folder symbolic link resolves inside a current AXM storage root and no desired route expects it, including when its target is missing, sync shall remove the link, and sync shall not remove or rewrite a symbolic link whose target lies outside every current AXM storage root.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/sync/preserves-unowned-agent-content"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const CONTAINER = ".claude/skills";

const isLink = (workspace: SyncFixture, relative: string): boolean => {
  try {
    return fs.lstatSync(nodePath.join(workspace.root, relative)).isSymbolicLink();
  } catch {
    return false;
  }
};

const link = (workspace: SyncFixture, name: string, target: string): string => {
  const at = nodePath.join(workspace.root, CONTAINER, name);
  fs.mkdirSync(nodePath.dirname(at), { recursive: true });
  fs.symlinkSync(target, at);
  return `${CONTAINER}/${name}`;
};

describe("Sync removes obsolete storage-root links", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = (settings: Readonly<Record<string, unknown>> = {}): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: ["claude-code"], ...settings },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("desired: a link desired state expects stays", () => {
    const workspace = fixture({ skills: { "code-review": "./vendor/code-review" } });
    writeLocalSkillPackage(workspace.root, { name: "code-review" });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const projection = `${CONTAINER}/code-review`;
          expect(workspace.exists(`${projection}/SKILL.md`)).toBe(true);
          const before = workspace.snapshot();
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("obsolete, target present: removes the link and keeps its target", () => {
    const workspace = fixture();
    workspace.writeFile("skills/retired/SKILL.md", "# Retired\n");
    const obsolete = link(workspace, "retired", nodePath.join(workspace.root, "skills/retired"));
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(isLink(workspace, obsolete)).toBe(false);
          expect(workspace.readFile("skills/retired/SKILL.md")).toBe("# Retired\n");
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("obsolete, target missing: removes the dangling link", () => {
    const workspace = fixture();
    const obsolete = link(workspace, "gone", "../../agent_extensions/agentxm/@acme/skills/gone");
    return workspace
      .provide(
        Effect.gen(function* () {
          expect(isLink(workspace, obsolete)).toBe(true);
          yield* applySync();
          expect(isLink(workspace, obsolete)).toBe(false);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("target in an old or unknown location: leaves the link untouched", () => {
    const workspace = fixture();
    const outside = fs.mkdtempSync(
      nodePath.join(nodePath.dirname(workspace.root), "axm-elsewhere-"),
    );
    cleanups.push(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.writeFileSync(nodePath.join(outside, "SKILL.md"), "# Elsewhere\n");
    workspace.writeFile(".axm/extensions/skills/legacy/SKILL.md", "# Legacy\n");
    const legacy = link(
      workspace,
      "legacy",
      nodePath.join(workspace.root, ".axm/extensions/skills/legacy"),
    );
    const elsewhere = link(workspace, "elsewhere", outside);
    const missingElsewhere = link(workspace, "vanished", nodePath.join(outside, "vanished"));
    const before = workspace.snapshot();
    return workspace
      .provide(
        Effect.gen(function* () {
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          expect(isLink(workspace, legacy)).toBe(true);
          expect(isLink(workspace, elsewhere)).toBe(true);
          expect(isLink(workspace, missingElsewhere)).toBe(true);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
