import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import {
  collectHelpFiles,
  JsonErrorEnvelopeSchema,
  writeWorkspaceFiles,
} from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../support/directory-harness.js";
import {
  importedRemote,
  makeMcpPackageImportProcessFixture,
  readImportedMcpManifest,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "../support/mcp-package-import-fixture.js";
import { snapshotProtectedState } from "../support/preview-purity.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/authoring-uses-project-workspace",
  title: "Authoring commands use the project workspace",
  statement:
    "Commands that create or change authored packages shall operate in the selected project workspace and reject a user-scope selector without changing either workspace.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The built CLI must reject a scope option before executing an authoring command and establish authored content under the selected project directory.",
  methods: ["contract", "example"],
  derivedFrom: ["packages/cli/src/root/scope-contract.ts", "packages/cli/src/app.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const authoringRoutes = [
  "adopt",
  "demote",
  "version",
  "publish",
  "fork",
  "skills import",
  "subagents import",
  "packs add",
  "packs remove",
  ...["skills", "mcps", "subagents", "rules", "hooks", "knowledge", "packs"].flatMap((type) => [
    `${type} new`,
    `${type} publish`,
  ]),
];

describe("Authoring commands use the project workspace", () => {
  it.effect("describes the project boundary for every authoring command", () =>
    Effect.gen(function* () {
      const help = yield* collectHelpFiles();
      for (const route of authoringRoutes) {
        const document = help.get(`axm ${route}`);
        expect(document, route).toBeDefined();
        expect(
          document?.flags.map((flag) => flag.name),
          route,
        ).not.toContain("scope");
        expect(document?.description.toLowerCase(), route).toContain("project-workspace");
      }
    }),
  );

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
        writeWorkspaceFiles(path.join(fixture.home, ".axm"), {
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
        const failure = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(input);
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
