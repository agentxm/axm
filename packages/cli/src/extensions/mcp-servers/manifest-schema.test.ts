import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { McpServerManifestSchema } from "./manifest-schema";

describe("McpServerManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(McpServerManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = { name: "@wayne/mcp-servers/batcave-mcp", version: "1.0.0" };
    const result = decode(input);
    expect(result.name).toBe("@wayne/mcp-servers/batcave-mcp");
    expect(result.version).toBe("1.0.0");
  });

  it("accepts valid full manifest with all optional fields", () => {
    const input = {
      name: "@wayne/mcp-servers/batcave-mcp",
      version: "1.0.0",
      description: "MCP server for Batcave systems",
      keywords: ["mcp", "batcave"],
      repository: "https://github.com/wayne/batcave-mcp",
      homepage: "https://wayne.tech/batcave",
      license: "MIT",
      bugs: "https://github.com/wayne/batcave-mcp/issues",
      authors: [{ name: "Alfred Pennyworth" }],
    };
    const result = decode(input);
    expect(result.description).toBe("MCP server for Batcave systems");
    expect(result.authors?.[0]?.name).toBe("Alfred Pennyworth");
  });

  it("rejects manifest missing required fields", () => {
    const input = { description: "MCP server" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = { name: "batcave-mcp", version: "1.0.0" };
    expect(() => decode(input)).toThrow();
  });
});
