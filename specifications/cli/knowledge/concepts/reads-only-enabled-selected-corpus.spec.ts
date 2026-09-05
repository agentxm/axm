import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleKnowledgeConceptQuery,
  handleKnowledgeConceptSearch,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeListQueryResultSchema,
} from "axm.sh/specification-harness";
import {
  knowledgeDocument,
  knowledgeQueryOptions,
  makeKnowledgeSpecWorkspace,
} from "../../../support/knowledge-harness.js";

import { makeDirectoryFixture } from "../../../support/directory-harness.js";
import { writeLocalKnowledgePackage } from "../../../support/extension-fixtures.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/concepts/reads-only-enabled-selected-corpus",
  title: "Discovery reads only enabled bundles in the selected workspace",
  statement:
    "When discovering Knowledge, AXM shall read the enabled bundles in the selected workspace regardless of instruction-entry visibility and reflect current source content without changing workspace state.",
  class: "functional",
  role: "experience",
  goals: ["knowledge-access", "machine-automation", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "Populated project and user workspaces with the same Knowledge identity establish real scope composition, process argument selection, and preservation of both authoritative workspaces and native files.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/help/topics/knowledge.md",
    "packages/cli/src/root/knowledge/inspect.ts",
    "packages/cli-e2e/src/knowledge.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Selected Knowledge corpus", () => {
  it.effect(
    "includes instruction-hidden concepts, excludes disabled bundles, and observes later source edits",
    () => {
      const workspace = makeKnowledgeSpecWorkspace({
        bundles: [
          {
            name: "platform",
            instructionEntry: false,
            documents: { "session.md": knowledgeDocument("# Session\n\nOriginal.\n") },
          },
          {
            name: "disabled",
            enabled: false,
            documents: { "secret.md": knowledgeDocument("# Unselected\n") },
          },
        ],
      });
      return workspace.provide(
        Effect.gen(function* () {
          const beforeRead = snapshotWorkspaceContent(workspace.root);
          yield* handleKnowledgeConceptQuery("project", knowledgeQueryOptions);
          const first = workspace.readQueryPage();
          expect(first.items.map((item) => item.ref.bundle)).toEqual(["@acme/knowledge/platform"]);
          expect(snapshotWorkspaceContent(workspace.root)).toEqual(beforeRead);
          const revisedDocument = knowledgeDocument("# Session\n\nRevised searchable content.\n");
          workspace.writeDocument("session.md", revisedDocument);
          const afterSourceEdit = snapshotWorkspaceContent(workspace.root);
          yield* handleKnowledgeConceptSearch("revised", "project");
          expect(workspace.readQueryPage().items.map((item) => item.ref.conceptId)).toEqual([
            "session",
          ]);
          expect(workspace.readQueryPage().corpusFingerprint).not.toBe(first.corpusFingerprint);
          expect(snapshotWorkspaceContent(workspace.root)).toEqual(afterSourceEdit);
          expect(workspace.readFile("knowledge/platform/src/session.md")).toBe(revisedDocument);
        }).pipe(Effect.ensuring(Effect.sync(workspace.cleanup))),
      );
    },
  );
  it("selects populated project and user corpora without changing either scope", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const run = (args: ReadonlyArray<string>) =>
        fixture.run(["-C", fixture.selected, ...args, "--non-interactive", "--json"]);
      const payload = (text: string): unknown => {
        const value: unknown = JSON.parse(text);
        expect(value).toMatchObject({ ok: true });
        if (typeof value !== "object" || value === null || !("result" in value))
          throw new Error("Expected successful CLI result");
        return value.result;
      };
      const scopes = ["project", "user"] as const;
      const installed = new Map<
        string,
        { readonly sourceRoot: string; readonly document: string; readonly marker: string }
      >();
      for (const scope of scopes) {
        const setup = await run(["setup", "--yes", "--scope", scope, "--agent", "claude-code"]);
        expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
        const marker = scope === "project" ? "Projectscopewitness" : "Userscopewitness";
        const document = knowledgeDocument(`# Session\n\n${marker}.\n`);
        for (const name of ["platform", "disabled"]) {
          const source = writeLocalKnowledgePackage(path.join(fixture.root, `${scope}-source`), {
            name,
          });
          fs.writeFileSync(
            path.join(source, "src", "index.md"),
            '---\nokf_version: "0.2"\n---\n# Knowledge\n\n[Session](session.md)\n',
          );
          fs.writeFileSync(
            path.join(source, "src", "session.md"),
            name === "platform"
              ? document
              : knowledgeDocument("# Disabled\n\nDisabledscopewitness.\n"),
          );
          const result = await run(["knowledge", "install", source, "--scope", scope]);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        }
        const disabled = await run(["knowledge", "disable", "disabled", "--scope", scope]);
        expect(disabled.exitCode, disabled.stdout + disabled.stderr).toBe(0);
        const workspace =
          scope === "project" ? fixture.selected : path.join(fixture.home, ".axm", "workspace");
        const settingsPath = path.join(workspace, "axm.json");
        const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        if (typeof settings !== "object" || settings === null || !("knowledge" in settings))
          throw new Error("Expected installed Knowledge settings");
        const knowledge = settings.knowledge;
        if (typeof knowledge !== "object" || knowledge === null || !("platform" in knowledge))
          throw new Error("Expected platform entry");
        const authoredPlatform = knowledge.platform;
        const platform =
          typeof authoredPlatform === "string" ? { source: authoredPlatform } : authoredPlatform;
        if (typeof platform !== "object" || platform === null)
          throw new Error("Expected sourced platform entry");
        fs.writeFileSync(
          settingsPath,
          JSON.stringify({
            ...settings,
            knowledge: { ...knowledge, platform: { ...platform, instructionEntry: false } },
          }),
        );
        const inventory = await run(["knowledge", "list", "--scope", scope]);
        expect(inventory.exitCode, inventory.stdout + inventory.stderr).toBe(0);
        const bundle = Schema.decodeUnknownSync(KnowledgeListQueryResultSchema)(
          payload(inventory.stdout),
        ).items.find((item) => item.name === "platform");
        if (bundle === undefined) throw new Error("Expected installed platform bundle");
        expect(fs.readFileSync(path.join(bundle.sourceRoot, "session.md"), "utf8")).toBe(document);
        installed.set(scope, { sourceRoot: bundle.sourceRoot, document, marker });
      }
      const beforeReads = snapshotWorkspaceContent(fixture.root);
      for (const scope of scopes) {
        const expected = installed.get(scope);
        const other = installed.get(scope === "project" ? "user" : "project");
        if (expected === undefined || other === undefined)
          throw new Error("Expected both populated scopes");
        const queried = await run(["knowledge", "concepts", "query", "--scope", scope]);
        expect(queried.exitCode, queried.stdout + queried.stderr).toBe(0);
        const page = Schema.decodeUnknownSync(KnowledgeConceptQueryPageSchema)(
          payload(queried.stdout),
        );
        expect(
          page.items.map((item) => ({ bundle: item.ref.bundle, concept: item.ref.conceptId })),
        ).toEqual([{ bundle: "@acme/knowledge/platform", concept: "session" }]);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(beforeReads);
        const retrieved = await run([
          "knowledge",
          "concepts",
          "get",
          "@acme/knowledge/platform#session",
          "--scope",
          scope,
          "--raw",
        ]);
        expect(retrieved.exitCode, retrieved.stdout + retrieved.stderr).toBe(0);
        expect(
          Schema.decodeUnknownSync(KnowledgeConceptGetOutputSchema)(payload(retrieved.stdout))
            .concept?.raw,
        ).toBe(expected.document);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(beforeReads);
        const excluded = await run([
          "knowledge",
          "concepts",
          "search",
          other.marker,
          "--scope",
          scope,
        ]);
        expect(excluded.exitCode, excluded.stdout + excluded.stderr).toBe(0);
        expect(
          Schema.decodeUnknownSync(KnowledgeConceptQueryPageSchema)(payload(excluded.stdout)).items,
        ).toEqual([]);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(beforeReads);
      }
      const project = installed.get("project");
      const user = installed.get("user");
      if (project === undefined || user === undefined)
        throw new Error("Expected both installed bundles");
      const revised = knowledgeDocument("# Session\n\nFreshscopewitness.\n");
      fs.writeFileSync(path.join(project.sourceRoot, "session.md"), revised);
      const afterSourceEdit = snapshotWorkspaceContent(fixture.root);
      for (const scope of scopes) {
        const searched = await run([
          "knowledge",
          "concepts",
          "search",
          "Freshscopewitness",
          "--scope",
          scope,
        ]);
        expect(searched.exitCode, searched.stdout + searched.stderr).toBe(0);
        expect(
          Schema.decodeUnknownSync(KnowledgeConceptQueryPageSchema)(
            payload(searched.stdout),
          ).items.map((item) => item.ref.conceptId),
        ).toEqual(scope === "project" ? ["session"] : []);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(afterSourceEdit);
        const retrieved = await run([
          "knowledge",
          "concepts",
          "get",
          "@acme/knowledge/platform#session",
          "--scope",
          scope,
          "--raw",
        ]);
        expect(retrieved.exitCode, retrieved.stdout + retrieved.stderr).toBe(0);
        expect(
          Schema.decodeUnknownSync(KnowledgeConceptGetOutputSchema)(payload(retrieved.stdout))
            .concept?.raw,
        ).toBe(scope === "project" ? revised : user.document);
        expect(snapshotWorkspaceContent(fixture.root)).toEqual(afterSourceEdit);
      }
    } finally {
      fixture.cleanup();
    }
  }, 90000);
});
