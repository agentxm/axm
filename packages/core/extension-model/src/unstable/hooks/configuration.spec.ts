import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HookManifestSchema, resolveHookConfiguration } from "./manifest-schema.js";

export const specification = defineSpecification({
  requirement: "extensions/hooks/resolve-typed-consumer-configuration",
  title: "Hook configuration preserves typed values and symbolic secrets",
  statement:
    "AXM shall validate Hook consumer configuration against author declarations, apply explicit consumer values before defaults without modifying package source, reject unknown keys and missing required or invalid values, and preserve secret values exclusively as symbolic environment references without resolving them.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const source = {
  owner: "@acme",
  type: "hook",
  name: "audit",
  version: "1.0.0",
  implementations: [
    {
      id: "claude",
      protocol: "claude-code",
      bindings: [
        {
          id: "log",
          event: "PostToolUse",
          handler: { type: "command", runtime: "node", entrypoint: "src/log.mjs" },
        },
      ],
    },
  ],
  configuration: {
    token: { type: "string", secret: true, required: true },
    label: { type: "string", default: "audit", maxLength: 12 },
    suffix: { type: "string", allowEmpty: true },
    enabled: { type: "boolean", default: true },
    limit: { type: "number", minimum: 0, maximum: 10, default: 5 },
    mode: { type: "enum", values: ["compact", "full"], default: "compact" },
  },
};
const manifest = Schema.decodeUnknownSync(HookManifestSchema)(source);

describe("Typed Hook configuration", () => {
  it("uses consumer values including false, zero, and explicitly permitted empty strings", () => {
    const before = JSON.stringify(manifest);
    const resolved = resolveHookConfiguration(manifest, {
      token: { env: "AUDIT_TOKEN" },
      enabled: false,
      limit: 0,
      suffix: "",
      mode: "full",
    });
    expect(resolved).toEqual(
      Result.succeed({
        token: { env: "AUDIT_TOKEN" },
        enabled: false,
        limit: 0,
        suffix: "",
        mode: "full",
        label: "audit",
      }),
    );
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it.each([
    { input: {}, key: "token", code: "missing" },
    { input: { token: "never-persist-secret" }, key: "token", code: "invalid" },
    { input: { token: { env: "TOKEN" }, extra: true }, key: "extra", code: "unknown" },
    { input: { token: { env: "TOKEN" }, enabled: "false" }, key: "enabled", code: "invalid" },
    { input: { token: { env: "TOKEN" }, label: "" }, key: "label", code: "invalid" },
    { input: { token: { env: "TOKEN" }, label: { env: "LABEL" } }, key: "label", code: "invalid" },
    { input: { token: { env: "TOKEN" }, limit: 11 }, key: "limit", code: "invalid" },
    { input: { token: { env: "TOKEN" }, mode: "unknown" }, key: "mode", code: "invalid" },
    { input: { token: { env: "TOKEN", value: "secret" } }, key: "token", code: "invalid" },
  ])("diagnoses invalid or missing $key without exposing input values", ({ input, key, code }) => {
    const resolved = resolveHookConfiguration(manifest, input);
    expect(Result.isFailure(resolved)).toBe(true);
    if (Result.isFailure(resolved))
      expect(resolved.failure).toEqual(
        expect.arrayContaining([expect.objectContaining({ key, code })]),
      );
    expect(JSON.stringify(resolved)).not.toContain("never-persist-secret");
  });

  it.each([
    { type: "enum", values: ["a"], default: "b" },
    { type: "string", secret: true, default: "token" },
    { type: "number", minimum: 3, maximum: 2 },
    { type: "string", minLength: 3, maxLength: 2 },
    { type: "number", maximum: 2, default: 3 },
    { type: "string", default: "" },
  ])("rejects inconsistent author declarations %#", (field) => {
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(HookManifestSchema)({ ...source, configuration: { field } }),
      ),
    ).toBe(true);
  });
});
