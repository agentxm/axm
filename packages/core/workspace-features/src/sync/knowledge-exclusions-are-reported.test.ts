/**
 * Sync witness for `cli/unreadable-knowledge-is-left-out-and-reported`:
 * present acquired drift blocks the unsafe closure and preserves its files.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { WorkspaceSyncFailed } from "@agentxm/workspace-kernel/reconciliation";
import { applySync, makeSyncFixture } from "../testing/sync-fixture.js";

/** A local Knowledge package under `<root>/vendor/<name>`, as a source to acquire. */
const writeLocalKnowledgePackage = (root: string, name: string): string => {
  const packageRoot = nodePath.join(root, "vendor", name);
  const description = `The ${name} knowledge bundle.`;
  fs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(packageRoot, "knowledge.json"),
    `${JSON.stringify({
      $schema: "https://axm.sh/schemas/knowledge.schema.json",
      owner: "@acme",
      type: "knowledge",
      name,
      version: "1.0.0",
      description,
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    })}\n`,
  );
  fs.writeFileSync(
    nodePath.join(packageRoot, "src", "index.md"),
    `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${name}\n`,
  );
  return packageRoot;
};

describe("Reconciliation reports an unreadable Knowledge bundle", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports present drift and preserves files until explicit restoration", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: [],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        knowledge: {
          "alpha-notes": "./vendor/alpha-notes",
          "other-notes": "./vendor/other-notes",
        },
      },
      files: { "AGENTS.md": "# Authored instructions\n" },
    });
    cleanups.push(workspace.cleanup);
    for (const name of ["alpha-notes", "other-notes"]) {
      writeLocalKnowledgePackage(workspace.root, name);
    }

    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.readFile("AGENTS.md")).toContain("other-notes");

          // The acquired copy of one bundle loses its format version: AXM can
          // no longer read it, and so cannot publish it into AGENTS.md.
          const canonical = Object.keys(workspace.snapshot()).find(
            (relative) =>
              relative.startsWith("agent_extensions") &&
              relative.endsWith(`${nodePath.sep}other-notes`),
          );
          if (canonical === undefined) throw new Error("No canonical package for other-notes");
          fs.writeFileSync(
            nodePath.join(workspace.root, canonical, "src", "index.md"),
            `---\ndescription: "no format version"\n---\n\n# other-notes\n`,
          );

          const before = workspace.snapshot();
          const refusal = yield* applySync().pipe(Effect.flip);
          expect(refusal).toBeInstanceOf(WorkspaceSyncFailed);
          if (refusal instanceof WorkspaceSyncFailed) {
            expect(refusal.detail).toContain("other-notes");
            expect(refusal.detail).toContain("repeat its install to restore accepted content");
          }
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
