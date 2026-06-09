import { readFileSync } from "node:fs";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  McpRegistryServerDetailSchema,
  McpServerManifestSchema,
} from "./manifest-schema.js";

describe("McpServerManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(McpServerManifestSchema);
  const server = {
    $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
    name: "io.github.wayne/batcave-mcp",
    description: "MCP server for Batcave systems",
    version: "1.0.0",
  };

  it("accepts valid minimal manifest", () => {
    const input = {
      owner: "@wayne",
      type: "mcp-server",
      name: "batcave-mcp",
      version: "1.0.0",
      server,
    };
    const result = decode(input);
    expect(result.name).toBe("batcave-mcp");
    expect(result.version).toBe("1.0.0");
    expect(result.server.name).toBe("io.github.wayne/batcave-mcp");
  });

  it("accepts valid full manifest with all optional fields", () => {
    const input = {
      owner: "@wayne",
      type: "mcp-server",
      name: "batcave-mcp",
      version: "1.0.0",
      description: "MCP server for Batcave systems",
      keywords: ["mcp", "batcave"],
      repository: "https://github.com/wayne/batcave-mcp",
      homepage: "https://wayne.tech/batcave",
      license: "MIT",
      bugs: "https://github.com/wayne/batcave-mcp/issues",
      authors: [{ name: "Alfred Pennyworth" }],
      packages: [{ purl: "pkg:npm/%40wayne/batcave-toolkit", versionRange: "vers:npm/>=2.0.0" }],
      server: {
        ...server,
        title: "Batcave MCP",
        repository: {
          url: "https://github.com/wayne/batcave-mcp",
          source: "github",
        },
        packages: [
          {
            registryType: "npm",
            identifier: "@wayne/batcave-mcp",
            version: "1.0.0",
            runtimeHint: "npx",
            transport: { type: "stdio" },
            environmentVariables: [
              {
                name: "BATCAVE_TOKEN",
                description: "API token",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.wayne.tech/batcave",
          },
          {
            type: "sse",
            url: "https://mcp.wayne.tech/batcave/sse",
            headers: [{ name: "Authorization", value: "Bearer {token}" }],
            variables: {
              token: {
                description: "Bearer token",
                isRequired: true,
                isSecret: true,
              },
            },
          },
        ],
        icons: [{ src: "https://wayne.tech/batcave.png", mimeType: "image/png" }],
        websiteUrl: "https://wayne.tech/batcave",
        _meta: { "com.wayne/security-level": "secret" },
      },
    };
    const result = decode(input);
    expect(result.description).toBe("MCP server for Batcave systems");
    expect(result.authors?.[0]?.name).toBe("Alfred Pennyworth");
    expect(result.server.packages?.[0]?.registryType).toBe("npm");
    expect(result.server.remotes?.map((remote) => remote.type)).toEqual(["streamable-http", "sse"]);
  });

  it("rejects manifest missing required fields", () => {
    const input = { description: "MCP server" };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest with invalid name format", () => {
    const input = {
      owner: "wayne",
      type: "mcp-server",
      name: "batcave-mcp",
      version: "1.0.0",
      server,
    };
    expect(() => decode(input)).toThrow();
  });

  it("rejects manifest missing server detail", () => {
    const input = {
      owner: "@wayne",
      type: "mcp-server",
      name: "batcave-mcp",
      version: "1.0.0",
    };
    expect(() => decode(input)).toThrow();
  });
});

describe("McpRegistryServerDetailSchema", () => {
  const decode = Schema.decodeUnknownSync(McpRegistryServerDetailSchema);

  it("accepts tombstone-style details without packages or remotes", () => {
    const result = decode({
      name: "io.github.wayne/batcave-mcp",
      description: "MCP server for Batcave systems",
      version: "1.0.0",
    });

    expect(result.packages).toBeUndefined();
    expect(result.remotes).toBeUndefined();
  });

  it("rejects package entries without a transport", () => {
    expect(() =>
      decode({
        name: "io.github.wayne/batcave-mcp",
        description: "MCP server for Batcave systems",
        version: "1.0.0",
        packages: [{ registryType: "npm", identifier: "@wayne/batcave-mcp" }],
      }),
    ).toThrow();
  });
});

describe("MCP registry server schema mirror", () => {
  const readJson = (url: URL) => JSON.parse(readFileSync(url, "utf8"));

  it("tracks the upstream ServerDetail contract embedded in AXM manifests", () => {
    const upstream = readJson(new URL("upstream/server.schema.json", import.meta.url));
    const generated = readJson(
      new URL("../../../site-content/__generated__/schemas/mcp.schema.json", import.meta.url),
    );

    const upstreamServerDetail = upstream.definitions.ServerDetail;
    const mirroredServerDetail = generated.definitions.McpRegistryServerDetail;

    expect(mirroredServerDetail.required).toEqual(upstreamServerDetail.required);
    expect(Object.keys(mirroredServerDetail.properties).sort()).toEqual(
      Object.keys(upstreamServerDetail.properties).sort(),
    );
    expect(mirroredServerDetail.properties.name.allOf[1].pattern.replaceAll("\\/", "/")).toEqual(
      upstreamServerDetail.properties.name.pattern,
    );
    expect(generated.definitions.McpServerManifest.properties.server.$ref).toBe(
      "#/definitions/McpRegistryServerDetail",
    );
  });
});
