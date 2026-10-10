import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";

import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";
import { writeWorkspaceState } from "./test-support/protected-state.js";
import {
  readImportedMcpDeclaration,
  readImportedMcpManifest,
  readNativeMcpServers,
} from "./test-support/mcp-package-import-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/adoption-and-import-are-distinct",
  title: "MCP adoption and package conversion have separate command grammars",
  statement:
    "The mcps adopt command shall adopt selected native servers as inline entries in project or user scope. The mcps import command shall convert only the native server selected by its required name positional into the required project-workspace target extension, disabled unless --enable is supplied. Both routes shall preview without writes. Import shall refuse a missing or conflicting selection and native commands that cannot be represented losslessly. Removed mode and scope flags shall fail as usage errors before reading workspace state.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "process",
  boundaryRationale:
    "Only the built CLI establishes that the two published routes parse different inputs, select the intended native server, and preserve unselected content.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/mcps/adopt/selected-batch-is-atomic",
    "cli/mcps/adopt/preview-is-pure",
    "cli/mcps/import/creates-authored-package-from-native-server",
    "cli/mcps/import/package-enablement-is-explicit",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const remote = { type: "http", url: "https://mcp.example.test/alpha" };
const other = { type: "http", url: "https://mcp.example.test/beta" };
const writeNative = (
  root: string,
  entries: Readonly<Record<string, unknown>>,
  relative = ".mcp.json",
) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ mcpServers: entries }));
};
const readSettings = (root: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8"));
const decodeError = Schema.decodeUnknownSync(ErrorEnvelope);

describe("Separate MCP adoption and import routes", () => {
  it("previews then adopts only the selected inline server", async () => {
    const fixture = makeDirectoryFixture();
    try {
      writeWorkspaceState(fixture.invoking, { owner: "@acme", agents: ["claude-code"] });
      writeNative(fixture.invoking, { alpha: remote, beta: other });
      const before = snapshotTree(fixture.invoking);
      const args = ["mcps", "adopt", "--name", "alpha", "--json", "--non-interactive"];
      const preview = await fixture.run([...args, "--preview"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(snapshotTree(fixture.invoking)).toEqual(before);
      const applied = await fixture.run(args);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      const document: unknown = JSON.parse(applied.stdout);
      expect(document).toMatchObject({
        result: { outcome: "applied", adoptions: { adopted: 1, skipped: 0, conflicting: 0 } },
      });
      expect(readSettings(fixture.invoking)).toMatchObject({
        mcpServers: { alpha: { connection: { url: remote.url } } },
      });
      expect(readNativeMcpServers(fixture.invoking)["beta"]).toEqual(other);
      expect(fs.existsSync(path.join(fixture.invoking, "mcps"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  for (const enable of [false, true]) {
    it(`converts only the named server into a ${enable ? "enabled" : "disabled"} authored package`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        writeWorkspaceState(fixture.invoking, { owner: "@acme", agents: ["claude-code"] });
        writeNative(fixture.invoking, { alpha: remote, beta: other });
        const before = snapshotTree(fixture.invoking);
        const args = [
          "mcps",
          "import",
          "alpha",
          "@acme/mcps/context",
          ...(enable ? ["--enable"] : []),
          "--json",
          "--non-interactive",
        ];
        const preview = await fixture.run([...args, "--preview"]);
        expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
        expect(snapshotTree(fixture.invoking)).toEqual(before);
        const applied = await fixture.run(args);
        expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
        expect(readImportedMcpManifest(fixture.invoking)).toMatchObject({
          owner: "@acme",
          name: "context",
          type: "mcp-server",
          version: "0.1.0",
        });
        expect(readImportedMcpDeclaration(fixture.invoking)).toEqual({
          source: "workspace",
          enabled: enable,
        });
        expect(readNativeMcpServers(fixture.invoking)["beta"]).toEqual(other);
        expect(readNativeMcpServers(fixture.invoking)).not.toHaveProperty("alpha");
        expect(fs.existsSync(path.join(fixture.invoking, "mcps", "beta"))).toBe(false);
      } finally {
        fixture.cleanup();
      }
    });
  }

  for (const conflict of [false, true]) {
    it(`refuses a ${conflict ? "conflicting" : "missing"} named native server without writes`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        writeWorkspaceState(fixture.invoking, {
          owner: "@acme",
          agents: ["claude-code", "cursor"],
        });
        writeNative(fixture.invoking, { alpha: remote });
        if (conflict) writeNative(fixture.invoking, { alpha: other }, ".cursor/mcp.json");
        const before = snapshotTree(fixture.invoking);
        const failed = await fixture.run([
          "mcps",
          "import",
          conflict ? "alpha" : "missing",
          "@acme/mcps/context",
          "--json",
          "--non-interactive",
        ]);
        expect(failed.exitCode, failed.stdout + failed.stderr).not.toBe(0);
        const document: unknown = JSON.parse(failed.stdout);
        expect(decodeError(document)).toMatchObject({ ok: false });
        expect(snapshotTree(fixture.invoking)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }

  it("refuses a native command with inline-adoption recovery", async () => {
    const fixture = makeDirectoryFixture();
    try {
      writeWorkspaceState(fixture.invoking, { owner: "@acme", agents: ["claude-code"] });
      writeNative(fixture.invoking, { alpha: { command: "node", args: ["server.js"] } });
      const before = snapshotTree(fixture.invoking);
      const failed = await fixture.run([
        "mcps",
        "import",
        "alpha",
        "@acme/mcps/context",
        "--json",
        "--non-interactive",
      ]);
      expect(failed.exitCode, failed.stdout + failed.stderr).toBe(2);
      const document: unknown = JSON.parse(failed.stdout);
      expect(decodeError(document)).toMatchObject({ ok: false, code: "usage" });
      expect(failed.stdout).toContain("axm mcps adopt --name");
      expect(snapshotTree(fixture.invoking)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  for (const args of [
    ["import"],
    ["import", "alpha"],
    ["import", "alpha", "@acme/mcps/context", "--as", "other"],
    ["import", "alpha", "@acme/mcps/context", "--name", "beta"],
    ["import", "alpha", "@acme/mcps/context", "--scope", "user"],
    ["adopt", "--enable"],
    ["adopt", "--as", "@acme/mcps/context"],
  ]) {
    it(`rejects ${JSON.stringify(args)} before reading malformed workspace state`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        fs.writeFileSync(path.join(fixture.invoking, "axm.json"), "{ malformed");
        const before = snapshotTree(fixture.invoking);
        const failed = await fixture.run(["mcps", ...args, "--json", "--non-interactive"]);
        expect(failed.exitCode, failed.stdout + failed.stderr).toBe(2);
        const document: unknown = JSON.parse(failed.stdout);
        expect(decodeError(document)).toMatchObject({ ok: false, code: "usage" });
        expect(snapshotTree(fixture.invoking)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }
});
