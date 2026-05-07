/**
 * Unit tests for subagent content parsing.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { parseSubagentMd } from "./subagent-content.js";

describe("parseSubagentMd", () => {
  it.effect("parses content when frontmatter name matches expected name", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
---

You are a planner.`,
        "planner",
      );

      expect(Option.isSome(result.frontmatter)).toBe(true);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm["name"]).toBe("planner");
      expect(result.body).toContain("You are a planner.");
    }),
  );

  it.effect("preserves arbitrary frontmatter keys verbatim", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
description: Plans work
model: powerful
toolAccess: readonly
background: true
custom_field: hello
nested:
  a: 1
  b:
    - x
    - y
---

Body.`,
        "planner",
      );

      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm["description"]).toBe("Plans work");
      expect(fm["model"]).toBe("powerful");
      expect(fm["toolAccess"]).toBe("readonly");
      expect(fm["background"]).toBe(true);
      expect(fm["custom_field"]).toBe("hello");
      expect(fm["nested"]).toEqual({ a: 1, b: ["x", "y"] });
    }),
  );

  it.effect("extracts agentOverrides keyed by agent id", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
agentOverrides:
  claude-code:
    disallowedTools: "Edit,Write"
  codex:
    model: gpt-5-codex
---

Body.`,
        "planner",
      );

      expect(Option.isSome(result.agentOverrides)).toBe(true);
      const overrides = Option.getOrThrow(result.agentOverrides);
      expect(overrides["claude-code"]).toEqual({ disallowedTools: "Edit,Write" });
      expect(overrides["codex"]).toEqual({ model: "gpt-5-codex" });
    }),
  );

  it.effect("returns no agentOverrides when not present", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
---

Body.`,
        "planner",
      );
      expect(Option.isNone(result.agentOverrides)).toBe(true);
    }),
  );

  it.effect("ignores agentOverrides entries that are not plain objects", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
agentOverrides:
  claude-code:
    model: opus
  bad: "not an object"
---

Body.`,
        "planner",
      );
      const overrides = Option.getOrThrow(result.agentOverrides);
      expect(overrides["claude-code"]).toEqual({ model: "opus" });
      expect(overrides["bad"]).toBeUndefined();
    }),
  );

  it.effect("fails when frontmatter is missing", () =>
    Effect.gen(function* () {
      const error = yield* parseSubagentMd("# Planner\n", "planner").pipe(Effect.flip);
      expect(error.code).toBe("SUBAGENT_FRONTMATTER_MISSING");
      expect(error.what).toContain("planner");
    }),
  );

  it.effect("fails when frontmatter name does not match expected name", () =>
    Effect.gen(function* () {
      const error = yield* parseSubagentMd(
        `---
name: researcher
---

Body.`,
        "planner",
      ).pipe(Effect.flip);

      expect(error.code).toBe("SUBAGENT_NAME_MISMATCH");
      expect(error.what).toContain("researcher");
      expect(error.what).toContain("planner");
    }),
  );

  it.effect("fails when name is missing", () =>
    Effect.gen(function* () {
      const error = yield* parseSubagentMd(
        `---
description: no name here
---

Body.`,
        "planner",
      ).pipe(Effect.flip);

      expect(error.code).toBe("SUBAGENT_FRONTMATTER_INVALID");
    }),
  );
});
