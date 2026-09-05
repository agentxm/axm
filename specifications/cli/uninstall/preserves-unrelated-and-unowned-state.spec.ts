import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { handleInstall, handleUninstall } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/preserves-unrelated-and-unowned-state",
  title: "Uninstall preserves unrelated and unowned files",
  statement:
    "When an extension is uninstalled, AXM shall preserve unrelated workspace files, unowned agent configuration, and the original local source package.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: ["cli/every-type-completes-the-shared-lifecycle"],
  supersedes: ["cli/every-type-completes-the-shared-lifecycle"],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall preserves unowned state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect.each(localLifecycleRows)("preserves files surrounding a $label", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const name = `conformance-${row.label}`;
      const source = row.writePackage(workspace.root, { name });
      yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      const sourceContent = snapshotWorkspaceContent(source);
      fs.mkdirSync(path.join(workspace.root, ".claude/skills/hand-written"), { recursive: true });
      fs.writeFileSync(
        path.join(workspace.root, ".claude/skills/hand-written/SKILL.md"),
        "# Hand written\n",
      );
      fs.writeFileSync(path.join(workspace.root, "NOTES.md"), "unrelated project file\n");
      yield* handleUninstall({ source: `@acme/${row.plural}/${name}`, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile(".claude/skills/hand-written/SKILL.md")).toBe("# Hand written\n");
      expect(workspace.readFile("NOTES.md")).toBe("unrelated project file\n");
      expect(snapshotWorkspaceContent(source)).toEqual(sourceContent);
    }),
  );
});
