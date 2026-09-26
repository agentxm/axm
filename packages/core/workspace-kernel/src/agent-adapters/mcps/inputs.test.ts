import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  collectRequiredInputNames,
  collectSecretInputNames,
  manifestInputs,
  mcpProjectionInputValues,
} from "./inputs.js";

const manifest = Schema.decodeUnknownSync(McpServerManifestSchema)({
  owner: "@acme",
  type: "mcp-server",
  name: "context",
  version: "1.0.0",
  server: {
    name: "ai.acme/context",
    description: "Context",
    version: "1.0.0",
    packages: [
      {
        registryType: "npm",
        identifier: "@acme/context",
        version: "1.0.0",
        transport: { type: "stdio" },
        environmentVariables: [
          { name: "API_TOKEN", isRequired: true, isSecret: true },
          { name: "REGION", isRequired: false },
        ],
        runtimeArguments: [
          { type: "named", name: "--profile", isRequired: true },
          { type: "positional", valueHint: "INPUT_PATH", isRequired: true, isSecret: true },
          { type: "positional", value: "fixed" },
        ],
        packageArguments: [{ type: "named", name: "--optional", isRequired: true, default: "x" }],
      },
    ],
    remotes: [
      {
        type: "streamable-http",
        url: "https://mcp.acme.test/{TENANT}",
        headers: [{ name: "Authorization", value: "Bearer {SESSION}", isSecret: true }],
        variables: {
          TENANT: { isRequired: true, isSecret: false },
          SESSION: { isSecret: true, default: "session-ref" },
        },
      },
    ],
  },
});

describe("MCP projection input values", () => {
  it("collects every secret input by the name a value is supplied under", () => {
    expect([...collectSecretInputNames(manifest)].sort()).toEqual([
      "API_TOKEN",
      "Authorization",
      "INPUT_PATH",
      "SESSION",
    ]);
  });

  it("enumerates all five input classes and skips unnamed positional literals", () => {
    expect(manifestInputs(manifest).map((input) => input.name)).toEqual([
      "API_TOKEN",
      "REGION",
      "--profile",
      "INPUT_PATH",
      "--optional",
      "Authorization",
      "TENANT",
      "SESSION",
    ]);
    expect([...collectRequiredInputNames(manifest)].sort()).toEqual([
      "--profile",
      "API_TOKEN",
      "INPUT_PATH",
      "TENANT",
    ]);
  });

  it("supplies every secret as its reference and keeps configured values", () => {
    expect(
      mcpProjectionInputValues(
        { REGION: "eu", API_TOKEN: "literal-token" },
        new Set(["API_TOKEN"]),
      ),
    ).toEqual({ REGION: "eu", API_TOKEN: "${API_TOKEN}" });
  });

  it("supplies a stored secret the configuration omits as its reference", () => {
    expect(mcpProjectionInputValues({}, new Set(["API_TOKEN"]))).toEqual({
      API_TOKEN: "${API_TOKEN}",
    });
  });
});
