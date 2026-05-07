import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CommandManifestSchema } from "./manifest-schema.js";

describe("CommandManifestSchema", () => {
  const decode = Schema.decodeUnknownSync(CommandManifestSchema);

  it("accepts valid minimal manifest", () => {
    const input = {
      owner: "@wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
    };
    const result = decode(input);
    expect(result.name).toBe("batcomputer-sync");
    expect(result.version).toBe("1.0.0");
  });

  it("rejects manifest missing version", () => {
    const input = { owner: "@wayne", type: "command", name: "batcomputer-sync" };
    expect(() => decode(input)).toThrow();
  });

  it("ignores residual agents field while decoding older manifests", () => {
    const input = {
      owner: "@wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
      agents: ["claude-code", "codex"],
    };
    const result = decode(input);
    expect("agents" in result).toBe(false);
  });

  it("accepts manifest with agentOverrides", () => {
    const input = {
      owner: "@wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
      agentOverrides: {
        codex: { model: "o3" },
      },
    };
    const result = decode(input);
    expect(result.agentOverrides).toEqual({ codex: { model: "o3" } });
  });

  it("accepts manifest without agents or agentOverrides", () => {
    const input = {
      owner: "@wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
    };
    const result = decode(input);
    expect(result.agentOverrides).toBeUndefined();
  });

  it("rejects manifest with invalid name format", () => {
    const input = {
      owner: "wayne",
      type: "command",
      name: "batcomputer-sync",
      version: "1.0.0",
    };
    expect(() => decode(input)).toThrow();
  });
});
