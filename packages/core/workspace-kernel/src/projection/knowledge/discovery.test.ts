import { NativePlatformTest } from "../../locations/testing.js";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { NativeWriteAuthorityLive } from "../live.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import type { ProjectionUnitPath, RecordedProjectionRow } from "../../workspace-state/index.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { reconcileKnowledgeDiscovery, type KnowledgeDiscoveryBundle } from "./discovery.js";

const makeBundle = (
  root: string,
  owner: string,
  name: string,
  description?: string,
): KnowledgeDiscoveryBundle => {
  const sourceDir = nodePath.join(root, "agent_extensions", owner, "knowledge", name, "src");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(nodePath.join(sourceDir, "index.md"), `# ${name}\n`);
  return { owner, name, sourceDir, ...(description === undefined ? {} : { description }) };
};

/** Rows each workspace has recorded, as the lockfile would carry them between runs. */
const rowsByRoot = new Map<string, Map<ProjectionUnitPath, RecordedProjectionRow>>();
const rowsOf = (root: string) => {
  const rows = rowsByRoot.get(root) ?? new Map<ProjectionUnitPath, RecordedProjectionRow>();
  rowsByRoot.set(root, rows);
  return rows;
};

const run = (
  root: string,
  bundles: ReadonlyArray<KnowledgeDiscoveryBundle>,
  options?: {
    readonly instructions?: false;
    readonly management?: boolean;
    readonly dryRun?: boolean;
    readonly priorBundles?: ReadonlyArray<KnowledgeDiscoveryBundle>;
  },
) =>
  reconcileKnowledgeDiscovery({
    scopeRoot: root,
    ownerRoot: root,
    scope: "project",
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    configuredAgentIds: [],
    eligible: true,
    ownership: [...bundles, ...(options?.priorBundles ?? [])].map(({ owner, name, sourceDir }) => ({
      name,
      ref: `${owner}/knowledge/${name}`,
      root: nodePath.relative(root, nodePath.dirname(sourceDir)),
      scope: "project",
    })),
    config: { instructions: options?.instructions !== false },
    bundles,
    instructionsPath: nodePath.join(root, "AGENTS.md"),
    instructionsDeclaredPath: nodePath.join(root, "AGENTS.md"),
    recorded: rowsOf(root),
    instructionManagementEnabled: options?.management ?? true,
    ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
  }).pipe(
    Effect.tap(({ rowChanges }) =>
      Effect.sync(() => {
        if (options?.dryRun === true) return;
        for (const { path, row } of rowChanges) {
          if (row === undefined) rowsOf(root).delete(path);
          else rowsOf(root).set(path, { row, stale: false });
        }
      }),
    ),
    Effect.provide(
      NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
        Layer.provideMerge(NativePlatformTest),
      ),
    ),
  );

describe("reconcileKnowledgeDiscovery", () => {
  it.effect("renders one deterministic, escaped Knowledge Bundles table with canonical links", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        const zeta = makeBundle(root, "@zeta", "platform", undefined);
        const acmePlatform = makeBundle(root, "@acme", "platform", "Line one\nline | two \\ ok");
        const acmeRunbook = makeBundle(root, "@acme", "runbook", "Operations");

        const first = yield* run(root, [zeta, acmeRunbook, acmePlatform]);
        const second = yield* run(root, [acmePlatform, zeta, acmeRunbook]);
        const instructions = readFileSync(nodePath.join(root, "AGENTS.md"), "utf8");

        expect(first.changed).toBe(true);
        expect(second.changed).toBe(false);
        expect(instructions).toContain("<!-- axm:knowledge -->\n## Knowledge Bundles");
        expect(instructions).toContain("<!-- /axm:knowledge -->\n");
        expect(instructions).not.toContain("axm:point");
        const routing =
          "Use `axm knowledge concepts --help` to search, read, and explore these bundles.";
        expect(instructions.split(routing)).toHaveLength(2);
        expect(instructions).toContain(`## Knowledge Bundles\n\n${routing}\n\n### @acme`);
        expect(instructions).toContain(
          "### @acme\n\n" +
            "| Bundle | Description |\n| --- | --- |\n" +
            "| [platform](agent_extensions/@acme/knowledge/platform/src/index.md) | Line one line \\| two \\\\ ok |\n" +
            "| [runbook](agent_extensions/@acme/knowledge/runbook/src/index.md) | Operations |",
        );
        expect(instructions).toContain(
          "### @zeta\n\n" +
            "| Bundle | Description |\n| --- | --- |\n" +
            "| [platform](agent_extensions/@zeta/knowledge/platform/src/index.md) | — |",
        );
        expect(instructions.indexOf("### @acme")).toBeLessThan(instructions.indexOf("### @zeta"));
        expect(existsSync(nodePath.join(root, ".agents", "knowledge"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("removes its region without creating an otherwise empty instruction file", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        const bundle = makeBundle(root, "@acme", "platform");
        yield* run(root, [bundle]);
        yield* run(root, [], { priorBundles: [bundle] });
        expect(existsSync(nodePath.join(root, "AGENTS.md"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("honors the Knowledge toggle while preserving unrelated instruction content", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        writeFileSync(nodePath.join(root, "AGENTS.md"), "# Team instructions\n");
        const bundle = makeBundle(root, "@acme", "platform");
        yield* run(root, [bundle]);
        yield* run(root, [bundle], { instructions: false });
        expect(readFileSync(nodePath.join(root, "AGENTS.md"), "utf8")).toBe(
          "# Team instructions\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("does not mutate instructions when global instruction management is disabled", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-table-"));
      try {
        const instructions = nodePath.join(root, "AGENTS.md");
        writeFileSync(instructions, "# Hand maintained\n");
        const bundle = makeBundle(root, "@acme", "platform");
        yield* run(root, [bundle]);
        const managed = readFileSync(instructions, "utf8");

        const result = yield* run(root, [], { management: false });

        expect(result.changed).toBe(false);
        expect(readFileSync(instructions, "utf8")).toBe(managed);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});

describe("Knowledge link-base validation", () => {
  /**
   * A real project root holding AGENTS.md and one bundle, measured through one
   * recording filesystem. Only the link-base validation depends on which
   * readers are configured, so a run without configured readers isolates the
   * work each configured root-level reader adds.
   */
  const fixture = Effect.gen(function* () {
    const base = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* base.realPath(yield* base.makeTempDirectoryScoped());
    const sourceDir = path.join(root, "knowledge/guide/src");
    yield* base.makeDirectory(sourceDir, { recursive: true });
    yield* base.writeFileString(path.join(sourceDir, "index.md"), "# Guide\n");
    yield* base.writeFileString(path.join(root, "AGENTS.md"), "# Team\n");
    const { fileSystem, recording } = makeRecordingFileSystem(base);
    const ancestors: Array<string> = [];
    for (let current = path.dirname(root); ; current = path.dirname(current)) {
      ancestors.push(current);
      if (path.dirname(current) === current) break;
    }
    const args = (overrides: {
      readonly configuredAgentIds: ReadonlyArray<string>;
      readonly withBundle: boolean;
      readonly scopeRoot?: string;
    }) => {
      const scopeRoot = overrides.scopeRoot ?? root;
      return {
        scopeRoot,
        ownerRoot: scopeRoot,
        scope: "project" as const,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        configuredAgentIds: overrides.configuredAgentIds,
        ownership: [
          {
            name: "guide",
            ref: "@acme/knowledge/guide",
            root: "knowledge/guide",
            scope: "project" as const,
          },
        ],
        eligible: false,
        config: { instructions: true },
        bundles: overrides.withBundle
          ? [
              {
                owner: "@acme",
                name: "guide",
                sourceDir: path.join(scopeRoot, "knowledge/guide/src"),
              },
            ]
          : [],
        instructionsPath: path.join(scopeRoot, "AGENTS.md"),
        instructionsDeclaredPath: path.join(scopeRoot, "AGENTS.md"),
        recorded: new Map<ProjectionUnitPath, RecordedProjectionRow>(),
        instructionManagementEnabled: true,
        dryRun: true,
      };
    };
    const measure = (input: Parameters<typeof reconcileKnowledgeDiscovery>[0]) =>
      Effect.gen(function* () {
        recording.reset();
        const result = yield* reconcileKnowledgeDiscovery(input).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.result,
        );
        const rootRealPaths = recording.calls({ path: root, method: "realPath" }).length;
        const ancestorListings = ancestors.map(
          (ancestor) => recording.calls({ path: ancestor, method: "readDirectory" }).length,
        );
        const rootListings = recording.calls({ path: root, method: "readDirectory" }).length;
        return { result, rootRealPaths, ancestorListings, rootListings };
      });
    /** Root resolutions and listings that configured readers add to one validated run. */
    const readerShare = (configuredAgentIds: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const validated = yield* measure(args({ configuredAgentIds, withBundle: true }));
        const unconfigured = yield* measure(args({ configuredAgentIds: [], withBundle: true }));
        expect(validated.result._tag).toBe("Success");
        expect(unconfigured.result._tag).toBe("Success");
        return {
          rootRealPaths: validated.rootRealPaths - unconfigured.rootRealPaths,
          ancestorListings: validated.ancestorListings.map(
            (count, index) => count - (unconfigured.ancestorListings[index] ?? 0),
          ),
          rootListings: validated.rootListings - unconfigured.rootListings,
        };
      });
    return { base, path, root, ancestors, args, measure, readerShare };
  });

  it.effect("resolves the shared root parent once for several configured root-level readers", () =>
    Effect.gen(function* () {
      const { ancestors, readerShare } = yield* fixture;
      const none = { rootRealPaths: 0, ancestorListings: ancestors.map(() => 0), rootListings: 0 };
      expect({
        single: yield* readerShare(["claude-code"]),
        several: yield* readerShare(["claude-code", "codex", "gemini-cli"]),
      }).toEqual({ single: none, several: none });
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("does no validation work when no Knowledge table is desired", () =>
    Effect.gen(function* () {
      const { ancestors, args, measure } = yield* fixture;
      const configuredAgentIds = ["claude-code", "codex", "gemini-cli"];
      const empty = yield* measure(args({ configuredAgentIds, withBundle: false }));
      const emptyUnconfigured = yield* measure(args({ configuredAgentIds: [], withBundle: false }));
      expect(empty.result._tag).toBe("Success");
      expect(emptyUnconfigured.result._tag).toBe("Success");
      expect([empty.rootRealPaths, empty.ancestorListings, empty.rootListings]).toEqual([
        emptyUnconfigured.rootRealPaths,
        emptyUnconfigured.ancestorListings,
        emptyUnconfigured.rootListings,
      ]);
      const disabled = yield* measure({
        ...args({ configuredAgentIds, withBundle: true }),
        instructionManagementEnabled: false,
      });
      expect(disabled.result._tag).toBe("Success");
      expect(disabled).toMatchObject({
        rootRealPaths: 0,
        ancestorListings: ancestors.map(() => 0),
        rootListings: 0,
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("keys the instruction target beneath the scope root its validation resolved", () =>
    Effect.gen(function* () {
      const { ancestors, args, measure, path, root, base } = yield* fixture;
      const work = (run: {
        readonly rootRealPaths: number;
        readonly ancestorListings: ReadonlyArray<number>;
      }) => ({ rootRealPaths: run.rootRealPaths, parentListings: run.ancestorListings[0] });
      const validated = yield* measure(args({ configuredAgentIds: [], withBundle: true }));
      const unvalidated = yield* measure(args({ configuredAgentIds: [], withBundle: false }));
      // A target below the root: the validation resolves its parent, not the scope root.
      const nested = path.join(root, "docs/AGENTS.md");
      yield* base.makeDirectory(path.dirname(nested));
      const elsewhere = yield* measure({
        ...args({ configuredAgentIds: [], withBundle: true }),
        instructionsPath: nested,
        instructionsDeclaredPath: nested,
      });
      // The locked apply is its own call and resolves the root again itself.
      const applied = yield* measure({
        ...args({ configuredAgentIds: [], withBundle: true }),
        dryRun: false,
      });
      for (const run of [validated, unvalidated, elsewhere, applied])
        expect(run.result._tag).toBe("Success");
      expect(ancestors[0]).toBe(path.dirname(root));
      expect(
        [validated, applied].map((run) =>
          run.result._tag === "Success"
            ? run.result.success.rowChanges.map(({ path }) => path)
            : [],
        ),
      ).toEqual([["AGENTS.md"], ["AGENTS.md"]]);
      expect({
        validated: work(validated),
        unvalidated: work(unvalidated),
        elsewhere: work(elsewhere),
        applied: work(applied),
      }).toEqual({
        validated: { rootRealPaths: 5, parentListings: 11 },
        unvalidated: { rootRealPaths: 4, parentListings: 9 },
        elsewhere: { rootRealPaths: 5, parentListings: 12 },
        applied: { rootRealPaths: 6, parentListings: 13 },
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect(
    "accepts and refuses through a symlinked scope root exactly as through its target",
    () =>
      Effect.gen(function* () {
        const { base, path, root, args } = yield* fixture;
        const outer = yield* base.realPath(yield* base.makeTempDirectoryScoped());
        const alias = path.join(outer, "Workspace-Alias");
        yield* base.symlink(root, alias);
        const accepted = yield* reconcileKnowledgeDiscovery(
          args({
            configuredAgentIds: ["claude-code", "codex", "gemini-cli"],
            withBundle: true,
            scopeRoot: alias,
          }),
        );
        expect(accepted.changed).toBe(true);
        expect(accepted.rowChanges.map(({ path }) => path)).toEqual(["AGENTS.md"]);
        const refused = yield* reconcileKnowledgeDiscovery(
          args({
            configuredAgentIds: ["claude-code", "junie"],
            withBundle: true,
            scopeRoot: alias,
          }),
        ).pipe(Effect.flip);
        expect(refused).toMatchObject({
          _tag: "ProjectionTargetUnsupported",
          detail: `Knowledge relative links cannot be shared with junie at ${path.join(alias, ".junie/AGENTS.md")}: its native instruction parent differs from the source and link-resolution semantics are unverified.`,
        });
        expect(yield* base.readFileString(path.join(root, "AGENTS.md"))).toBe("# Team\n");
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
      ),
  );
});
