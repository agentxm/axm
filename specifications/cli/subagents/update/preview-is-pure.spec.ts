import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSubagentsUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry, type SpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/update/preview-is-pure",
  title: "Subagent update preview describes the available update without changing any state",
  statement:
    "When subagents update runs in preview mode while the Registry serves a newer version of an accepted subagent, it shall report the update it would apply with a previewed outcome, shall report a changed publisher binding as a condition that only interactive approval satisfies, and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: [
    "cli/skills/update/preview-is-pure",
    "packages/cli/src/root/subagents/update/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SUBAGENT = "researcher";
const OWNER = "@acme";
const PUBLISHED_AT = "1960-01-01T00:00:00Z";
const FIRST = { version: "1.0.0", body: "Research carefully." };
const SECOND = { version: "2.0.0", body: "Research thoroughly." };

interface RegistrySubagentVersion {
  readonly version: string;
  readonly body: string;
}

/**
 * Publish the complete version list for one subagent into the file Registry
 * with the layout the production resolver reads: a per-extension index plus
 * one archive per version. Publication predates the deterministic test clock,
 * so every version is immediately eligible.
 */
const writeRegistrySubagent = (
  registry: SpecRegistry,
  name: string,
  versions: ReadonlyArray<RegistrySubagentVersion>,
  publisherBindingId: string,
): void => {
  const subagentDir = path.join(registry.root, "extensions", OWNER, "subagents", name);
  fs.mkdirSync(subagentDir, { recursive: true });
  const entries = versions.map(({ version, body }) => {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-subagent-"));
    const archivePath = path.join(subagentDir, `${version}.zip`);
    try {
      fs.mkdirSync(path.join(stagingDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "subagent.json"),
        `${JSON.stringify(
          { owner: OWNER, type: "subagent", name, version, description: `The ${name} subagent.` },
          null,
          2,
        )}\n`,
      );
      fs.writeFileSync(
        path.join(stagingDir, "src", `${name}.md`),
        `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n${body}\n`,
      );
      execFileSync("zip", ["-qr", archivePath, "subagent.json", "src"], { cwd: stagingDir });
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    const archive = fs.readFileSync(archivePath);
    return {
      version,
      published: PUBLISHED_AT,
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    };
  });
  fs.writeFileSync(
    path.join(subagentDir, "index.json"),
    `${JSON.stringify(
      {
        owner: OWNER,
        type: "subagent",
        name,
        publisherBindingId,
        deprecation: null,
        versions: entries,
      },
      null,
      2,
    )}\n`,
  );
};

describe("Subagent update preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A workspace holding the accepted first version of a Registry subagent,
   * after which the Registry publishes a second version under the given
   * publisher binding.
   */
  const workspaceWithNewerPublication = (republishedBinding: string) =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      writeRegistrySubagent(registry, SUBAGENT, [FIRST], "hbnd_test");
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some(`${OWNER}/subagents/${SUBAGENT}`),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(`.claude/agents/${SUBAGENT}.md`)).toContain(FIRST.body);
      writeRegistrySubagent(registry, SUBAGENT, [SECOND, FIRST], republishedBinding);
      return workspace;
    });

  const previewUpdate = (workspace: ReturnType<typeof makeSpecWorkspace>) =>
    handleSubagentsUpdate({
      source: Option.none(),
      subagents: [],
      force: false,
      preview: true,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed update to a newer version changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithNewerPublication("hbnd_test");
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* previewUpdate(workspace);

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      expect(workspace.readFile(`.claude/agents/${SUBAGENT}.md`)).toContain(FIRST.body);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: SUBAGENT, state: "ready" })],
        },
      });

      // The previewed work is real: applying the same request advances the
      // accepted resolution the preview left untouched.
      yield* handleSubagentsUpdate({
        source: Option.none(),
        subagents: [],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 2.0.0");
      expect(workspace.readFile(`.claude/agents/${SUBAGENT}.md`)).toContain(SECOND.body);
    }),
  );

  it.effect(
    "a previewed update across a changed publisher binding reports the interactive-only condition and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithNewerPublication("hbnd_other");
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* previewUpdate(workspace);

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.readLockfileText()).toContain("publisherBindingId: hbnd_test");
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            riskConditions: [
              expect.objectContaining({
                level: "confirmable",
                consent: "interactive-only",
                id: "publisher-ownership-change",
              }),
            ],
          },
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["subagents", "update"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["subagents", "update"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["subagents", "update"], "-y")).toBe("unrecognized");
    }),
  );
});
