/**
 * Unit tests for subagent content parsing and frontmatter schemas.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { SubagentFrontmatterSchema, parseSubagentMd } from "./subagent-content.js";

describe("SubagentFrontmatterSchema", () => {
  const decode = Schema.decodeUnknownSync(SubagentFrontmatterSchema);

  it("accepts required name and description", () => {
    const result = decode({ name: "planner", description: "Plans work" });
    expect(result.name).toBe("planner");
    expect(result.description).toBe("Plans work");
  });

  it("accepts portable fields", () => {
    const result = decode({
      name: "planner",
      description: "Plans work",
      model: "default",
      toolAccess: "readonly",
      background: true,
    });
    expect(result.model).toBe("default");
    expect(result.toolAccess).toBe("readonly");
    expect(result.background).toBe(true);
  });
});

describe("parseSubagentMd", () => {
  it.effect("parses content when frontmatter name matches expected name", () =>
    Effect.gen(function* () {
      const result = yield* parseSubagentMd(
        `---
name: planner
description: Plans work
---

You are a planner.`,
        "planner",
      );

      expect(Option.isSome(result.frontmatter)).toBe(true);
      const frontmatter = Option.getOrThrow(result.frontmatter);
      expect(frontmatter.name).toBe("planner");
      expect(result.body).toContain("You are a planner.");
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
description: Researches
---

Body.`,
        "planner",
      ).pipe(Effect.flip);

      expect(error.code).toBe("SUBAGENT_NAME_MISMATCH");
      expect(error.what).toContain("researcher");
      expect(error.what).toContain("planner");
    }),
  );
});
