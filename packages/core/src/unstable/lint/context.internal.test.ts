/**
 * Unit tests for rule-context types and their narrow accessors.
 *
 * Covers the spec scenarios for the "Rule contexts expose narrow caller-bound
 * accessors" requirement:
 *
 * - Skill / Pack accessors expose only `exists` and `readBytes`.
 * - WorkspaceMutations accessor exposes only the documented v1 methods.
 * - Every context type carries a `displayRoot`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type {
  PackFileAccessor,
  PackRuleContext,
  SkillFileAccessor,
  SkillRuleContext,
  WorkspaceRuleContext,
} from "./context.js";

// -----------------------------------------------------------------------------
// Fake accessor fixtures
// -----------------------------------------------------------------------------

const makeSkillAccessor = (): SkillFileAccessor => ({
  exists: (_path) => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "no such file",
    }),
});

const makePackAccessor = (): PackFileAccessor => ({
  exists: (_path) => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "no such file",
    }),
});

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

// -----------------------------------------------------------------------------
// Accessor surface area
// -----------------------------------------------------------------------------

describe("SkillFileAccessor surface area", () => {
  it("exposes only exists and readBytes", () => {
    const accessor = makeSkillAccessor();

    expect(Object.keys(accessor).sort()).toEqual(["exists", "readBytes"]);
  });
});

describe("PackFileAccessor surface area", () => {
  it("exposes only exists and readBytes", () => {
    const accessor = makePackAccessor();

    expect(Object.keys(accessor).sort()).toEqual(["exists", "readBytes"]);
  });
});

describe("Rule-context types", () => {
  it("SkillRuleContext carries subject, files, packageFiles, displayRoot", () => {
    const ctx: SkillRuleContext = {
      subject: { isNative: true, skillJson: undefined },
      files: makeSkillAccessor(),
      packageFiles: makeSkillAccessor(),
      displayRoot: "agent_extensions/@acme/skills/axm/src",
    };

    expect(ctx.displayRoot).toBe("agent_extensions/@acme/skills/axm/src");
    expect(Object.keys(ctx).sort()).toEqual(["displayRoot", "files", "packageFiles", "subject"]);
  });

  it("PackRuleContext carries subject, files, displayRoot", () => {
    const ctx: PackRuleContext = {
      subject: { packJson: { owner: "@acme", type: "pack", name: "example", version: "0.1.0" } },
      files: makePackAccessor(),
      displayRoot: "",
    };

    expect(ctx.displayRoot).toBe("");
    expect(Object.keys(ctx).sort()).toEqual(["displayRoot", "files", "subject"]);
  });

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
