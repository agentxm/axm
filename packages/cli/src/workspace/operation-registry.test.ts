import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import type { Operation, Plan } from "./plan.js";
import { getEffectiveLockfilePolicy } from "./augment-plan.js";
import { getOperationMetadata, operationMetadataRegistry } from "./operation-registry.js";

type RegistryTestOp =
  | Operation<"install-skill", Record<string, never>>
  | Operation<"uninstall-pack", Record<string, never>>
  | Operation<"enable-skill", Record<string, never>>;

const makePlan = (operations: ReadonlyArray<RegistryTestOp>): Plan<RegistryTestOp> => ({
  name: "Registry policy plan",
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      steps: operations.map((operation) => ({
        _tag: "PlannedJobStep" as const,
        operation,
        readiness: { status: "ready" as const, message: Option.none() },
        label: operation.name,
      })),
    },
  ],
});

describe("operation metadata registry", () => {
  it("defines lockfile policy metadata for core operation classes", () => {
    expect(getOperationMetadata("install-skill")).toMatchObject({
      _tag: "Some",
      value: {
        name: "install-skill",
        lockfilePolicy: "materialize_if_missing",
      },
    });
    expect(getOperationMetadata("uninstall-pack")).toMatchObject({
      _tag: "Some",
      value: {
        name: "uninstall-pack",
        lockfilePolicy: "read_recover_if_missing",
      },
    });
    expect(getOperationMetadata("enable-skill")).toMatchObject({
      _tag: "Some",
      value: {
        name: "enable-skill",
        lockfilePolicy: "ignore_if_missing",
      },
    });
    expect(getOperationMetadata("install-pack")).toMatchObject({
      _tag: "Some",
      value: {
        name: "install-pack",
        lockfilePolicy: "materialize_if_missing",
      },
    });
    expect(getOperationMetadata("install-command")).toMatchObject({
      _tag: "Some",
      value: {
        name: "install-command",
        lockfilePolicy: "materialize_if_missing",
      },
    });
    expect(getOperationMetadata("install-mcp-server")).toMatchObject({
      _tag: "Some",
      value: {
        name: "install-mcp-server",
        lockfilePolicy: "materialize_if_missing",
      },
    });
  });

  it("applies policy precedence for mixed registered operations", () => {
    const plan = makePlan([
      { name: "enable-skill", args: {} },
      { name: "uninstall-pack", args: {} },
      { name: "install-skill", args: {} },
    ]);

    expect(getEffectiveLockfilePolicy(plan)).toBe("materialize_if_missing");
  });

  it("contains install, uninstall, and non-mutating operation metadata", () => {
    expect(operationMetadataRegistry).toHaveProperty("install-command");
    expect(operationMetadataRegistry).toHaveProperty("uninstall-mcp-server");
    expect(operationMetadataRegistry).toHaveProperty("publish-pack");
  });
});
