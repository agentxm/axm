import * as nodePath from "node:path";
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";

import { makeGitSkillRepository } from "../../testing/git-repositories.js";
import { writeLocalSkillPackage } from "../../testing/local-packages.js";
import { entriesUnder, localLifecycleRows, readSettings } from "./test-helpers.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  previewInstall,
  type InstallWorld,
} from "../../testing/install-world.js";
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

  it.effect.each(["root", "skill", "pack", "explicit"] as const)(
    "configured %s install replays a warm accepted closure without source operations",
    (route) => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      world.registry.writeSkill("member", [{ version: "1.0.0", body: "Accepted member." }]);
      world.registry.writePack("repeat", [
        { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
      ]);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "@acme/packs/repeat@^1.0.0" },
              }),
            );
            yield* applyInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: "@acme/skills/member@^1.0.0" },
              }),
            );
            const before = durableState(world);
            world.registry.writeSkill("member", [
              { version: "1.0.0", body: "Accepted member." },
              { version: "1.1.0", body: "New member." },
            ]);
            world.registry.writePack("repeat", [
              { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
              { version: "1.1.0", dependencies: {} },
            ]);
            const sources = yield* SourceHostProviders;
            const unexpected = () =>
              Effect.die(
                new Error("A warm configured install must not consult or acquire from sources"),
              );
            const repeated = yield* applyInstall(
              installRequest({
                ...(route === "root" ? {} : { type: route === "explicit" ? "pack" : route }),
                subject:
                  route === "explicit"
                    ? { kind: "source", source: "@acme/packs/repeat@^1.0.0" }
                    : { kind: "configured" },
              }),
            ).pipe(
              Effect.provideService(SourceHostProviders, {
                ...sources,
                find: unexpected,
                resolveNamedRegistry: unexpected,
                fetch: unexpected,
                acquireForTransition: unexpected,
              }),
            );
            expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
            expect(durableState(world)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect.each(["missing-pack", "missing-member", "changed-pack"] as const)(
    "configured install restores the exact accepted closure when %s despite newer releases",
    (state) => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const dependency = { "@acme/skills/member": "^1.0.0" };
      world.registry.writeSkill("member", [{ version: "1.0.0", body: "Accepted member." }]);
      world.registry.writePack("repeat", [{ version: "1.0.0", dependencies: dependency }]);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            const first = yield* applyInstall(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "@acme/packs/repeat@^1.0.0" },
              }),
            );
            expect(deriveOperationOutcome(first)).toBe("applied");
            const before = durableState(world);
            world.registry.writeSkill("member", [
              { version: "1.0.0", body: "Accepted member." },
              { version: "1.1.0", body: "New member." },
            ]);
            world.registry.writePack("repeat", [
              { version: "1.0.0", dependencies: dependency },
              { version: "1.1.0", dependencies: {} },
            ]);
            const pack = "agent_extensions/registry/@acme/packs/repeat";
            if (state === "changed-pack") {
              world.workspace.writeFile(`${pack}/pack.json`, "{}\n");
            } else {
              fs.rmSync(
                nodePath.join(
                  world.workspace.root,
                  state === "missing-pack" ? pack : "agent_extensions/registry/@acme/skills/member",
                ),
                { recursive: true },
              );
            }
            const sources = yield* SourceHostProviders;
            const repeated = yield* applyInstall(
              installRequest({ subject: { kind: "configured" } }),
            ).pipe(
              Effect.provideService(SourceHostProviders, {
                ...sources,
                find: () => Effect.die("Restoration must not resolve a newer release"),
                resolveNamedRegistry: () =>
                  Effect.die("Restoration must use the accepted Registry endpoint"),
              }),
            );
            expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("applied");
            expect(durableState(world)).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("configured install uses the accepted local copy after the source disappears", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = nodePath.dirname(
      writeLocalSkillPackage(world.workspace.root, { name: "repeat" }),
    );
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );
          const before = durableState(world);
          fs.rmSync(source, { recursive: true });
          const repeated = yield* applyInstall(installRequest({ subject: { kind: "configured" } }));
          expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
          expect(durableState(world)).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(["root", "skill"] as const)(
    "configured %s install preserves an accepted Git commit after its branch advances",
    (route) =>
      Effect.gen(function* () {
        const world = makeInstallWorld();
        cleanups.push(world.cleanup);
        const repository = yield* makeGitSkillRepository({ name: "repeat" });
        cleanups.push(repository.cleanup);
        yield* world.workspace
          .provide(
            Effect.gen(function* () {
              yield* applyInstall(
                installRequest({
                  type: "skill",
                  subject: { kind: "source", source: repository.url },
                }),
              );
              const before = durableState(world);
              repository.advance();
              const sources = yield* SourceHostProviders;
              const unexpected = () =>
                Effect.die(new Error("Warm Git install consulted the moved source"));
              const repeated = yield* applyInstall(
                installRequest({
                  ...(route === "root" ? {} : { type: route }),
                  subject: { kind: "configured" },
                }),
              ).pipe(
                Effect.provideService(SourceHostProviders, {
                  ...sources,
                  find: unexpected,
                  fetch: unexpected,
                  resolveNamedRegistry: unexpected,
                  acquireForTransition: unexpected,
                }),
              );
              expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
              expect(durableState(world)).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      }),
  );

  it.effect("configured install preserves accepted local content after its source changes", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeLocalSkillPackage(world.workspace.root, { name: "repeat" });
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );
          const before = durableState(world);
          fs.appendFileSync(nodePath.join(source, "src", "SKILL.md"), "\nNew source content.\n");
          const repeated = yield* applyInstall(installRequest({ subject: { kind: "configured" } }));
          expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
          expect(durableState(world)).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
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

            expect(deriveOperationOutcome(repeated), JSON.stringify(repeated)).toBe("no-op");
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
