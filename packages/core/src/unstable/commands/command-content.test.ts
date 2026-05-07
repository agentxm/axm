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

  it("accepts frontmatter with description", () => {
    const result = decode({ description: "Deploy to staging" });
    expect(result.description).toBe("Deploy to staging");
  });

  it("accepts frontmatter with model as string", () => {
    const result = decode({ model: "claude-sonnet-4-20250514" });
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("accepts frontmatter with model as null (clears model)", () => {
    const result = decode({ model: null });
    expect(result.model).toBeNull();
  });

  it("accepts frontmatter with allowedTools as array", () => {
    const result = decode({ allowedTools: ["Read", "Write"] });
    expect(result.allowedTools).toEqual(["Read", "Write"]);
  });

  it("accepts frontmatter with allowedTools as null", () => {
    const result = decode({ allowedTools: null });
    expect(result.allowedTools).toBeNull();
  });

  it("accepts frontmatter with isolatedContext boolean", () => {
    const result = decode({ isolatedContext: true });
    expect(result.isolatedContext).toBe(true);
  });

  it("accepts frontmatter with isolatedContext false", () => {
    const result = decode({ isolatedContext: false });
    expect(result.isolatedContext).toBe(false);
  });

  it("accepts frontmatter with arguments array", () => {
    const result = decode({
      arguments: [
        { name: "target", description: "Build target", required: true },
        { name: "output", default: "./dist" },
      ],
    });
    expect(result.arguments).toHaveLength(2);
    expect(result.arguments?.[0]?.name).toBe("target");
    expect(result.arguments?.[1]?.default).toBe("./dist");
  });

  it("accepts frontmatter with argumentHint", () => {
    const result = decode({ argumentHint: "<target> [--verbose]" });
    expect(result.argumentHint).toBe("<target> [--verbose]");
  });

  it("accepts frontmatter with autoInvocable", () => {
    const result = decode({ autoInvocable: false });
    expect(result.autoInvocable).toBe(false);
  });

  it("accepts frontmatter with userInvocable", () => {
    const result = decode({ userInvocable: false });
    expect(result.userInvocable).toBe(false);
  });

  it("accepts frontmatter with all fields", () => {
    const input = {
      description: "Full command",
      model: "claude-sonnet-4-20250514",
      allowedTools: ["Read"],
      isolatedContext: true,
      arguments: [{ name: "file" }],
      argumentHint: "<file>",
      autoInvocable: true,
      userInvocable: true,
    };
    const result = decode(input);
    expect(result.description).toBe("Full command");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.isolatedContext).toBe(true);
    expect(result.autoInvocable).toBe(true);
    expect(result.userInvocable).toBe(true);
  });

  describe("synchronous decodeUnknownResult", () => {
    const decodeResult = Schema.decodeUnknownResult(CommandFrontmatterSchema);

    it("returns success for valid input", () => {
      const result = decodeResult({ description: "test" });
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("returns success for empty input", () => {
      const result = decodeResult({});
      expect(Result.isSuccess(result)).toBe(true);
    });

    it("returns failure for invalid arguments", () => {
      const result = decodeResult({ arguments: "not-an-array" });
      expect(Result.isFailure(result)).toBe(true);
    });
  });

  describe("encode roundtrip", () => {
    const encode = Schema.encodeUnknownSync(CommandFrontmatterSchema);

    it("roundtrips frontmatter with all fields", () => {
      const input = {
        description: "Roundtrip test",
        model: "gpt-4",
        allowedTools: ["Bash"],
        isolatedContext: true,
        arguments: [{ name: "arg1", required: true }],
        argumentHint: "<arg1>",
        autoInvocable: false,
        userInvocable: false,
      };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });

    it("roundtrips frontmatter with null model", () => {
      const input = { model: null };
      const decoded = decode(input);
      const encoded = encode(decoded);
      expect(encoded).toEqual(input);
    });
  });
});

describe("parseCommandMd", () => {
  it.effect("parses command content with valid frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
description: Deploy application
model: claude-sonnet-4-20250514
isolatedContext: true
---
# Deploy

Run the deployment pipeline.`;

      const result = yield* parseCommandMd(content);
      expect(Option.isSome(result.frontmatter)).toBe(true);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm.description).toBe("Deploy application");
      expect(fm.model).toBe("claude-sonnet-4-20250514");
      expect(fm.isolatedContext).toBe(true);
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

  it.effect("parses command content with arguments in frontmatter", () =>
    Effect.gen(function* () {
      const content = `---
arguments:
  - name: target
    description: Build target
    required: true
  - name: output
    default: ./dist
---
Build the project.`;

      const result = yield* parseCommandMd(content);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm.arguments).toHaveLength(2);
      expect(fm.arguments?.[0]?.name).toBe("target");
      expect(fm.arguments?.[0]?.required).toBe(true);
    }),
  );

  it.effect("parses command content with null model", () =>
    Effect.gen(function* () {
      const content = `---
model: null
---
Body.`;
      const result = yield* parseCommandMd(content);
      const fm = Option.getOrThrow(result.frontmatter);
      expect(fm.model).toBeNull();
    }),
  );

  it.effect("fails on invalid frontmatter schema", () =>
    Effect.gen(function* () {
      const content = `---
arguments: not-an-array
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
      // Empty YAML frontmatter parses as Option.none()
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
      autoInvocable: true,
      userInvocable: true,
    });
    expect(result.description).toBe("Deploy app");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("projects undefined fields as undefined", () => {
    const result = projectFrontmatterToManifest({});
    expect(result.description).toBeUndefined();
    expect(result.model).toBeUndefined();
  });

  it("projects null model", () => {
    const result = projectFrontmatterToManifest({ model: null });
    expect(result.model).toBeNull();
  });
});
