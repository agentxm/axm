import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  applyPlanExecution,
  deriveOperationOutcome,
  type PlanRiskCondition,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { InstallExtensions } from "../install-extensions.js";
import { applyActivation } from "../../activation/test-helpers.js";
import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
} from "../../../testing/install-world.js";

const acceptedExecution = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["install"], arguments: [] },
});

const executionChanges = (risks: ReadonlyArray<PlanRiskCondition> = []) =>
  risks.flatMap((risk) =>
    risk.level === "override-required" ? (risk.executionChanges ?? []) : [],
  );

describe("MCP execution review through workspace lifecycle", () => {
  it.effect(
    "reviews an endpoint query change even when the displayed destinations are identical",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      registry.writeMcp("remote", [
        {
          version: "1.0.0",
          files: {
            "mcp.json": JSON.stringify({
              owner: "@acme",
              type: "mcp-server",
              name: "remote",
              version: "1.0.0",
              server: {
                name: "ai.acme/remote",
                version: "1.0.0",
                description: "Remote context",
                remotes: [
                  {
                    type: "streamable-http",
                    url: "https://mcp.example.test/mcp?tenant={tenant}",
                    variables: { tenant: { isRequired: true } },
                  },
                ],
              },
            }),
          },
        },
      ]);
      const request = (tenant: string) =>
        installRequest({
          type: "mcp-server",
          subject: { kind: "source", source: "@acme/mcps/remote" },
          bind: [`url-variable/tenant=${tenant}`],
        });
      return workspace
        .provide(
          Effect.gen(function* () {
            const initial = yield* InstallExtensions.prepare(request("first-tenant"));
            const first = executionChanges(initial.execution.plan.riskConditions)[0];
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(initial, acceptedExecution)).resolution,
              ),
            ).toBe("applied");
            const before = workspace.snapshot();
            const changed = yield* InstallExtensions.prepare(request("second-tenant"));
            const second = executionChanges(changed.execution.plan.riskConditions)[0];
            expect(second?.registrations).toEqual([{ target: "claude-code", change: "changed" }]);
            expect(second?.details).toEqual(first?.details);
            expect(second?.details).toContain("streamable-http: https://mcp.example.test/mcp");
            expect(second?.contentIdentity).not.toBe(first?.contentIdentity);
            expect(JSON.stringify(second)).not.toContain("second-tenant");
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(changed, preapprovedPlanExecution))
                  .resolution,
              ),
            ).toBe("blocked");
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
  );
  it.effect(
    "reviews a symbolic input replacement without disclosing values or writing before acceptance",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      registry.writeMcp("context", [{ version: "1.0.0", secretInput: "API_TOKEN" }]);
      const request = (reference: string) =>
        installRequest({
          type: "mcp-server",
          subject: { kind: "source", source: "@acme/mcps/context" },
          bindEnv: [`environment/API_TOKEN=${reference}`],
        });
      return workspace
        .provide(
          Effect.gen(function* () {
            expect(
              deriveOperationOutcome(
                yield* applyInstallAcceptingExecutionChanges(request("WORK_TOKEN")),
              ),
            ).toBe("applied");
            const before = workspace.snapshot();
            const candidate = yield* InstallExtensions.prepare(request("PERSONAL_TOKEN"));
            const changes = executionChanges(candidate.execution.plan.riskConditions);
            expect(changes).toHaveLength(1);
            expect(changes[0]).toMatchObject({
              name: "context",
              registrations: [{ target: "claude-code", change: "changed" }],
              secretReferences: ["PERSONAL_TOKEN"],
              secretReferenceChanges: {
                previous: "known",
                added: ["PERSONAL_TOKEN"],
                removed: ["WORK_TOKEN"],
              },
            });
            expect(changes[0]?.details).toContain("npm: @acme/context@1.0.0");
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution))
                  .resolution,
              ),
            ).toBe("blocked");
            expect(workspace.snapshot()).toEqual(before);
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(candidate, acceptedExecution)).resolution,
              ),
            ).toBe("applied");
            expect(workspace.readFile(".mcp.json")).toContain("PERSONAL_TOKEN");
            expect(workspace.readFile(".mcp.json")).not.toContain("WORK_TOKEN");
            const unchanged = yield* InstallExtensions.prepare(request("PERSONAL_TOKEN"));
            expect(executionChanges(unchanged.execution.plan.riskConditions)).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
  );

  it.effect(
    "reviews every active alias when updating a shared package through a disabled connection",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld({
        settings: { agents: ["codex"] },
      });
      // The external command and npm package remain identical; only the AXM package bytes change.
      const version = (value: string) => ({
        version: value,
        files: {
          "mcp.json": JSON.stringify({
            owner: "@acme",
            type: "mcp-server",
            name: "context",
            version: value,
            server: {
              name: "ai.acme/context",
              version: value,
              description: "Context",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@acme/context",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                },
              ],
            },
          }),
          "README.md": `Package content ${value}`,
        },
      });
      registry.writeMcp("context", [version("1.0.0")]);
      return workspace
        .provide(
          Effect.gen(function* () {
            for (const localName of ["disabled-context", "work-context", "personal-context"]) {
              expect(
                deriveOperationOutcome(
                  yield* applyInstallAcceptingExecutionChanges(
                    installRequest({
                      type: "mcp-server",
                      localName,
                      subject: { kind: "source", source: "@acme/mcps/context" },
                    }),
                  ),
                ),
              ).toBe("applied");
            }
            const disabled = yield* applyActivation({
              type: "mcp-server",
              name: "disabled-context",
              enabled: false,
            });
            expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe("applied");
            registry.writeMcp("context", [version("1.0.0"), version("1.1.0")]);
            const before = workspace.snapshot();
            const candidate = yield* InstallExtensions.prepare(
              installRequest({
                type: "mcp-server",
                localName: "disabled-context",
                subject: { kind: "source", source: "@acme/mcps/context@1.1.0" },
              }),
            );
            const changes = executionChanges(candidate.execution.plan.riskConditions);
            expect(changes.map((change) => change.name).sort()).toEqual([
              "personal-context",
              "work-context",
            ]);
            expect(
              changes.every((change) => change.details.includes("npm: @acme/context@1.0.0")),
            ).toBe(true);
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution))
                  .resolution,
              ),
            ).toBe("blocked");
            expect(workspace.snapshot()).toEqual(before);
            expect(
              deriveOperationOutcome(
                (yield* InstallExtensions.previewOrApply(candidate, acceptedExecution)).resolution,
              ),
            ).toBe("applied");
            expect(workspace.readFile("axm.lock")).toContain('version = "1.1.0"');
            expect(workspace.readFile(".codex/config.toml")).toContain("disabled-context");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(cleanup)));
    },
  );
});
