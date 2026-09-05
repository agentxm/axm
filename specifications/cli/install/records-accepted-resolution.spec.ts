import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { localLifecycleRows } from "../../support/local-lifecycle-fixtures.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import {
  LockfileSchema,
  PlanResolutionDocumentSchema,
  getAppError,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/install/records-accepted-resolution",
  title: "Install records the accepted resolution in the lockfile",
  statement:
    "When a person installs an acquirable extension, the install command shall record the extension's accepted resolution, including its source and content identity, in the workspace lockfile.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  supersedes: [
    "cli/install/direct-intent-recorded-and-realized",
    "cli/every-type-completes-the-shared-lifecycle",
  ],
  assumptions: [],
  openQuestions: [],
});

const decodeLockfile = Schema.decodeUnknownEffect(LockfileSchema);

describe("Install records the accepted resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("records the accepted resolution in the authoritative lockfile", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      expect(workspace.readLockfileText()).not.toContain("code-review");

      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const parsed: unknown = YAML.parse(workspace.readLockfileText());
      const lockfile = yield* decodeLockfile(parsed);
      expect(lockfile.skills["code-review"]).toMatchObject({
        type: "local",
        extensionType: "skill",
        workspaceName: "code-review",
        packageName: "code-review",
        contentIdentity: expect.any(String),
        treeIntegrity: expect.anything(),
      });
    }),
  );
  it.effect.each(localLifecycleRows)(
    "binds the accepted source and identities to the actual $label content",
    (row) =>
      Effect.gen(function* () {
        const identities: Array<{ content: string; tree: string }> = [];
        for (const content of ["first content", "changed content", "first content"]) {
          const workspace = makeSpecWorkspace();
          cleanups.push(workspace.cleanup);
          const name = `identity-${row.label}`;
          const source = row.writePackage(workspace.root, { name });
          fs.appendFileSync(path.join(source, row.canonicalFile(name)), `\n# ${content}\n`);
          yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
            Effect.provide(workspace.layer),
          );
          const parsed: unknown = YAML.parse(workspace.readLockfileText());
          const lockfile = yield* decodeLockfile(parsed);
          const entry = lockfile[row.settingsKey]?.[name];
          if (entry === undefined || entry.type !== "local") {
            throw new Error("Expected the accepted local resolution");
          }
          expect(fs.realpathSync(path.resolve(workspace.root, entry.path))).toBe(
            fs.realpathSync(source),
          );
          expect(entry.packageOwner).toBe("@acme");
          identities.push({ content: entry.contentIdentity, tree: entry.treeIntegrity });
        }
        const [first, changed, repeated] = identities;
        if (first === undefined || changed === undefined || repeated === undefined) {
          throw new Error("Expected all three independent installations");
        }
        expect(changed.content).not.toBe(first.content);
        expect(changed.tree).not.toBe(first.tree);
        expect(repeated).toEqual(first);
      }),
  );
  it.effect.each(localLifecycleRows)(
    "records the accepted source and content identity for a local $label",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace();
        cleanups.push(workspace.cleanup);
        const name = `conformance-${row.label}`;
        const source = row.writePackage(workspace.root, { name });
        yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        const parsed: unknown = YAML.parse(workspace.readLockfileText());
        const lockfile = yield* decodeLockfile(parsed);
        expect(lockfile[row.settingsKey]?.[name]).toMatchObject({
          type: "local",
          extensionType: row.type,
          workspaceName: name,
          packageName: name,
          contentIdentity: expect.any(String),
          treeIntegrity: expect.anything(),
        });
      }),
  );
  it.effect(
    "records the selected Registry identity and independently computed archive integrity",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("registry-review", [
          { version: "1.2.3", body: "Expected Registry guidance.\n" },
        ]);
        const archive = fs.readFileSync(
          path.join(registry.root, "extensions/@acme/skills/registry-review/1.2.3.zip"),
        );
        const expectedIntegrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
        const workspace = makeSpecWorkspace({
          userSettings: {},
          settings: { sources: [registry.source] },
        });
        cleanups.push(workspace.cleanup);
        yield* handleInstall({
          source: Option.some("@acme/skills/registry-review@1.2.3"),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        const parsed: unknown = YAML.parse(workspace.readLockfileText());
        const lockfile = yield* decodeLockfile(parsed);
        const entry = lockfile.skills["registry-review"];
        if (entry === undefined || entry.type !== "registry")
          throw new Error("Expected an accepted Registry resolution");
        expect(entry).toMatchObject({
          sourceName: registry.source.name,
          extensionType: "skill",
          workspaceName: "registry-review",
          owner: "@acme",
          name: "registry-review",
          resolvedVersion: "1.2.3",
          integrity: expectedIntegrity,
          publisherBindingId: "hbnd_test",
        });
        expect(entry.endpoint.href).toBe(new URL(registry.source.location).href);
      }),
  );

  it.effect(
    "does not accept a Registry resolution for bytes that differ from the declared integrity",
    () =>
      Effect.gen(function* () {
        const registry = makeSpecRegistry();
        cleanups.push(registry.cleanup);
        registry.writeSkill("registry-review", [
          { version: "1.2.3", body: "Expected Registry guidance.\n" },
        ]);
        const indexPath = path.join(
          registry.root,
          "extensions/@acme/skills/registry-review/index.json",
        );
        const acceptedIndex = fs.readFileSync(indexPath);
        const makeWorkspace = () => {
          const workspace = makeSpecWorkspace({
            userSettings: {},
            settings: { sources: [registry.source] },
          });
          cleanups.push(workspace.cleanup);
          return workspace;
        };
        const control = makeWorkspace();
        yield* handleInstall({
          source: Option.some("@acme/skills/registry-review@1.2.3"),
          force: false,
          preview: false,
        }).pipe(Effect.provide(control.layer));
        const controlParsed: unknown = YAML.parse(control.readLockfileText());
        const controlLock = yield* decodeLockfile(controlParsed);
        expect(controlLock.skills["registry-review"]?.type).toBe("registry");
        // Replace only the downloaded bytes, leaving the originally declared identity and integrity intact.
        registry.writeSkill("registry-review", [
          { version: "1.2.3", body: "Different downloaded guidance.\n" },
        ]);
        fs.writeFileSync(indexPath, acceptedIndex);
        const workspace = makeWorkspace();
        const lockBefore = workspace.readLockfileText();
        const result = yield* handleInstall({
          source: Option.some("@acme/skills/registry-review@1.2.3"),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer), Effect.result);
        if (Result.isFailure(result)) {
          expect(getAppError(result.failure).detail).toMatch(/integrity/i);
        } else {
          const document = yield* Schema.decodeUnknownEffect(PlanResolutionDocumentSchema)(
            workspace.rendererState.results.at(-1)?.data,
          );
          expect(document.result.outcome).toBe("failed");
          expect(document.result.failure?.message).toMatch(/integrity/i);
        }
        expect(workspace.readLockfileText()).toBe(lockBefore);
        const refusedLockfile = yield* decodeLockfile(YAML.parse(workspace.readLockfileText()));
        expect(refusedLockfile.skills["registry-review"]).toBeUndefined();
        // Registry integrity is defined by LockfileSchema as verified against archive bytes before extraction.
        // No global rollback, public error category, or recovery policy is inferred by this case.
      }),
  );
});
