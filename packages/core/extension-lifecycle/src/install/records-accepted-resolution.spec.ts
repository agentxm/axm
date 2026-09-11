import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { LockfileSchema } from "@agentxm/workspace-state";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import {
  applyInstall,
  installRequest,
  localLifecycleRows,
  makeInstallWorld,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/records-accepted-resolution",
  title: "Install records the accepted resolution in the lockfile",
  statement:
    "When a person installs an acquirable extension, the install shall record the extension's accepted resolution, including its source and content identity, in the workspace lockfile.",
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
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("records the accepted resolution in the authoritative lockfile", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    expect(workspace.readFile("axm-lock.yaml")).not.toContain("code-review");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );

          const lockfile = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
          expect(lockfile.skills["code-review"]).toMatchObject({
            type: "local",
            extensionType: "skill",
            workspaceName: "code-review",
            packageName: "code-review",
            contentIdentity: expect.any(String),
            treeIntegrity: expect.anything(),
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each(localLifecycleRows)(
    "binds the accepted source and identities to the actual $label content",
    ({ type, label, writePackage, canonicalFile, settingsKey }) =>
      Effect.gen(function* () {
        const identities: Array<{ content: string; tree: string }> = [];
        for (const body of ["first content", "changed content", "first content"]) {
          const { workspace, cleanup } = makeInstallWorld();
          cleanups.push(cleanup);
          const name = `identity-${label}`;
          const source = writePackage(workspace.root, { name });
          fs.appendFileSync(nodePath.join(source, canonicalFile(name)), `\n# ${body}\n`);
          yield* workspace.provide(
            applyInstall(installRequest({ type, subject: { kind: "source", source } })),
          );
          const lockfile = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
          const entry = lockfile[settingsKey]?.[name];
          if (entry === undefined || entry.type !== "local") {
            throw new Error("Expected the accepted local resolution");
          }
          expect(fs.realpathSync(nodePath.resolve(workspace.root, entry.path))).toBe(
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
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each(localLifecycleRows)(
    "records the accepted source and content identity for a local $label",
    ({ type, label, writePackage, settingsKey }) => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const name = `conformance-${label}`;
      const source = writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(installRequest({ type, subject: { kind: "source", source } }));

            const lockfile = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
            expect(lockfile[settingsKey]?.[name]).toMatchObject({
              type: "local",
              extensionType: type,
              workspaceName: name,
              packageName: name,
              contentIdentity: expect.any(String),
              treeIntegrity: expect.anything(),
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "records the selected Registry identity and independently computed archive integrity",
    () => {
      const { workspace, registry, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      registry.writeSkill("registry-review", [
        { version: "1.2.3", body: "Expected Registry guidance.\n" },
      ]);
      const archive = fs.readFileSync(
        nodePath.join(registry.root, "extensions/@acme/skills/registry-review/1.2.3.zip"),
      );
      const expectedIntegrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: "@acme/skills/registry-review@1.2.3" },
              }),
            );

            const lockfile = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
            const entry = lockfile.skills["registry-review"];
            if (entry === undefined || entry.type !== "registry") {
              throw new Error("Expected an accepted Registry resolution");
            }
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
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "does not accept a Registry resolution for bytes that differ from the declared integrity",
    () =>
      Effect.gen(function* () {
        const control = makeInstallWorld();
        cleanups.push(control.cleanup);
        control.registry.writeSkill("registry-review", [
          { version: "1.2.3", body: "Expected Registry guidance.\n" },
        ]);
        const indexPath = nodePath.join(
          control.registry.root,
          "extensions/@acme/skills/registry-review/index.json",
        );
        const acceptedIndex = fs.readFileSync(indexPath);
        const request = installRequest({
          type: "skill",
          subject: { kind: "source", source: "@acme/skills/registry-review@1.2.3" },
        });
        yield* control.workspace.provide(applyInstall(request));
        const controlLock = yield* decodeLockfile(
          YAML.parse(control.workspace.readFile("axm-lock.yaml")),
        );
        expect(controlLock.skills["registry-review"]?.type).toBe("registry");

        // Replace only the downloaded bytes, leaving the originally declared
        // identity and integrity intact.
        control.registry.writeSkill("registry-review", [
          { version: "1.2.3", body: "Different downloaded guidance.\n" },
        ]);
        fs.writeFileSync(indexPath, acceptedIndex);
        const retry = makeInstallWorld({ registry: control.registry });
        cleanups.push(retry.cleanup);
        const workspace = retry.workspace;
        const lockBefore = workspace.readFile("axm-lock.yaml");

        const outcome = yield* workspace.provide(applyInstall(request)).pipe(Effect.result);

        if (Result.isFailure(outcome)) {
          expect(JSON.stringify(outcome.failure)).toMatch(/integrity/i);
        } else {
          expect(deriveOperationOutcome(outcome.success)).toBe("failed");
          expect(JSON.stringify(outcome.success)).toMatch(/integrity/i);
        }
        expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
        const refused = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
        expect(refused.skills["registry-review"]).toBeUndefined();
        // Registry integrity is defined by LockfileSchema as verified against
        // archive bytes before extraction. No global rollback, public error
        // category, or recovery policy is inferred by this case.
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
