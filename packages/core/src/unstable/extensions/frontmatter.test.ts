/**
 * Unit tests for frontmatter parsing utilities.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { parseFrontmatterEffect, parseFrontmatterSync } from "./frontmatter.js";

const validFrontmatterContent = `---
title: My Document
tags:
  - one
  - two
---
# Hello

Body content here.`;

const noFrontmatterContent = `# Just a regular document

No frontmatter here.`;

const malformedYamlContent = `---
title: [invalid yaml
  missing: bracket
---
Body after bad YAML.`;

const emptyBodyContent = `---
title: Empty Body
---`;

const emptyContent = "";

const frontmatterOnlyDelimiters = `---
---
Body after empty frontmatter.`;

describe("parseFrontmatterSync", () => {
  it("parses valid frontmatter with body", () => {
    const result = parseFrontmatterSync(validFrontmatterContent);
    expect(result.frontmatter).toEqual({ title: "My Document", tags: ["one", "two"] });
    expect(result.body).toBe("# Hello\n\nBody content here.");
  });

  it("returns full content as body when no frontmatter", () => {
    const result = parseFrontmatterSync(noFrontmatterContent);
    expect(result.frontmatter).toBeUndefined();
    expect(result.body).toBe(noFrontmatterContent);
  });

  it("throws on malformed YAML", () => {
    expect(() => parseFrontmatterSync(malformedYamlContent)).toThrow();
  });

  it("handles empty body after frontmatter", () => {
    const result = parseFrontmatterSync(emptyBodyContent);
    expect(result.frontmatter).toEqual({ title: "Empty Body" });
    expect(result.body).toBe("");
  });

  it("handles empty content", () => {
    const result = parseFrontmatterSync(emptyContent);
    expect(result.frontmatter).toBeUndefined();
    expect(result.body).toBe("");
  });

  it("handles empty frontmatter (just delimiters)", () => {
    const result = parseFrontmatterSync(frontmatterOnlyDelimiters);
    // YAML parses empty document as null/undefined
    expect(result.body).toBe("Body after empty frontmatter.");
  });

  it("returns unknown type for frontmatter (not command-specific)", () => {
    const result = parseFrontmatterSync(validFrontmatterContent);
    // TypeScript compile-time check: frontmatter is `unknown`
    const fm: unknown = result.frontmatter;
    expect(fm).toBeDefined();
  });
});

describe("parseFrontmatterEffect", () => {
  it.effect("parses valid frontmatter with body", () =>
    Effect.gen(function* () {
      const result = yield* parseFrontmatterEffect(validFrontmatterContent);
      expect(result.frontmatter).toEqual({ title: "My Document", tags: ["one", "two"] });
      expect(result.body).toBe("# Hello\n\nBody content here.");
    }),
  );

  it.effect("returns full content as body when no frontmatter", () =>
    Effect.gen(function* () {
      const result = yield* parseFrontmatterEffect(noFrontmatterContent);
      expect(result.frontmatter).toBeUndefined();
      expect(result.body).toBe(noFrontmatterContent);
    }),
  );

  it.effect("fails with AppError on malformed YAML", () =>
    Effect.gen(function* () {
      const exit = yield* parseFrontmatterEffect(malformedYamlContent).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("handles empty body after frontmatter", () =>
    Effect.gen(function* () {
      const result = yield* parseFrontmatterEffect(emptyBodyContent);
      expect(result.frontmatter).toEqual({ title: "Empty Body" });
      expect(result.body).toBe("");
    }),
  );

  it.effect("handles empty content", () =>
    Effect.gen(function* () {
      const result = yield* parseFrontmatterEffect(emptyContent);
      expect(result.frontmatter).toBeUndefined();
      expect(result.body).toBe("");
    }),
  );
});
