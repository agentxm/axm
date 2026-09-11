import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { workspaceWithAuthoredExtension } from "../activation/test-helpers.js";
import { applyInstall, installRequest } from "../install/test-helpers.js";
import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalHookPackage,
  writeLocalKnowledgePackage,
  writeLocalRulePackage,
  writeLocalSkillPackage,
  writeLocalSubagentPackage,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { applyUninstall, uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/preserves-unrelated-and-unowned-state",
  title: "Uninstall preserves unrelated and unowned files",
  statement:
    "When an extension is uninstalled, AXM shall preserve unrelated workspace files, unowned agent configuration, and the original local or workspace-authored source package.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/every-type-completes-the-shared-lifecycle",
    "cli/mcps/uninstall/preserves-unowned-native-entries",
  ],
  supersedes: [
    "cli/every-type-completes-the-shared-lifecycle",
    "cli/mcps/uninstall/preserves-unowned-native-entries",
  ],
  assumptions: [],
  openQuestions: [],
});

/** Every file under a directory, so "untouched" can be shown rather than claimed. */
const snapshotContent = (base: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      entries.push([nodePath.relative(base, absolute), fs.readFileSync(absolute, "utf8")]);
    }
  };
  walk(base);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};

/** One row per extension type acquired from a local directory. */
interface PreservationRow {
  readonly label: string;
  readonly type: InstallableExtensionType;
  readonly writePackage: (root: string, fixture: { readonly name: string }) => string;
}

const rows: ReadonlyArray<PreservationRow> = [
  { label: "skill", type: "skill", writePackage: writeLocalSkillPackage },
  { label: "subagent", type: "subagent", writePackage: writeLocalSubagentPackage },
  { label: "rule", type: "rule", writePackage: writeLocalRulePackage },
  { label: "hook", type: "hook", writePackage: writeLocalHookPackage },
  { label: "knowledge bundle", type: "knowledge", writePackage: writeLocalKnowledgePackage },
];

describe("Uninstall preserves unowned state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (): { workspace: LifecycleFixture; registry: LifecycleRegistry } => {
    const registry = makeLifecycleRegistry();
    cleanups.push(registry.cleanup);
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: { agents: ["claude-code"], sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    return { workspace, registry };
  };

  /** Files a person put in the workspace that AXM never claimed. */
  const writeUnrelatedFiles = (workspace: LifecycleFixture): void => {
    fs.mkdirSync(nodePath.join(workspace.root, ".claude/skills/hand-written"), {
      recursive: true,
    });
    fs.writeFileSync(
      nodePath.join(workspace.root, ".claude/skills/hand-written/SKILL.md"),
      "# Hand written\n",
    );
    fs.writeFileSync(nodePath.join(workspace.root, "NOTES.md"), "unrelated project file\n");
  };

  it.effect.each(rows)("preserves files surrounding a $label", ({ type, label, writePackage }) => {
    const { workspace } = world();
    const name = `conformance-${label.split(" ")[0] ?? label}`;
    const source = writePackage(workspace.root, { name });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));
          const sourceContent = snapshotContent(source);
          writeUnrelatedFiles(workspace);

          yield* applyUninstall(uninstallRequest({ type, selector: name }));

          expect(workspace.readFile(".claude/skills/hand-written/SKILL.md")).toBe(
            "# Hand written\n",
          );
          expect(workspace.readFile("NOTES.md")).toBe("unrelated project file\n");
          expect(snapshotContent(source)).toEqual(sourceContent);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "removes workspace-authored intent while preserving every authored package byte",
    () => {
      const workspace = workspaceWithAuthoredExtension({
        type: "skill",
        name: "review",
        enabled: true,
      });
      cleanups.push(workspace.cleanup);
      const source = nodePath.join(workspace.root, "skills", "review");
      fs.writeFileSync(nodePath.join(source, "author-notes.md"), "Authored notes survive.\n");
      const before = snapshotContent(source);
      return workspace
        .provide(
          Effect.gen(function* () {
            expect(workspace.readFile("axm.json")).toContain("review");

            yield* applyUninstall(uninstallRequest({ type: "skill", selector: "review" }));

            expect(workspace.readFile("axm.json")).not.toContain('"review"');
            expect(snapshotContent(source)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "removing an MCP connection withdraws its own native entry and leaves every unowned one",
    () => {
      const { workspace, registry } = world();
      registry.writeMcp("demo", [{ version: "1.0.0" }]);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "@acme/mcps/demo" },
              }),
            );

            // Someone else's server, written straight into the agent's own
            // configuration file beside the one AXM projected.
            const configPath = nodePath.join(workspace.root, ".mcp.json");
            const config: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"));
            if (typeof config !== "object" || config === null || !("mcpServers" in config)) {
              throw new Error("Expected .mcp.json with an mcpServers map");
            }
            const servers = config.mcpServers;
            if (typeof servers !== "object" || servers === null) {
              throw new Error("Expected the mcpServers map to be an object");
            }
            fs.writeFileSync(
              configPath,
              `${JSON.stringify(
                {
                  ...config,
                  mcpServers: { ...servers, keep: { command: "node", args: ["keep.js"] } },
                },
                null,
                2,
              )}\n`,
            );

            yield* applyUninstall(uninstallRequest({ type: "mcp-server", selector: "demo" }));

            expect(workspace.readFile("axm.json")).not.toContain('"demo"');
            const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
            expect(nativeConfig).toMatchObject({
              mcpServers: { keep: { command: "node", args: ["keep.js"] } },
            });
            expect(JSON.stringify(nativeConfig)).not.toContain('"demo"');
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
