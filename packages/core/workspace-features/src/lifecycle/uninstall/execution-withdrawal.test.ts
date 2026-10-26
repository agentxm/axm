import * as fs from "node:fs";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
} from "../../testing/install-world.js";
import { applyActivation, previewActivation } from "../activation/test-helpers.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "./test-helpers.js";

describe("External execution withdrawal evidence", () => {
  for (const type of ["hook", "mcp-server"] as const) {
    for (const action of ["disable", "uninstall", "disable-codex"] as const) {
      if (action === "disable-codex" && type === "hook") continue;
      it.effect(
        `describes ${type} ${action} offline without requiring execution acknowledgment`,
        () => {
          const target = action === "disable-codex" ? "codex" : "claude-code";
          const reference = action === "disable-codex" ? "API_TOKEN" : "WORK_TOKEN";
          const { workspace, registry, cleanup } = makeInstallWorld({
            settings: { agents: [target] },
          });
          const plural = type === "hook" ? "hooks" : "mcps";
          if (type === "hook") registry.writeHook("audit", [{ version: "1.0.0" }]);
          else registry.writeMcp("audit", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
          return workspace
            .provide(
              Effect.gen(function* () {
                expect(
                  deriveOperationOutcome(
                    yield* applyInstallAcceptingExecutionChanges(
                      installRequest({
                        type,
                        subject: { kind: "source", source: `@acme/${plural}/audit` },
                        bindEnv:
                          type === "mcp-server" ? [`environment/API_TOKEN=${reference}`] : [],
                      }),
                    ),
                  ),
                ).toBe("applied");
                // Access cannot be validated after this point; a withdrawal must not fetch or reauthorize.
                const archive = registry
                  .storedFiles()
                  .find((file) => file.includes(`/${plural}/audit/`) && file.endsWith(".zip"));
                if (archive === undefined) throw new Error("Expected the fixture archive");
                fs.rmSync(path.join(registry.root, archive));
                const before = workspace.snapshot();
                const preview =
                  action === "uninstall"
                    ? yield* previewUninstall(uninstallRequest({ type, selector: "audit" }))
                    : yield* previewActivation({ type, name: "audit", enabled: false }).pipe(
                        Effect.map((result) => {
                          if (result._tag !== "Resolved")
                            throw new Error("Expected a disable candidate");
                          return result.resolution;
                        }),
                      );
                expect(workspace.snapshot()).toEqual(before);
                const changes = preview.units.flatMap(
                  (unit) => unit.artifact?.executionChanges ?? [],
                );
                expect(changes).toHaveLength(1);
                expect(changes[0]).toMatchObject({
                  extensionType: type,
                  name: "audit",
                  source: expect.stringContaining("@acme/audit@1.0.0"),
                  contentIdentity: expect.stringMatching(/^sha256-tree-v2:/u),
                  registrations: [
                    { target, change: action === "disable-codex" ? "changed" : "removed" },
                  ],
                  secretReferenceChanges: {
                    previous: "known",
                    added: [],
                    removed: type === "hook" ? [] : [reference],
                  },
                });
                expect(changes[0]?.details.join("\n")).toContain(
                  type === "hook" ? "bash src/hook.sh" : "npm: @acme/audit@1.0.0",
                );
                expect(
                  preview.riskConditions?.some(
                    (risk) => risk.id === "external-execution-changes",
                  ) ?? false,
                ).toBe(false);
                const applied =
                  action === "uninstall"
                    ? yield* applyUninstall(uninstallRequest({ type, selector: "audit" }))
                    : yield* applyActivation({ type, name: "audit", enabled: false }).pipe(
                        Effect.map((result) => {
                          if (result._tag !== "Resolved")
                            throw new Error("Expected a disable candidate");
                          return result.resolution;
                        }),
                      );
                expect(deriveOperationOutcome(applied), JSON.stringify(applied)).toBe("applied");
                expect(
                  applied.units.flatMap((unit) => unit.artifact?.executionChanges ?? []),
                ).toEqual(changes);
              }),
            )
            .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
        },
      );
    }
  }
});
