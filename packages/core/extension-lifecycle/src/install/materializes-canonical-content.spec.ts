import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { unzipSync } from "fflate";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import {
  applyInstall,
  entriesUnder,
  installRequest,
  localLifecycleRows,
  makeInstallWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/materializes-canonical-content",
  title: "Installing an extension places its source content in the workspace",
  statement:
    "When a person installs an acquirable extension, the install shall materialize the extension's canonical content inside the workspace's managed extension tree.",
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
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("materializes canonical extension content inside the workspace", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    expect(workspace.exists("agent_extensions")).toBe(false);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );

          expect(entriesUnder(workspace, "agent_extensions")).toContain(CANONICAL_SKILL_DOCUMENT);
          expect(workspace.readFile(CANONICAL_SKILL_DOCUMENT)).toContain("# code-review");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(localLifecycleRows)(
    "materializes the source content for a local $label",
    ({ type, label, writePackage, canonicalFile }) => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const name = `conformance-${label}`;
      const source = writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));

            const relative = canonicalFile(name);
            expect(workspace.readFile(`agent_extensions/local/vendor/${name}/${relative}`)).toBe(
              workspace.readFile(`vendor/${name}/${relative}`),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("materializes exactly the regular file bytes of the selected Registry archive", () => {
    const { workspace, registry, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    registry.writeSkill("registry-review", [
      { version: "1.2.3", body: "Registry guidance with café and Ω.\n" },
    ]);
    const archivePath = nodePath.join(
      registry.root,
      "extensions/@acme/skills/registry-review/1.2.3.zip",
    );
    // An independent ZIP reader supplies the oracle, not AXM's extraction helper.
    const archiveEntries = unzipSync(fs.readFileSync(archivePath));
    expect(Object.keys(archiveEntries).sort()).toEqual(["skill.json", "src/SKILL.md"]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "@acme/skills/registry-review@1.2.3" },
            }),
          );

          const canonical = nodePath.join(
            workspace.root,
            "agent_extensions/agentxm/@acme/skills/registry-review",
          );
          for (const [entry, bytes] of Object.entries(archiveEntries)) {
            expect(fs.readFileSync(nodePath.join(canonical, entry))).toEqual(Buffer.from(bytes));
          }
          expect(
            entriesUnder(workspace, "agent_extensions/agentxm/@acme/skills/registry-review")
              .filter((relative) => relative.endsWith(".md") || relative.endsWith(".json"))
              .map((relative) =>
                relative.replace("agent_extensions/agentxm/@acme/skills/registry-review/", ""),
              )
              .sort(),
          ).toEqual(["skill.json", "src/SKILL.md"]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
