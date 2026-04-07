/**
 * Unit tests for managed marker utilities.
 */

import { describe, expect, it } from "@effect/vitest";
import { generateMarker, isManagedByAxm, stripMarker } from "./managed-marker.js";

describe("generateMarker", () => {
  it("produces an HTML comment for markdown format", () => {
    const marker = generateMarker("skill", "markdown");
    expect(marker).toBe(`<!-- Managed by axm — see "axm skill --help" -->`);
  });

  it("produces a hash comment for toml format", () => {
    const marker = generateMarker("command", "toml");
    expect(marker).toBe(`# Managed by axm — see "axm command --help"`);
  });

  it("produces a hash comment for text format", () => {
    const marker = generateMarker("mcp-server", "text");
    expect(marker).toBe(`# Managed by axm — see "axm mcp-server --help"`);
  });

  it("is parameterized by extension type", () => {
    const skill = generateMarker("skill", "markdown");
    const command = generateMarker("command", "markdown");
    expect(skill).not.toBe(command);
    expect(skill).toContain("skill");
    expect(command).toContain("command");
  });

  it("result validates against ManagedMarkerSchema", () => {
    const marker = generateMarker("skill", "markdown");
    // Should be a branded string — Schema.decodeUnknownSync should accept it as-is
    expect(typeof marker).toBe("string");
  });
});

describe("isManagedByAxm", () => {
  it("returns true for content starting with a markdown marker", () => {
    const marker = generateMarker("skill", "markdown");
    const content = `${marker}\nSome body content`;
    expect(isManagedByAxm(content)).toBe(true);
  });

  it("returns true for content starting with a toml marker", () => {
    const marker = generateMarker("command", "toml");
    const content = `${marker}\nkey = "value"`;
    expect(isManagedByAxm(content)).toBe(true);
  });

  it("returns true for content starting with a text marker", () => {
    const marker = generateMarker("subagent", "text");
    const content = `${marker}\nSome text`;
    expect(isManagedByAxm(content)).toBe(true);
  });

  it("returns false for empty content", () => {
    expect(isManagedByAxm("")).toBe(false);
  });

  it("returns false when marker is in the middle of file", () => {
    const marker = generateMarker("skill", "markdown");
    const content = `Some preamble\n${marker}\nBody`;
    expect(isManagedByAxm(content)).toBe(false);
  });

  it("returns false for marker-like strings that are not exact matches", () => {
    expect(isManagedByAxm("<!-- Managed by something else -->")).toBe(false);
    expect(isManagedByAxm("# Managed by something else")).toBe(false);
    expect(isManagedByAxm("<!-- Managed by axm -->")).toBe(false);
  });

  it("returns true for marker-only content (no body)", () => {
    const marker = generateMarker("skill", "markdown");
    expect(isManagedByAxm(marker)).toBe(true);
  });

  it("round-trips: generateMarker → isManagedByAxm returns true", () => {
    for (const format of ["markdown", "toml", "text"] as const) {
      for (const type of ["skill", "command", "mcp-server", "subagent"]) {
        const marker = generateMarker(type, format);
        expect(isManagedByAxm(marker)).toBe(true);
        expect(isManagedByAxm(`${marker}\nbody`)).toBe(true);
      }
    }
  });
});

describe("stripMarker", () => {
  it("removes the marker line from the beginning of content", () => {
    const marker = generateMarker("skill", "markdown");
    const body = "Some body content\nMore lines";
    const content = `${marker}\n${body}`;
    expect(stripMarker(content)).toBe(body);
  });

  it("returns the same content when no marker is present", () => {
    const content = "Just regular content\nWith lines";
    expect(stripMarker(content)).toBe(content);
  });

  it("removes only the first line if it is a marker", () => {
    const marker = generateMarker("command", "toml");
    const secondMarker = generateMarker("skill", "markdown");
    const content = `${marker}\n${secondMarker}\nBody`;
    expect(stripMarker(content)).toBe(`${secondMarker}\nBody`);
  });

  it("handles marker-only content (no body)", () => {
    const marker = generateMarker("skill", "markdown");
    expect(stripMarker(marker)).toBe("");
  });

  it("handles empty content", () => {
    expect(stripMarker("")).toBe("");
  });

  it("preserves content when marker is not on the first line", () => {
    const marker = generateMarker("skill", "markdown");
    const content = `Preamble\n${marker}\nBody`;
    expect(stripMarker(content)).toBe(content);
  });
});
