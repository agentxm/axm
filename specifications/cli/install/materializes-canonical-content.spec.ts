import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/install/materializes-canonical-content",
  title: "Install materializes the extension's canonical content inside the workspace",
  statement:
    "When a person installs an acquirable extension, the install command shall materialize the extension's canonical content inside the workspace's managed extension tree.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [],
  openQuestions: [],
});

const CANONICAL_SKILL_DOCUMENT = "agent_extensions/local/vendor/code-review/src/SKILL.md";

describe("Install materializes canonical content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("materializes canonical extension content inside the workspace", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      expect(workspace.exists("agent_extensions")).toBe(false);

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.snapshotTree("agent_extensions")).toContain(CANONICAL_SKILL_DOCUMENT);
      expect(workspace.readFile(CANONICAL_SKILL_DOCUMENT)).toContain("# code-review");
    }),
  );
  it.effect.each(localLifecycleRows)("materializes the source content for a local $label", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const name = `conformance-${row.label}`;
      const source = row.writePackage(workspace.root, { name });
      yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      const relativeContent = row.canonicalFile(name);
      expect(workspace.readFile(`agent_extensions/local/vendor/${name}/${relativeContent}`)).toBe(
        workspace.readFile(`vendor/${name}/${relativeContent}`),
      );
    }),
  );
  it.effect("materializes exactly the regular file bytes of the selected Registry archive", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("registry-review", [
        { version: "1.2.3", body: "Registry guidance with café and Ω.\n" },
      ]);
      const archive = path.join(registry.root, "extensions/@acme/skills/registry-review/1.2.3.zip");
      // An independent ZIP reader supplies the oracle, not AXM's extraction helper.
      const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
        .trim()
        .split("\n");
      expect(entries.filter((entry) => !entry.endsWith("/")).sort()).toEqual([
        "skill.json",
        "src/SKILL.md",
      ]);
      const expected = Object.fromEntries(
        entries.map((relative): readonly [string, string] =>
          relative.endsWith("/")
            ? [relative.slice(0, -1), "directory"]
            : [
                relative,
                `file:${execFileSync("unzip", ["-p", archive, relative]).toString("base64")}`,
              ],
        ),
      );
      const workspace = makeSpecWorkspace({
        userSettings: {},
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some("@acme/skills/registry-review@1.2.3"),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(
        snapshotWorkspaceContent(
          path.join(workspace.root, "agent_extensions/agentxm/@acme/skills/registry-review"),
        ),
      ).toEqual(expected);
    }),
  );
});
