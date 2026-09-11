/**
 * Built-CLI evidence for `cli/authoring-uses-project-workspace`.
 *
 * The specification lives in
 * `apps/cli/src/root/authoring-uses-project-workspace.spec.ts`, beside the
 * registered command tree that declares the project-workspace boundary. These
 * rows keep its process controls: a real invocation refusing `--scope user`
 * before any write, and authored content landing under the selected project
 * while a populated user workspace stays byte-identical.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { makeDirectoryFixture, unattendedProjectSetup } from "./test-support/directory-harness.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";
import {
  importedRemote,
  makeMcpPackageImportProcessFixture,
  readImportedMcpManifest,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "./test-support/mcp-package-import-fixture.js";
import { snapshotProtectedState, writeWorkspaceState } from "./test-support/protected-state.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/authoring-uses-project-workspace"],
  boundary: "process",
  rationale:
    "Only a real invocation shows a scope selector refused before the command runs and the authored package landing in the selected project directory while a populated user workspace is left untouched.",
});

describe("Authoring commands use the project workspace", () => {
  it("rejects user-scope creation before writes and creates in the selected project", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const settingsPath = path.join(fixture.selected, "axm.json");
      const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
        throw new Error("Setup did not create an object-shaped settings file");
      }
      fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, owner: "@acme" }));
      const beforeProject = snapshotWorkspaceContent(fixture.selected);
      const beforeHome = snapshotWorkspaceContent(fixture.home);
      const args = ["skills", "new", "scope-authored", "--owner", "@acme", "--json"];
      const refused = await fixture.run(["-C", fixture.selected, ...args, "--scope", "user"]);
      expect(refused.exitCode, refused.stdout + refused.stderr).toBe(2);
      expect(refused.stdout + refused.stderr).toContain("Unrecognized flag: --scope");
      expect(snapshotWorkspaceContent(fixture.selected)).toEqual(beforeProject);
      expect(snapshotWorkspaceContent(fixture.home)).toEqual(beforeHome);
      const created = await fixture.run(["-C", fixture.selected, ...args]);
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);
      expect(
        fs.existsSync(path.join(fixture.selected, "skills", "scope-authored", "skill.json")),
      ).toBe(true);
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual({});
      expect(snapshotWorkspaceContent(fixture.home)).toEqual(beforeHome);
    } finally {
      fixture.cleanup();
    }
  });

  for (const preview of [false, true])
    it(`MCP package import refuses user scope in ${preview ? "preview" : "apply"} and creates in the selected project`, async () => {
      const fixture = makeMcpPackageImportProcessFixture();
      try {
        const userRoot = path.join(fixture.home, ".axm", "workspace");
        writeWorkspaceState(path.join(fixture.home, ".axm"), {
          scope: "user",
          owner: "@acme",
          agents: ["claude-code"],
        });
        writeNativeRemoteMcp(userRoot);
        expect(readNativeMcpServers(userRoot)["native-context"]).toEqual(importedRemote);
        expect(readNativeMcpServers(fixture.selected)["native-context"]).toEqual(importedRemote);
        const beforeProject = snapshotProtectedState(fixture.selected);
        const beforeUser = snapshotProtectedState(userRoot);
        const beforeInvoking = snapshotWorkspaceContent(fixture.invoking);

        const refused = await fixture.importPackage([
          "--scope",
          "user",
          ...(preview ? ["--preview"] : []),
        ]);

        expect(refused.exitCode).not.toBe(0);
        const input: unknown = JSON.parse(refused.stdout);
        const failure = Schema.decodeUnknownSync(ErrorEnvelope)(input);
        expect(failure).toMatchObject({ code: "usage" });
        expect(failure.detail).toContain("project-workspace");
        expect(snapshotProtectedState(fixture.selected)).toEqual(beforeProject);
        expect(snapshotProtectedState(userRoot)).toEqual(beforeUser);
        expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(beforeInvoking);

        const created = await fixture.importPackage(["--scope", "project"]);
        expect(created.exitCode, created.stdout + created.stderr).toBe(0);
        expect(readImportedMcpManifest(fixture.selected)).toMatchObject({
          owner: "@acme",
          name: "context",
        });
        expect(snapshotProtectedState(userRoot)).toEqual(beforeUser);
        expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(beforeInvoking);
      } finally {
        fixture.cleanup();
      }
    });
});
