import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { ContextFilesManifestSchema } from "./manifest-schema.js";

describe("ContextFilesManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(ContextFilesManifestSchema);

  it("accepts a valid static sync-always manifest", () => {
    const input = {
      owner: "@wayne",
      type: "file",
      name: "editor-baseline",
      version: "1.0.0",
      inputs: {
        projectName: { type: "string", prompt: "Project name" },
        strict: { type: "boolean", default: true },
      },
      contents: [
        {
          source: { kind: "static", path: ".editorconfig" },
          target: ".editorconfig",
          mode: "sync-always",
        },
      ],
    };

    const result = decode(input);

    expect(result.type).toBe("file");
    expect(result.name).toBe("editor-baseline");
    expect(result.contents[0]?.mode).toBe("sync-always");
  });

  it("accepts ordered static concatenation and managed regions", () => {
    const input = {
      owner: "@wayne",
      type: "file",
      name: "readme-baseline",
      version: "1.0.0",
      contents: [
        {
          source: { kind: "static", path: ["intro.md", "usage.md"] },
          target: "README.md",
          mode: "managed-region",
          region: "usage",
          anchor: "## Usage",
        },
      ],
    };

    const result = decode(input);

    expect(result.contents[0]?.source.kind).toBe("static");
    expect(result.contents[0]?.mode).toBe("managed-region");
  });

  it("accepts generated content sources", () => {
    const input = {
      owner: "@wayne",
      type: "file",
      name: "workspace-index",
      version: "1.0.0",
      contents: [
        {
          source: {
            kind: "generated",
            generator: { name: "file-index", options: { maxDepth: 3, includeHidden: false } },
          },
          target: "README.md",
          mode: "managed-region",
          region: "workspace-index",
        },
      ],
    };

    const result = decode(input);

    expect(result.contents[0]?.source.kind).toBe("generated");
  });

  it("rejects managed-region entries without a region id", () => {
    const input = {
      owner: "@wayne",
      type: "file",
      name: "readme-baseline",
      version: "1.0.0",
      contents: [
        {
          source: { kind: "template", path: "readme.md" },
          target: "README.md",
          mode: "managed-region",
        },
      ],
    };

    expect(() => decode(input)).toThrow();
  });

  it("rejects empty contents", () => {
    const input = {
      owner: "@wayne",
      type: "file",
      name: "empty",
      version: "1.0.0",
      contents: [],
    };

    expect(() => decode(input)).toThrow();
  });
});
