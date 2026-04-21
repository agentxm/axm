/**
 * Unit tests for rule-context types and their narrow accessors.
 *
 * Covers the spec scenarios for the "Rule contexts expose narrow caller-bound
 * accessors" requirement:
 *
 * - Skill / Pack accessors expose only `exists` and `readBytes`.
 * - Workspace accessor exposes only the documented v1 methods.
 * - Every context type carries a `displayRoot`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type {
  PackFileAccessor,
  PackRuleContext,
  SkillFileAccessor,
  SkillRuleContext,
  WorkspaceLintAccessor,
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

const makeWorkspaceAccessor = (): WorkspaceLintAccessor => ({
  settings: Effect.succeed({}),
  lockfile: Effect.succeed(Option.none()),
  installedSkills: Effect.succeed([]),
  installedPacks: Effect.succeed([]),
  knownAgents: Effect.succeed([]),
  detectAgents: () => Effect.succeed([]),
  exists: () => Effect.succeed(false),
  isWritable: () => Effect.succeed(false),
  list: () => Effect.succeed([]),
});

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

describe("WorkspaceLintAccessor surface area", () => {
  it("exposes only the v1 documented methods", () => {
    const accessor = makeWorkspaceAccessor();

    expect(Object.keys(accessor).sort()).toEqual([
      "detectAgents",
      "exists",
      "installedPacks",
      "installedSkills",
      "isWritable",
      "knownAgents",
      "list",
      "lockfile",
      "settings",
    ]);
  });
});

// -----------------------------------------------------------------------------
// Rule-context types
// -----------------------------------------------------------------------------

describe("Rule-context types", () => {
  it("SkillRuleContext carries subject, files, displayRoot", () => {
    const ctx: SkillRuleContext = {
      subject: { name: "example" },
      files: makeSkillAccessor(),
      displayRoot: ".axm/extensions/@acme/skills/axm/src",
    };

    expect(ctx.displayRoot).toBe(".axm/extensions/@acme/skills/axm/src");
    expect(Object.keys(ctx).sort()).toEqual(["displayRoot", "files", "subject"]);
  });

  it("PackRuleContext carries subject, files, displayRoot", () => {
    const ctx: PackRuleContext = {
      subject: { name: "example" },
      files: makePackAccessor(),
      displayRoot: "",
    };

    expect(ctx.displayRoot).toBe("");
    expect(Object.keys(ctx).sort()).toEqual(["displayRoot", "files", "subject"]);
  });

  it("WorkspaceRuleContext carries subject, workspace, displayRoot", () => {
    const ctx: WorkspaceRuleContext = {
      subject: { root: "/tmp/ws", scope: "project" },
      workspace: makeWorkspaceAccessor(),
      displayRoot: "",
    };

    expect(ctx.subject.scope).toBe("project");
    expect(Object.keys(ctx).sort()).toEqual(["displayRoot", "subject", "workspace"]);
  });
});
