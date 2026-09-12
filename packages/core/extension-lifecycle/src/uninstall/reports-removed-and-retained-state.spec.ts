import * as fs from "node:fs";
import * as path from "node:path";
import { makeLifecycleRegistry } from "../testing.js";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import { workspaceWithAuthoredExtension } from "../activation/test-helpers.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
} from "../install/test-helpers.js";
import { UninstallExtensions } from "./uninstall-extensions.js";
import { uninstallRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/uninstall/reports-removed-and-retained-state",
  title: "Uninstall reports exact removed and retained state",
  statement:
    "Uninstall preview and application of the same candidate shall identify the actual settings, accepted-resolution and owned projection units changed, acquired content removed, and authored or still-required content retained, with explicit retention reasons; absent and unverified content shall be distinguished from retained content, and shared native files shall not be reported as deleted when only their owned entry or region changes.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall effect reporting", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "identifies retained authored Knowledge in preview and the same applied candidate",
    () => {
      const workspace = workspaceWithAuthoredExtension({
        type: "knowledge",
        name: "handbook",
        enabled: true,
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            const before = workspace.snapshot();
            const candidate = yield* UninstallExtensions.prepare(
              uninstallRequest({ type: "knowledge", selector: "handbook" }),
            );
            const preview = yield* UninstallExtensions.previewOrApply(
              candidate,
              previewPlanExecution,
            );
            expect(workspace.snapshot()).toEqual(before);
            const expected = {
              path: "knowledge/handbook",
              state: "retained",
              reason: "workspace-authored source",
            };
            expect(preview.units.flatMap((unit) => unit.artifact?.references ?? [])).toContainEqual(
              expected,
            );
            const applied = yield* UninstallExtensions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(applied.units.flatMap((unit) => unit.artifact?.references ?? [])).toContainEqual(
              expected,
            );
            expect(workspace.exists("knowledge/handbook/knowledge.json")).toBe(true);
            expect(
              applied.units
                .flatMap((unit) => unit.artifact?.targets ?? [])
                .filter((target) => target.change === "removed")
                .map((target) => target.path),
            ).not.toContain("AGENTS.md");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "removes the advertised MCP entry from a formerly configured agent and preserves unowned entries",
    () => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      world.registry.writeMcp("context", [{ version: "1.0.0" }]);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "@acme/mcps/context" },
              }),
            );
            world.workspace.writeFile(
              "axm.json",
              JSON.stringify({ ...readSettings(world.workspace), agents: [] }),
            );
            const native = world.workspace.readFile(".mcp.json");
            world.workspace.writeFile(
              ".mcp.json",
              native.replace(
                '"mcpServers": {',
                '"mcpServers": {"personal": {"command": "personal-server"},',
              ),
            );
            const candidate = yield* UninstallExtensions.prepare(
              uninstallRequest({ type: "mcp-server", selector: "context" }),
            );
            const before = world.workspace.snapshot();
            const preview = yield* UninstallExtensions.previewOrApply(
              candidate,
              previewPlanExecution,
            );
            expect(world.workspace.snapshot()).toEqual(before);
            expect(preview.units.flatMap((unit) => unit.artifact?.targets ?? [])).toContainEqual(
              expect.objectContaining({
                path: ".mcp.json",
                change: "updated",
                entryName: "context",
              }),
            );
            const applied = yield* UninstallExtensions.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(world.workspace.readFile(".mcp.json")).not.toContain('"context"');
            expect(world.workspace.readFile(".mcp.json")).toContain('"personal"');
            expect(applied.units.flatMap((unit) => unit.artifact?.targets ?? [])).toContainEqual(
              expect.objectContaining({
                path: ".mcp.json",
                change: "updated",
                entryName: "context",
              }),
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("reports a shared MCP source as retained when one local connection is removed", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          for (const localName of ["work-context", "personal-context"])
            yield* applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "@acme/mcps/context" },
                localName,
              }),
            );
          const candidate = yield* UninstallExtensions.prepare(
            uninstallRequest({ type: "mcp-server", selector: "work-context" }),
          );
          const preview = yield* UninstallExtensions.previewOrApply(
            candidate,
            previewPlanExecution,
          );
          const canonical = "agent_extensions/agentxm/@acme/mcps/context";
          const references = preview.units.flatMap((unit) => unit.artifact?.references ?? []);
          expect(references).toContainEqual({
            path: canonical,
            state: "retained",
            reason: "required by resulting desired state",
          });
          const targets = preview.units.flatMap((unit) => unit.artifact?.targets ?? []);
          expect(
            targets.some((target) => target.path === canonical || target.path === "axm-lock.yaml"),
          ).toBe(false);
          expect(targets).toContainEqual({
            path: ".mcp.json",
            change: "updated",
            unitId: "mcp-server:native-config-entry",
            entryName: "work-context",
            agentIds: expect.arrayContaining(["claude-code"]),
          });
          const applied = yield* UninstallExtensions.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(applied.units.flatMap((unit) => unit.artifact?.references ?? [])).toEqual(
            references,
          );
          expect(world.workspace.exists(`${canonical}/mcp.json`)).toBe(true);
          expect(world.workspace.readFile(".mcp.json")).toContain("personal-context");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  for (const scope of ["project", "user"] as const) {
    it.effect(
      `names an alternate acquired source segment in ${scope} scope for a Pack and its exclusive member`,
      () => {
        const registry = makeLifecycleRegistry();
        cleanups.push(registry.cleanup);
        const world = makeInstallWorld({
          registry,
          scope,
          settings: { sources: [{ ...registry.source, name: "mirror" }] },
        });
        cleanups.push(world.cleanup);
        world.registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
        world.registry.writePack("reviews", [
          { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
        ]);
        return world.workspace
          .provide(
            Effect.gen(function* () {
              yield* applyInstall(
                installRequest({
                  type: "pack",
                  subject: { kind: "source", source: "mirror:@acme/packs/reviews" },
                }),
              );
              const candidate = yield* UninstallExtensions.prepare(
                uninstallRequest({ type: "pack", selector: "reviews" }),
              );
              const preview = yield* UninstallExtensions.previewOrApply(
                candidate,
                previewPlanExecution,
              );
              const paths = preview.units
                .flatMap((unit) => unit.artifact?.targets ?? [])
                .filter((target) => target.change === "removed")
                .map((target) => target.path);
              const prefix = scope === "project" ? "" : ".axm/workspace/";
              expect(paths).toContain(`${prefix}agent_extensions/mirror/@acme/packs/reviews`);
              expect(paths).toContain(`${prefix}agent_extensions/mirror/@acme/skills/review`);
              const applied = yield* UninstallExtensions.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              );
              expect(deriveOperationOutcome(applied)).toBe("applied");
              for (const target of paths)
                expect(
                  fs.existsSync(
                    path.join(
                      scope === "project" ? world.workspace.root : world.workspace.home,
                      target,
                    ),
                  ),
                ).toBe(false);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
  }
});
