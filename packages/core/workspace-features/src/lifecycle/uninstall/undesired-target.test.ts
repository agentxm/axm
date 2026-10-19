import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { typedUninstallSelector } from "./undesired-target.js";

describe("typedUninstallSelector", () => {
  it.effect("reads a qualified name of the route's type as its extension name", () =>
    Effect.gen(function* () {
      const kinds = [
        { type: "rule", fqn: "@acme/rules/style" },
        { type: "hook", fqn: "@acme/hooks/style" },
        { type: "knowledge", fqn: "@acme/knowledge/style" },
        { type: "mcp-server", fqn: "@acme/mcps/style" },
        { type: "skill", fqn: "@acme/skills/style" },
        { type: "subagent", fqn: "@acme/subagents/style" },
      ] as const;
      for (const { type, fqn } of kinds) {
        expect(yield* typedUninstallSelector(type, ` ${fqn} `)).toEqual({
          selector: "style",
          subject: { type, name: "style", owner: "@acme" },
        });
      }
    }),
  );

  it.effect("keeps a Pack's qualified spelling for its owner-aware parser", () =>
    Effect.gen(function* () {
      expect(yield* typedUninstallSelector("pack", "@acme/packs/tools")).toEqual({
        selector: "@acme/packs/tools",
        subject: { type: "pack", name: "tools", owner: "@acme" },
      });
    }),
  );

  it.effect("passes names and globs through trimmed", () =>
    Effect.gen(function* () {
      expect(yield* typedUninstallSelector("rule", " style ")).toEqual({
        selector: "style",
        subject: { type: "rule", name: "style", owner: undefined },
      });
      expect(yield* typedUninstallSelector("hook", " lint-* ")).toEqual({
        selector: "lint-*",
        subject: undefined,
      });
    }),
  );

  it.effect("refuses a qualified name of another type", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(typedUninstallSelector("rule", "@acme/skills/style"));
      expect(failure).toMatchObject({
        _tag: "ExtensionLifecycleFailed",
        category: "validation",
        detail: "Expected a rule identity, received @acme/skills/style",
      });
    }),
  );
});
