/**
 * Unit tests for the workspace lint rule context shape.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { WorkspaceRuleContext } from "./workspace-context.js";

// Assertion needed: the context-shape tests never touch the workspace, so a
// Proxy stub avoids enumerating every cell.
const throwingWorkspace = new Proxy(
  {},
  {
    get: () => {
      throw new Error("unused workspace read model");
    },
  },
) as unknown as WorkspaceRuleContext["workspace"];

describe("Workspace rule-context types", () => {
  it("WorkspaceRuleContext carries subject, workspace, displayRoot", () => {
    const ctx: WorkspaceRuleContext = {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace: throwingWorkspace,
      axmDirExists: Effect.succeed(false),
      displayRoot: "",
    };

    expect(ctx.subject.scope).toBe("project");
    expect(Object.keys(ctx).sort()).toEqual([
      "axmDirExists",
      "displayRoot",
      "subject",
      "workspace",
    ]);
  });
});
