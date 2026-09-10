/**
 * Unit tests for frontmatter parsing utilities.
 */

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { YAMLParseError } from "yaml";
import {
  FrontmatterParseFailure,
  normalizeFrontmatterParseFailure,
  parseFrontmatterEffect,
  parseFrontmatterSync,
} from "./frontmatter.js";

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

const malformedMappingContent = `---
type: reference
description: value: extra
---
# Broken`;

const unterminatedQuoteContent = `---
type: reference
description: "unterminated
tags: [fixture]
---
# Broken`;

const invalidCollectionContent = `---
type: reference
tags:
  - one
 - two
---
# Broken`;

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

  it("throws a bounded typed failure with original-document coordinates", () => {
    expect.assertions(5);
    try {
      parseFrontmatterSync(malformedMappingContent);
    } catch (error) {
      expect(error).toBeInstanceOf(FrontmatterParseFailure);
      if (error instanceof FrontmatterParseFailure) {
        expect(error.reason).toBe("Nested mappings are not allowed in compact mappings");
        expect(error.line).toBe(3);
        expect(error.column).toBe(14);
        expect("cause" in error).toBe(false);
      }
    }
  });

  it.each([
    {
      name: "unterminated quoted value",
      content: unterminatedQuoteContent,
      reason: "Missing closing quote",
      line: 5,
      column: 1,
    },
    {
      name: "invalid collection indentation",
      content: invalidCollectionContent,
      reason: "A block sequence may not be used as an implicit map key",
      line: 5,
      column: 1,
    },
  ])("normalizes $name", ({ content, reason, line, column }) => {
    expect.assertions(4);
    try {
      parseFrontmatterSync(content);
    } catch (error) {
      expect(error).toBeInstanceOf(FrontmatterParseFailure);
      if (error instanceof FrontmatterParseFailure) {
        expect(error.reason).toBe(reason);
        expect(error.line).toBe(line);
        expect(error.column).toBe(column);
      }
    }
  });

  it("keeps line and column stable for CRLF input", () => {
    expect.assertions(3);
    try {
      parseFrontmatterSync(malformedMappingContent.replaceAll("\n", "\r\n"));
    } catch (error) {
      expect(error).toBeInstanceOf(FrontmatterParseFailure);
      if (error instanceof FrontmatterParseFailure) {
        expect(error.line).toBe(3);
        expect(error.column).toBe(14);
      }
    }
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

  it.effect("fails with FrontmatterParseFailure on malformed YAML", () =>
    Effect.gen(function* () {
      const failure = yield* parseFrontmatterEffect(malformedYamlContent).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(FrontmatterParseFailure);
      expect(failure._tag).toBe("FrontmatterParseFailure");
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

describe("normalizeFrontmatterParseFailure", () => {
  it("falls back without coordinates for an unsupported thrown value", () => {
    const failure = normalizeFrontmatterParseFailure(
      new Error("secret source excerpt that must not leak"),
      1,
    );

    expect(failure).toEqual(
      new FrontmatterParseFailure({ reason: "YAML frontmatter could not be parsed" }),
    );
    expect(JSON.stringify(failure)).not.toContain("secret source excerpt");
  });

  it("bounds normalized parser prose to 256 Unicode code points", () => {
    const failure = normalizeFrontmatterParseFailure(
      new YAMLParseError([0, 1], "UNEXPECTED_TOKEN", "x".repeat(300)),
      1,
    );

    expect(Array.from(failure.reason)).toHaveLength(256);
    expect(failure.reason.endsWith("…")).toBe(true);
  });
});
