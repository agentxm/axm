/**
 * Unit tests for command content parsing and frontmatter schemas.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import {
  CommandFrontmatterSchema,
  ManifestFieldsFromFrontmatterSchema,
  parseCommandMd,
  projectFrontmatterToManifest,
} from "./command-content.js";

describe("CommandFrontmatterSchema", () => {
  const decode = Schema.decodeUnknownSync(CommandFrontmatterSchema);

  it("accepts empty frontmatter", () => {
    const result = decode({});
    expect(result).toEqual({});
  });

  it("accepts arbitrary frontmatter keys", () => {
    const result = decode({
      description: "Deploy to staging",
      "argument-hint": "<target>",
      allowedTools: ["Read", "Write"],
      nested: { keep: true },
    });

    expect(result["description"]).toBe("Deploy to staging");
    expect(result["argument-hint"]).toBe("<target>");
    expect(result["allowedTools"]).toEqual(["Read", "Write"]);
    expect(result["nested"]).toEqual({ keep: true });
  });

  describe("synchronous decodeUnknownResult", () => {
    const decodeResult = Schema.decodeUnknownResult(CommandFrontmatterSchema);

    it("returns success for valid input", () => {
      const result = decodeResult({ description: "test" });
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("returns success for previously typed fields with any value shape", () => {
      const result = decodeResult({ arguments: "not-an-array" });
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("returns failure for non-object frontmatter", () => {
      const result = decodeResult("not-an-object");
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("encode roundtrip", () => {
    const encode = Schema.encodeUnknownSync(CommandFrontmatterSchema);

    it("roundtrips arbitrary frontmatter", () => {
      const input = {
        description: "Roundtrip test",
        model: null,
        "allowed-tools": ["Bash"],
        config: { nested: true },
      };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });
  });
});

describe("parseCommandMd", () => {
  it.effect("parses command content with opaque frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
description: Deploy application
argument-hint: <target>
isolatedContext: true
---
# Deploy

Run the deployment pipeline.`;

      const result = yield* parseCommandMd(content);
      expect(Option.isSome(result.frontmatter)).toBe(true);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm["description"]).toBe("Deploy application");
      expect(fm["argument-hint"]).toBe("<target>");
      expect(fm["isolatedContext"]).toBe(true);
      expect(result.body).toContain("# Deploy");
    }),
  );

  it.effect("parses command content without frontmatter", () =>
    Effect.gen(function* () {
      const content = "# Simple Command\n\nJust a body.";
      const result = yield* parseCommandMd(content);
      expect(Option.isNone(result.frontmatter)).toBe(true);
      expect(result.body).toBe(content);
    }),
  );

  it.effect("preserves arbitrary argument frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
arguments: not-an-array
---
Build the project.`;

      const result = yield* parseCommandMd(content);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm["arguments"]).toBe("not-an-array");
    }),
  );

  it.effect("fails on non-mapping frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
- not
- a
- mapping
---
Body.`;
      const exit = yield* parseCommandMd(content).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect("parses command content with empty frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
---
Body after empty frontmatter.`;
      const result = yield* parseCommandMd(content);
      expect(Option.isNone(result.frontmatter)).toBe(true);
      expect(result.body).toBe("Body after empty frontmatter.");
    }),
  );
});

describe("ManifestFieldsFromFrontmatterSchema", () => {
  const decode = Schema.decodeUnknownSync(ManifestFieldsFromFrontmatterSchema);

  it("accepts description and model", () => {
    const result = decode({ description: "test", model: "gpt-4" });
    expect(result.description).toBe("test");
    expect(result.model).toBe("gpt-4");
  });

  it("accepts empty object", () => {
    const result = decode({});
    expect(result).toEqual({});
  });

  it("accepts null model", () => {
    const result = decode({ model: null });
    expect(result.model).toBeNull();
  });
});

describe("projectFrontmatterToManifest", () => {
  it("projects description and model from frontmatter", () => {
    const result = projectFrontmatterToManifest({
      description: "Deploy app",
      model: "claude-sonnet-4-20250514",
      isolatedContext: true,
    });
    expect(result.description).toBe("Deploy app");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("ignores manifest fields with non-manifest value shapes", () => {
    const result = projectFrontmatterToManifest({ description: 42, model: false });
    expect(result.description).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it("projects null model", () => {
    const result = projectFrontmatterToManifest({ model: null });
    expect(result.model).toBeNull();
  });
});
