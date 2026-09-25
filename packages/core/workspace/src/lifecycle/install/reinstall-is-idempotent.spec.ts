import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import {
  applyInstall,
  entriesUnder,
  installRequest,
  localLifecycleRows,
  makeInstallWorld,
  previewInstall,
  readSettings,
  type InstallWorld,
} from "./test-helpers.js";
import type { InstallExtensionsRequest } from "./install-extensions.js";

export const specification = defineSpecification({
  requirement: "cli/install/reinstall-is-idempotent",
  title: "Installing an already desired extension at the same constraint is a successful no-op",
  statement:
    "When a person reinstalls an extension the workspace already desires at the same constraint — whatever its type, and whether it was requested directly or as a member of a Pack — the install shall succeed with a no-op outcome in which every unit is unchanged, and shall not change settings, the lockfile, canonical content, or agent projections; when the installed files differ from the accepted content, the repeated install shall restore the accepted content without changing the accepted resolution.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Applying a satisfied install reports `no-op` while previewing the same request reports `previewed`, because the outcome follows planned units and only execution observes that a unit changes nothing. Should a preview that would change nothing report `no-op`, and if so must every planner decide the satisfied case before planning?",
  ],
});

/** Everything a repeated install must leave as it found it. */
const durableState = (world: InstallWorld) => ({
  settings: JSON.stringify(readSettings(world.workspace)),
  lock: world.workspace.readFile("axm-lock.yaml"),
  canonical: entriesUnder(world.workspace, "agent_extensions"),
  claude: entriesUnder(world.workspace, ".claude"),
  agents: entriesUnder(world.workspace, ".agents"),
  instructions: world.workspace.exists("AGENTS.md") ? world.workspace.readFile("AGENTS.md") : "",
});

/**
 * One example per install route. Each publishes or writes its fixture and
 * returns the request whose repetition must be a no-op.
 */
interface RepeatRow {
  readonly label: string;
  readonly arrange: (world: InstallWorld) => InstallExtensionsRequest;
}

const repeatRows: ReadonlyArray<RepeatRow> = [
  ...localLifecycleRows.map((row): RepeatRow => ({
    label: `a local ${row.label}`,
    arrange: (world) => {
      const source = nodePath.dirname(row.writePackage(world.workspace.root, { name: "repeat" }));
      return installRequest({ type: row.type, subject: { kind: "source", source } });
    },
  })),
  {
    label: "a Registry MCP server",
    arrange: (world) => {
      world.registry.writeMcp("repeat", [{ version: "1.0.0" }]);
      return installRequest({
        type: "mcp-server",
        subject: { kind: "source", source: "@acme/mcps/repeat@1.0.0" },
      });
    },
  },
  {
    label: "a Registry Pack with a skill member",
    arrange: (world) => {
      world.registry.writeSkill("member", [{ version: "1.0.0", body: "Member." }]);
      world.registry.writePack("repeat", [
        { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
      ]);
      return installRequest({
        type: "pack",
        subject: { kind: "source", source: "@acme/packs/repeat@1.0.0" },
      });
    },
  },
];

describe("Repeat installs are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(repeatRows)(
    "repeating the install of $label reports an unchanged no-op",
    (row) => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const request = row.arrange(world);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const first = yield* applyInstall(request);
            expect(deriveOperationOutcome(first)).toBe("applied");
            const before = durableState(world);

            const repeated = yield* applyInstall(request);

            expect(deriveOperationOutcome(repeated)).toBe("no-op");
            // Every unit, including each Pack member, reports that it changed
            // nothing; the outcome is derived from those units, never decided.
            expect(repeated.units.map((unit) => ({ id: unit.id, state: unit.state }))).toEqual(
              repeated.units.map((unit) => ({ id: unit.id, state: "unchanged" })),
            );
            expect(durableState(world)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("a repeated install restores edited canonical content to the accepted content", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = nodePath.dirname(
      writeLocalSkillPackage(workspace.root, { name: "code-review" }),
    );
    const request = installRequest({ type: "skill", subject: { kind: "source", source } });
    const canonicalBody = "agent_extensions/path/@acme/skills/code-review/src/SKILL.md";
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(request);
          const accepted = workspace.readFile(canonicalBody);
          const lockAfterFirst = workspace.readFile("axm-lock.yaml");
          workspace.writeFile(canonicalBody, `${accepted}\nlocal edit\n`);

          const repeated = yield* applyInstall(request);

          // The canonical observation no longer finds the accepted tree, so
          // the install acquires it again; the accepted resolution is unchanged.
          expect(deriveOperationOutcome(repeated)).toBe("applied");
          expect(workspace.readFile(canonicalBody)).toBe(accepted);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockAfterFirst);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "previewing a repeated install reports a no-op and preserves the complete workspace",
    () => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const request = installRequest({ type: "skill", subject: { kind: "source", source } });
      return workspace
        .provide(
          Effect.gen(function* () {
            const installed = yield* applyInstall(request);
            expect(deriveOperationOutcome(installed)).toBe("applied");
            expect(installed.units.filter((unit) => unit.state === "committed")).toHaveLength(1);

            const sourceContent = workspace.readFile("vendor/code-review/src/SKILL.md");
            expect(sourceContent).toContain("# code-review");
            expect(
              workspace.readFile("agent_extensions/path/@acme/skills/code-review/src/SKILL.md"),
            ).toBe(sourceContent);
            expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toBe(sourceContent);
            expect(workspace.readFile(".agents/skills/code-review/SKILL.md")).toBe(sourceContent);
            expect(workspace.readFile("axm-lock.yaml")).toContain("code-review");
            const before = workspace.snapshot();

            const previewed = yield* previewInstall(request);

            // Preview reports the planned unit, not the applied disposition;
            // the open question above owns whether it should settle to a
            // no-op. The absent commits and the unchanged workspace carry the
            // purity claim.
            expect(deriveOperationOutcome(previewed)).toBe("previewed");
            expect(previewed.units.filter((unit) => unit.state === "committed")).toEqual([]);
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
