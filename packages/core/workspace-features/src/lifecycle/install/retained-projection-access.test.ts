import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { InstallExtensions } from "./install-extensions.js";
import { EnableExtension } from "../activation/set-activation.js";
import { applyActivation } from "../activation/test-helpers.js";
import { installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { addConfiguredAgent, applySync } from "../../testing/sync-fixture.js";
import { applyUninstall, uninstallRequest } from "../uninstall/test-helpers.js";
import { UninstallExtensions } from "../uninstall/uninstall-extensions.js";

const acceptedExecution = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["install"], arguments: [] },
});

describe("Current access to retained shared-output contributors", () => {
  for (const installedType of ["rule", "knowledge"] as const) {
    it.effect(
      `rechecks retained ${installedType} when another instruction region restores its alias`,
      () => {
        const { workspace, registry, cleanup } = makeInstallWorld({
          settings: { instructionFiles: {} },
        });
        registry.writeRule("guidance", [{ version: "1.0.0", body: "Retained guidance" }]);
        registry.writeKnowledge("reference", [{ version: "1.0.0", body: "Retained reference" }]);
        const source = (type: "rule" | "knowledge") =>
          type === "rule" ? "@acme/rules/guidance" : "@acme/knowledge/reference";
        const install = (type: "rule" | "knowledge") =>
          Effect.gen(function* () {
            const candidate = yield* InstallExtensions.prepare(
              installRequest({ type, subject: { kind: "source", source: source(type) } }),
            );
            return (yield* InstallExtensions.previewOrApply(candidate, acceptedExecution))
              .resolution;
          });
        return workspace
          .provide(
            Effect.gen(function* () {
              expect(deriveOperationOutcome(yield* install(installedType))).toBe("applied");
              expect(workspace.exists("CLAUDE.md")).toBe(true);
              fs.rmSync(path.join(workspace.root, "CLAUDE.md"));
              const archive = registry
                .storedFiles()
                .find(
                  (file) =>
                    file.includes(
                      installedType === "rule" ? "/rules/guidance/" : "/knowledge/reference/",
                    ) && file.endsWith(".zip"),
                );
              if (archive === undefined) throw new Error("Expected retained package archive");
              fs.rmSync(path.join(registry.root, archive));
              const before = workspace.snapshot();
              const result = yield* install(installedType === "rule" ? "knowledge" : "rule");
              expect(deriveOperationOutcome(result)).toBe("failed");
              expect(result.failure?.detail).toContain(
                "Accepted local Registry archive is unavailable",
              );
              expect(workspace.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
      },
    );
  }
  for (const kind of [
    { type: "hook", plural: "hooks", output: ".claude/settings.json" },
    { type: "rule", plural: "rules", output: "AGENTS.md" },
    { type: "knowledge", plural: "knowledge", output: "AGENTS.md" },
  ] as const) {
    for (const operation of [
      "install",
      "enable",
      "pack-install",
      "add-agent",
      "uninstall",
      "uninstall-missing",
    ] as const) {
      if (operation === "add-agent" && kind.type === "hook") continue;
      it.effect(
        `${operation === "uninstall" ? "allows offline" : "refuses"} ${kind.type} ${operation} when a retained contributor is no longer available`,
        () => {
          const { workspace, registry, cleanup } = makeInstallWorld({
            settings: { instructionFiles: {} },
          });
          for (const name of ["alpha", "beta"]) {
            if (kind.type === "hook") registry.writeHook(name, [{ version: "1.0.0" }]);
            else if (kind.type === "rule")
              registry.writeRule(name, [{ version: "1.0.0", body: `Guidance ${name}` }]);
            else registry.writeKnowledge(name, [{ version: "1.0.0", body: `Knowledge ${name}` }]);
          }
          registry.writePack("toolkit", [
            { version: "1.0.0", dependencies: { [`@acme/${kind.plural}/beta`]: "*" } },
          ]);
          const install = (name: string) =>
            Effect.gen(function* () {
              const candidate = yield* InstallExtensions.prepare(
                installRequest({
                  type: operation === "pack-install" && name === "beta" ? "pack" : kind.type,
                  subject: {
                    kind: "source",
                    source:
                      operation === "pack-install" && name === "beta"
                        ? "@acme/packs/toolkit"
                        : `@acme/${kind.plural}/${name}`,
                  },
                }),
              );
              return (yield* InstallExtensions.previewOrApply(candidate, acceptedExecution))
                .resolution;
            });
          return workspace
            .provide(
              Effect.gen(function* () {
                expect(deriveOperationOutcome(yield* install("alpha"))).toBe("applied");
                if (
                  operation === "enable" ||
                  operation === "uninstall" ||
                  operation === "uninstall-missing"
                )
                  expect(deriveOperationOutcome(yield* install("beta"))).toBe("applied");
                expect(workspace.readFile(kind.output)).toContain("alpha");
                const archive = registry
                  .storedFiles()
                  .find((file) => file.includes(`/${kind.plural}/alpha/`) && file.endsWith(".zip"));
                expect(archive).toBeDefined();
                if (archive === undefined) return;
                fs.rmSync(path.join(registry.root, archive));
                if (operation === "enable") {
                  // Removing one contributor preserves the other exact registration without current Registry access.
                  const disabled = yield* applyActivation({
                    type: kind.type,
                    name: "beta",
                    enabled: false,
                  });
                  expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe(
                    "applied",
                  );
                  expect(workspace.readFile(kind.output)).toContain("alpha");
                }
                if (operation === "uninstall") {
                  const result = yield* applyUninstall(
                    uninstallRequest({ type: kind.type, selector: "beta" }),
                  );
                  expect(deriveOperationOutcome(result)).toBe("applied");
                  expect(workspace.readFile(kind.output)).toContain("alpha");
                  expect(workspace.readFile(kind.output)).not.toContain("beta");
                  return;
                }
                if (operation === "uninstall-missing")
                  fs.rmSync(path.join(workspace.root, kind.output));
                const before = workspace.snapshot();
                const result = yield* operation === "uninstall-missing"
                  ? Effect.gen(function* () {
                      const candidate = yield* UninstallExtensions.prepare(
                        uninstallRequest({ type: kind.type, selector: "beta" }),
                      );
                      return yield* UninstallExtensions.previewOrApply(
                        candidate,
                        acceptedExecution,
                      );
                    })
                  : operation === "add-agent"
                    ? addConfiguredAgent("gemini-cli", acceptedExecution)
                    : operation !== "enable"
                      ? install("beta")
                      : Effect.gen(function* () {
                          const candidate = yield* EnableExtension.prepare({
                            type: kind.type,
                            name: "beta",
                          });
                          if (candidate._tag === "Unchanged")
                            throw new Error("Beta must be disabled before the exposure check");
                          return yield* EnableExtension.previewOrApply(
                            candidate,
                            acceptedExecution,
                          );
                        });
                expect(deriveOperationOutcome(result)).not.toBe("applied");
                expect(result.failure?.detail).toContain(
                  "Accepted local Registry archive is unavailable",
                );
                expect(workspace.snapshot()).toEqual(before);
                // With every installed native unit still current, sync makes no Registry admission request.
                if (operation !== "uninstall-missing")
                  expect((yield* applySync())._tag).toBe("AlreadyReconciled");
                expect(workspace.snapshot()).toEqual(before);
              }),
            )
            .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
        },
      );
    }
  }
  it.effect(
    "reviews only the new Hook when a shared registration preserves an unchanged Hook",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld({
        settings: { instructionFiles: {} },
      });
      registry.writeHook("alpha", [{ version: "1.0.0" }]);
      registry.writeHook("beta", [{ version: "1.0.0" }]);
      return workspace
        .provide(
          Effect.gen(function* () {
            const initial = yield* InstallExtensions.prepare(
              installRequest({
                type: "hook",
                subject: { kind: "source", source: "@acme/hooks/alpha" },
              }),
            );
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(initial, acceptedExecution)).resolution,
              ),
            ).toBe("applied");
            const candidate = yield* InstallExtensions.prepare(
              installRequest({
                type: "hook",
                subject: { kind: "source", source: "@acme/hooks/beta" },
              }),
            );
            const changes =
              candidate.execution.plan.riskConditions?.flatMap((risk) =>
                risk.level === "override-required" ? (risk.executionChanges ?? []) : [],
              ) ?? [];
            expect(changes.map((change) => change.name)).toEqual(["beta"]);
            expect(changes[0]?.registrations).toEqual([{ target: "claude-code", change: "added" }]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
  );
});
