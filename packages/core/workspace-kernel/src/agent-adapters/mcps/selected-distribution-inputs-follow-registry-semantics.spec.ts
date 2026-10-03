import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  mcpDistributionCandidates,
  resolveMcpInvocation,
  resolveMcpInputs,
  type McpBinding,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/selected-distribution-inputs-follow-registry-semantics",
  title: "MCP bindings honor the selected distribution's input semantics",
  statement:
    "AXM shall bind only inputs of the selected distribution through unique scoped locators, preserve fixed values, defaults, optional omission and repeated argument order, and refuse unused, ambiguous or unsafe bindings before settlement.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const fixture = (fields: Record<string, unknown>) => {
  const manifest = Schema.decodeUnknownSync(McpServerManifestSchema)({
    type: "mcp-server",
    owner: "@acme",
    name: "tool",
    version: "1.0.0",
    description: "Fixture",
    server: {
      name: "io.example/tool",
      description: "Fixture",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@example/tool",
          version: "1.0.0",
          transport: { type: "stdio" },
          ...fields,
        },
      ],
    },
  });
  const candidate = mcpDistributionCandidates(manifest)[0];
  if (candidate === undefined) throw new Error("Missing fixture candidate");
  return { manifest, candidate };
};

describe("scoped selected-distribution inputs", () => {
  it("isolates identical names by input location and omits unset optional arguments", () => {
    const { candidate } = fixture({
      runtimeArguments: [{ type: "named", name: "--mode", isRequired: true }],
      packageArguments: [
        { type: "named", name: "--mode", default: "server" },
        { type: "named", name: "--optional" },
      ],
      environmentVariables: [{ name: "MODE", default: "env" }],
    });
    const result = resolveMcpInputs(candidate, [
      {
        target: { kind: "runtime-argument", argument: { type: "named", name: "--mode" } },
        value: "runner",
      },
    ]);
    expect(result.findings).toEqual([]);
    expect(result.runtimeArguments).toEqual(["--mode", "runner"]);
    expect(result.packageArguments).toEqual(["--mode", "server"]);
    expect(result.environment).toEqual({ MODE: "env" });
  });
  it("keeps repeated arguments ordered and runtime options before the OCI image", () => {
    const { manifest, candidate } = fixture({
      registryType: "oci",
      identifier: "example/tool",
      runtimeArguments: [{ type: "named", name: "--mount", isRepeated: true, isRequired: true }],
      packageArguments: [{ type: "positional", value: "serve" }],
    });
    const result = resolveMcpInvocation({
      manifest,
      distribution: candidate.selector,
      bindings: [
        {
          target: { kind: "runtime-argument", argument: { type: "named", name: "--mount" } },
          values: ["first", "second"],
        },
      ],
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved" && result.connection.transport === "stdio")
      expect(result.connection.args).toEqual([
        "run",
        "-i",
        "--rm",
        "--mount",
        "first",
        "--mount",
        "second",
        "example/tool:1.0.0",
        "serve",
      ]);
  });
  it("substitutes only declared variables inside a fixed input", () => {
    const { candidate } = fixture({
      environmentVariables: [
        {
          name: "MODE",
          value: "prefix-{value}-{literal}",
          variables: { value: { isRequired: true } },
        },
      ],
    });
    const result = resolveMcpInputs(candidate, [
      { target: { kind: "environment", name: "MODE", variable: "value" }, value: "chosen" },
    ]);
    expect(result.environment).toEqual({ MODE: "prefix-chosen-{literal}" });
    expect(result.findings).toEqual([]);
  });
  it("propagates nested secret annotations and permits safe reference replacement of a secret default", () => {
    const { candidate } = fixture({
      environmentVariables: [
        {
          name: "CREDENTIAL",
          value: "Bearer {token}",
          variables: { token: { isSecret: true, default: "sentinel-private" } },
        },
      ],
    });
    const unsafe = resolveMcpInputs(candidate, []);
    expect(unsafe.findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(unsafe)).not.toContain("sentinel-private");
    const safe = resolveMcpInputs(candidate, [
      {
        target: { kind: "environment", name: "CREDENTIAL", variable: "token" },
        value: { env: "HOST_TOKEN" },
      },
    ]);
    expect(safe.findings).toEqual([]);
    expect(safe.environment).toEqual({
      CREDENTIAL: { template: ["Bearer ", { env: "HOST_TOKEN" }] },
    });
  });
  it("refuses secret argv even when a host could expand a reference", () => {
    const { candidate } = fixture({
      packageArguments: [
        {
          type: "named",
          name: "--auth",
          value: "{token}",
          variables: { token: { isSecret: true } },
        },
      ],
    });
    const result = resolveMcpInputs(candidate, [
      {
        target: {
          kind: "package-argument",
          argument: { type: "named", name: "--auth" },
          variable: "token",
        },
        value: { env: "TOKEN" },
      },
    ]);
    expect(result.findings.map(({ code }) => code)).toContain("secret-destination");
    expect(result.packageArguments).toEqual([]);
  });
  it.each([
    {
      fields: { environmentVariables: [{ name: "MODE", value: "fixed" }] },
      bindings: [{ target: { kind: "environment", name: "MODE" }, value: "override" }],
      code: "immutable-input",
    },
    {
      fields: { environmentVariables: [{ name: "MODE" }] },
      bindings: [{ target: { kind: "environment", name: "MODE" }, values: ["a", "b"] }],
      code: "input-not-repeatable",
    },
    {
      fields: {},
      bindings: [{ target: { kind: "header", name: "MODE" }, value: "unused" }],
      code: "unused-binding",
    },
    {
      fields: { environmentVariables: [{ name: "MODE", isRequired: true }] },
      bindings: [],
      code: "missing-binding",
    },
    {
      fields: { environmentVariables: [{ name: "MODE" }, { name: "MODE" }] },
      bindings: [],
      code: "ambiguous-input",
    },
  ] satisfies ReadonlyArray<{
    fields: Record<string, unknown>;
    bindings: ReadonlyArray<McpBinding>;
    code: string;
  }>)("refuses $code", ({ fields, bindings, code }) => {
    expect(
      resolveMcpInputs(fixture(fields).candidate, bindings).findings.map((finding) => finding.code),
    ).toContain(code);
  });
});
