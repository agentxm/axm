import { resolveHookImplementation } from "./resolution.js";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  HookManifestSchema,
  referencedHookPackageFiles,
  requiredHookRuntimeFiles,
} from "./manifest-schema.js";

export const specification = defineSpecification({
  requirement: "extensions/hooks/declare-unambiguous-native-implementations",
  title: "Hook extensions declare explicit native implementations with complete file references",
  statement:
    "A Hook extension shall identify native implementations and bindings uniquely, preserve exact native events and combined decision requirements, reference only declared configuration and safe package files, and select an implementation only when target constraints identify it unambiguously while reporting unknown host facts as conditions.",
  class: "functional",
  role: "interface",
  goals: ["agent-interoperability", "trustworthy-distribution"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const binding = {
  id: "guard",
  event: "PreToolUse",
  matcher: "Write|Edit",
  handler: { type: "command", runtime: "node", entrypoint: "src/guard.mjs" },
  requires: { outcomes: ["deny"], operations: ["modify-input"] },
};
const implementation = { id: "claude", protocol: "claude-code", bindings: [binding] };
const base = {
  owner: "@acme",
  type: "hook",
  name: "guard",
  version: "1.0.0",
  implementations: [implementation],
};
const decode = Schema.decodeUnknownSync(HookManifestSchema, { onExcessProperty: "error" });
const accepts = (value: unknown) =>
  Result.isSuccess(
    Schema.decodeUnknownResult(HookManifestSchema)(value, { onExcessProperty: "error" }),
  );

describe("Native Hook extension contracts", () => {
  it("preserves the native event, matcher, and combined requirements without translation", () => {
    const parsed = decode(base);
    expect(parsed.implementations[0].bindings[0]).toEqual(binding);
  });

  it.each([
    { ...base, implementations: [] },
    { ...base, implementations: [implementation, implementation] },
    { ...base, implementations: [{ ...implementation, bindings: [binding, binding] }] },
    { ...base, implementations: [{ ...implementation, bindings: [{ ...binding, id: "" }] }] },
    { ...base, implementations: [{ ...implementation, bindings: [{ ...binding, event: "" }] }] },
    {
      ...base,
      implementations: [
        {
          ...implementation,
          bindings: [{ ...binding, handler: { ...binding.handler, type: "http" } }],
        },
      ],
    },
    {
      ...base,
      implementations: [
        {
          ...implementation,
          bindings: [
            { ...binding, handler: { ...binding.handler, args: [{ config: "missing" }] } },
          ],
        },
      ],
    },
    { ...base, fallback: "auto" },
    { ...base, runtime: "node", entrypoint: "src/guard.mjs", bindings: [{ on: "tool.pre" }] },
    {
      ...base,
      fixtures: [
        {
          id: "case",
          implementation: "claude",
          binding: "missing",
          input: "fixtures/input.json",
          expect: { exitCode: 0 },
        },
      ],
    },
  ])("rejects incomplete, ambiguous, unsupported, or superseded declarations %#", (input) => {
    expect(accepts(input)).toBe(false);
  });

  it.each([
    "../guard.mjs",
    "src/../guard.mjs",
    "/guard.mjs",
    "C:/guard.mjs",
    "src\\guard.mjs",
    "src//guard.mjs",
    "src/./guard.mjs",
    "src/guard.mjs/",
    "src/guard\u0000.mjs",
  ])("rejects unsafe file reference %s", (entrypoint) => {
    expect(
      accepts({
        ...base,
        implementations: [
          {
            ...implementation,
            bindings: [{ ...binding, handler: { ...binding.handler, entrypoint } }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("enumerates every implementation, shared asset, and fixture input/output once", () => {
    const manifest = decode({
      ...base,
      implementations: [
        implementation,
        {
          id: "codex",
          protocol: "codex",
          bindings: [{ ...binding, handler: { ...binding.handler, entrypoint: "src/codex.mjs" } }],
        },
      ],
      assets: ["src/common.mjs", "src/guard.mjs"],
      fixtures: [
        {
          id: "denied",
          implementation: "claude",
          binding: "guard",
          input: "fixtures/input.json",
          expect: { exitCode: 2, stdout: "fixtures/stdout.json", stderr: "fixtures/stderr.txt" },
        },
      ],
    });
    expect(new Set(referencedHookPackageFiles(manifest))).toEqual(
      new Set([
        "src/common.mjs",
        "src/guard.mjs",
        "src/codex.mjs",
        "fixtures/input.json",
        "fixtures/stdout.json",
        "fixtures/stderr.txt",
      ]),
    );
    expect(referencedHookPackageFiles(manifest)).toHaveLength(6);
    expect(requiredHookRuntimeFiles(manifest)).toEqual([
      "src/common.mjs",
      "src/guard.mjs",
      "src/codex.mjs",
    ]);
  });

  it("reports unknown requirements, rejects mismatches, and never picks a first implementation", () => {
    const constrained = {
      ...implementation,
      requires: {
        scopes: ["user"],
        platforms: ["linux"],
        hostVersion: ">=2.0.0",
        profiles: ["cli"],
      },
    };
    const manifest = decode({ ...base, implementations: [constrained] });
    expect(resolveHookImplementation(manifest, "claude-code", { scope: "user" })).toMatchObject({
      status: "conditional",
      conditions: expect.arrayContaining([
        expect.stringContaining("Platform"),
        expect.stringContaining("version"),
        expect.stringContaining("profile"),
      ]),
    });
    expect(resolveHookImplementation(manifest, "claude-code", { scope: "project" }).status).toBe(
      "unsupported",
    );
    expect(
      resolveHookImplementation(manifest, "claude-code", { scope: "user", platform: "darwin" })
        .status,
    ).toBe("unsupported");
    expect(
      resolveHookImplementation(manifest, "claude-code", {
        scope: "user",
        platform: "linux",
        hostVersion: "2.1.0",
        profile: "cli",
        availableRuntimes: ["node"],
      }).status,
    ).toBe("selected");
    expect(
      resolveHookImplementation(
        decode({
          ...base,
          implementations: [implementation, { ...implementation, id: "alternate" }],
        }),
        "claude-code",
        { scope: "project" },
      ),
    ).toEqual({ status: "ambiguous", implementationIds: ["claude", "alternate"] });
  });
  it("selects only implementations whose complete native binding set is representable", () => {
    const incompatible = {
      ...implementation,
      id: "unsupported-event",
      bindings: [{ ...binding, event: "InventedEvent" }],
    };
    expect(
      resolveHookImplementation(
        decode({ ...base, implementations: [incompatible, implementation] }),
        "claude-code",
        { scope: "project" },
      ),
    ).toMatchObject({ status: "conditional", implementation: { id: "claude" } });
    expect(
      resolveHookImplementation(
        decode({ ...base, implementations: [incompatible] }),
        "claude-code",
        { scope: "project" },
      ),
    ).toMatchObject({ status: "unsupported", reasons: [expect.stringContaining("InventedEvent")] });
    expect(
      resolveHookImplementation(
        decode({ ...base, implementations: [{ ...implementation, protocol: "opencode" }] }),
        "opencode",
        { scope: "user" },
      ),
    ).toMatchObject({ status: "unsupported", reasons: [expect.stringContaining("writer")] });
  });
  it("refuses unsupported local command platforms and known missing interpreters", () => {
    const manifest = decode(base);
    expect(
      resolveHookImplementation(manifest, "claude-code", {
        scope: "project",
        platform: "win32",
      }),
    ).toMatchObject({ status: "unsupported", reasons: [expect.stringContaining("win32")] });
    expect(
      resolveHookImplementation(manifest, "claude-code", {
        scope: "project",
        platform: "linux",
        availableRuntimes: [],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [expect.stringContaining("node")] });
  });
});
