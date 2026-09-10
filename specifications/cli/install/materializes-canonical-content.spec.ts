import * as path from "node:path";
import { unzipSync } from "fflate";
import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/install/materializes-canonical-content",
  title: "Installing an extension places its source content in the workspace",
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
      const workspace = makeSpecWorkspace({ storage: "memory" });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace, { name: "code-review" });
      expect(workspace.exists("agent_extensions")).toBe(false);

      yield* workspace.provide(
        handleInstall({
          source: Option.some(skillPackage),
          force: false,
          preview: false,
        }),
      );

      expect(workspace.snapshotTree("agent_extensions")).toContain(CANONICAL_SKILL_DOCUMENT);
      expect(workspace.readFile(CANONICAL_SKILL_DOCUMENT)).toContain("# code-review");
    }),
  );
  it.effect.each(localLifecycleRows)("materializes the source content for a local $label", (row) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ storage: "memory" });
      cleanups.push(workspace.cleanup);
      const name = `conformance-${row.label}`;
      const source = row.writePackage(workspace, { name });
      yield* workspace.provide(
        handleInstall({ source: Option.some(source), force: false, preview: false }),
      );
      const relativeContent = row.canonicalFile(name);
      expect(workspace.readFile(`agent_extensions/local/vendor/${name}/${relativeContent}`)).toBe(
        workspace.readFile(`vendor/${name}/${relativeContent}`),
      );
    }),
  );
  it.effect("materializes exactly the regular file bytes of the selected Registry archive", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        storage: "memory",
        userSettings: {},
      });
      cleanups.push(workspace.cleanup);
      const registry = makeSpecRegistry(workspace);
      cleanups.push(registry.cleanup);
      registry.writeSkill("registry-review", [
        { version: "1.2.3", body: "Registry guidance with café and Ω.\n" },
      ]);
      workspace.writeSettings({
        ...workspace.readSettingsRecord(),
        sources: [registry.source],
      });
      const archivePath = path.join(
        registry.root,
        "extensions/@acme/skills/registry-review/1.2.3.zip",
      );
      // An independent ZIP reader supplies the oracle, not AXM's extraction helper.
      const archiveEntries = unzipSync(registry.files.readFile(archivePath));
      expect(Object.keys(archiveEntries).sort()).toEqual(["skill.json", "src/SKILL.md"]);
      const expected = Object.fromEntries([
        [
          "skill.json",
          `file:${Buffer.from(archiveEntries["skill.json"] ?? []).toString("base64")}`,
        ],
        ["src", "directory"],
        [
          "src/SKILL.md",
          `file:${Buffer.from(archiveEntries["src/SKILL.md"] ?? []).toString("base64")}`,
        ],
      ]);
      yield* workspace.provide(
        handleInstall({
          source: Option.some("@acme/skills/registry-review@1.2.3"),
          force: false,
          preview: false,
        }),
      );
      expect(
        workspace.snapshotContent("agent_extensions/agentxm/@acme/skills/registry-review"),
      ).toEqual(expected);
    }),
  );
});
