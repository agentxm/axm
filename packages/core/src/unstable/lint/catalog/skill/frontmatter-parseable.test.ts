/**
 * Unit tests for `skill/frontmatter-parseable`.
 *
 * Arm coverage:
 *
 * 1. Leading UTF-8 BOM.
 * 2. Leading HTML comment (the regression that motivated the lint engine).
 * 3. Leading whitespace / non-`---` bytes.
 * 4. Bad YAML syntax.
 * 5. Non-mapping frontmatter (list).
 * 6. Non-mapping frontmatter (scalar).
 * 7. Valid mapping — zero findings.
 * 8. Missing SKILL.md — zero findings (covered by skill/skill-md-present).
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { SkillFileAccessor, SkillRuleContext } from "../../context.js";
import { frontmatterParseableRule } from "./frontmatter-parseable.js";

const encoder = new TextEncoder();

const makeAccessor = (content: string | undefined): SkillFileAccessor => ({
  exists: (path) => Effect.succeed(path === "SKILL.md" && content !== undefined),
  readBytes: (path) => {
    if (path !== "SKILL.md" || content === undefined) {
      return Effect.fail({
        _tag: "FileAccessError" as const,
        path,
        reason: "read-error" as const,
        message: "not found",
      });
    }
    return Effect.succeed(encoder.encode(content));
  },
});

const makeContext = (content: string | undefined): SkillRuleContext => {
  const accessor = makeAccessor(content);
  return {
    subject: { isNative: false, skillJson: undefined },
    files: accessor,
    packageFiles: accessor,
    displayRoot: "",
  };
};

const VALID_FRONTMATTER = `---
name: example
description: an example skill
---
body
`;

describe("skill/frontmatter-parseable", () => {
  it.effect("produces zero findings for valid mapping frontmatter", () =>
    Effect.gen(function* () {
      const findings = yield* frontmatterParseableRule.check(makeContext(VALID_FRONTMATTER));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("early-returns zero findings when SKILL.md is absent", () =>
    Effect.gen(function* () {
      const findings = yield* frontmatterParseableRule.check(makeContext(undefined));
      expect(findings).toEqual([]);
    }),
  );

  it.effect("flags leading UTF-8 BOM", () =>
    Effect.gen(function* () {
      const findings = yield* frontmatterParseableRule.check(
        makeContext(`\uFEFF${VALID_FRONTMATTER}`),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/BOM/i);
      expect(findings[0]?.location).toEqual({ file: "SKILL.md", line: 1 });
    }),
  );

  it.effect("flags leading HTML comment (the original regression)", () =>
    Effect.gen(function* () {
      const content = `<!-- generated file -->\n${VALID_FRONTMATTER}`;
      const findings = yield* frontmatterParseableRule.check(makeContext(content));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/HTML comment/i);
      expect(findings[0]?.location).toEqual({ file: "SKILL.md", line: 1 });
    }),
  );

  it.effect("flags leading whitespace before `---`", () =>
    Effect.gen(function* () {
      const findings = yield* frontmatterParseableRule.check(makeContext(`  ${VALID_FRONTMATTER}`));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/starts? with .*---/i);
    }),
  );

  it.effect("flags bad YAML inside frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
name: example
  bad: : : indentation
description: "unterminated
---
body
`;
      const findings = yield* frontmatterParseableRule.check(makeContext(content));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/YAML/i);
    }),
  );

  it.effect("flags non-mapping frontmatter (list)", () =>
    Effect.gen(function* () {
      const content = `---
- one
- two
---
body
`;
      const findings = yield* frontmatterParseableRule.check(makeContext(content));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/mapping/i);
    }),
  );

  it.effect("flags non-mapping frontmatter (scalar)", () =>
    Effect.gen(function* () {
      const content = `---
example
---
body
`;
      const findings = yield* frontmatterParseableRule.check(makeContext(content));
      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toMatch(/mapping/i);
    }),
  );
});
