/**
 * The reconciliation witness for `cli/unreadable-knowledge-is-left-out-and-reported`.
 *
 * The specification lives in
 * `packages/core/extension-lifecycle/src/knowledge/unreadable-knowledge-is-left-out-and-reported.spec.ts`,
 * where the removal that first surfaces the omission runs. Its statement
 * obliges every command that writes or inspects the instructions file to
 * report the omission; a reconciliation is one of them, and a lifecycle
 * package may not import this feature, so that row runs here.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { applySync, expectResolved, makeSyncFixture } from "./test-helpers.js";

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

  it.effect("reports the omission rather than dropping the file from its report", () => {
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
          const canonical = workspace
            .snapshot()
            .map(([relative]) => relative)
            .find(
              (relative) =>
                relative.startsWith("agent_extensions") &&
                relative.endsWith(`${nodePath.sep}other-notes`),
            );
          if (canonical === undefined) throw new Error("No canonical package for other-notes");
          fs.writeFileSync(
            nodePath.join(workspace.root, canonical, "src", "index.md"),
            `---\ndescription: "no format version"\n---\n\n# other-notes\n`,
          );

          const resolution = expectResolved(yield* applySync());

          // The reconciliation keeps naming the bundle it could not render
          // rather than dropping it silently from its report.
          expect(JSON.stringify(resolution)).toContain("other-notes");
          expect(workspace.readFile("AGENTS.md")).not.toContain("# other-notes");
          expect(workspace.readFile("AGENTS.md")).toContain("# Authored instructions");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
