import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { HandoffSkills } from "./index.js";
import { makeLifecycleFixture } from "./testing.js";

const body = "---\nname: review\ncustom: untouched\n---\n# Review\n";
const notes = "Reference notes\n";

/** The manager's published hash: sorted relative paths, each followed by its bytes. */
const managerHash = (files: Readonly<Record<string, string>>) => {
  const hash = createHash("sha256");
  for (const name of Object.keys(files).sort((left, right) => left.localeCompare(right))) {
    hash.update(name);
    hash.update(files[name] ?? "");
  }
  return hash.digest("hex");
};

const writeSkill = (directory: string, files: Readonly<Record<string, string>>) => {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(directory, name), content);
};

interface Layout {
  /** Installed bytes of the canonical copy, when they differ from the source. */
  readonly installed?: Readonly<Record<string, string>>;
  /** Point the agent alias at a separate copy with the source's bytes. */
  readonly separateAlias?: boolean;
  /** Record the manager's content hash for the entry. */
  readonly computedHash?: boolean;
  /** Add a link escaping the canonical copy, which the materialized-tree walk refuses. */
  readonly escapingLink?: boolean;
  /** Point the agent alias at a copy that does not exist. */
  readonly danglingAlias?: boolean;
  /** Leave every native skills directory without a copy of the skill. */
  readonly uninstalled?: boolean;
}

/**
 * A project with an installed `.agents/skills/review` copy, the Claude Code
 * alias `.claude/skills/review`, and a Skills-manager record naming a local
 * source whose bytes match the installed copy.
 */
const prepareHandoff = (layout: Layout) =>
  Effect.gen(function* () {
    const workspace = yield* Effect.acquireRelease(
      Effect.sync(() =>
        makeLifecycleFixture({ sources: "live", settings: { agents: ["claude-code"] } }),
      ),
      (workspace) => Effect.sync(() => workspace.cleanup()),
    );
    const sourceFiles = { "SKILL.md": body, "notes.md": notes };
    const source = path.join(workspace.root, "upstream", "review");
    const canonical = path.join(workspace.root, ".agents", "skills", "review");
    const alias = path.join(workspace.root, ".claude", "skills", "review");
    const separate = path.join(workspace.root, "elsewhere", "review");
    writeSkill(source, sourceFiles);
    fs.mkdirSync(path.dirname(alias), { recursive: true });
    if (layout.uninstalled === true) fs.mkdirSync(path.dirname(canonical), { recursive: true });
    else {
      writeSkill(canonical, layout.installed ?? sourceFiles);
      if (layout.escapingLink === true)
        fs.symlinkSync(path.join("..", "..", "..", "upstream"), path.join(canonical, "escape"));
      const aliasTarget =
        layout.separateAlias === true
          ? separate
          : layout.danglingAlias === true
            ? path.join(workspace.root, "missing", "review")
            : canonical;
      if (layout.separateAlias === true) writeSkill(separate, sourceFiles);
      fs.symlinkSync(path.relative(path.dirname(alias), aliasTarget), alias);
    }
    const lockPath = path.join(workspace.root, "skills-lock.json");
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        version: 1,
        skills: {
          review: {
            source,
            sourceType: "local",
            ...(layout.computedHash === false ? {} : { computedHash: managerHash(sourceFiles) }),
          },
        },
      }),
    );
    const recorder = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    const work = workObservations(false);
    recorder.recording.reset();
    const outcome = yield* workspace
      .provide(HandoffSkills.prepare({ lockPath, skills: ["review"], all: false }))
      .pipe(
        Effect.provideService(FileSystem.FileSystem, recorder.fileSystem),
        work.provide,
        Effect.result,
      );
    const treeHashes = work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree");
    return {
      outcome,
      recording: recorder.recording,
      treeHashes,
      canonical: layout.uninstalled === true ? canonical : fs.realpathSync(canonical),
      separate: layout.separateAlias === true ? fs.realpathSync(separate) : undefined,
      entryPaths: { canonical, alias },
      /** The alias entry under its physical parent, as native resolution spells it. */
      physicalAlias: path.join(fs.realpathSync(path.dirname(alias)), "review"),
    };
  });

describe("Skills handoff preparation", () => {
  it.effect("verifies a referent shared by two aliases once", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({});
      expect(prepared.outcome._tag).toBe("Success");
      // One materialized-tree walk, one manager-hash walk, and the candidate fingerprint.
      expect(prepared.recording.contentReads(path.join(prepared.canonical, "SKILL.md"))).toBe(3);
      // The upstream copy and the shared referent.
      expect(prepared.treeHashes).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a locally edited copy at the first alias checked", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({
        installed: { "SKILL.md": `${body}Local edits\n`, "notes.md": notes },
      });
      expect(prepared.outcome._tag).toBe("Failure");
      if (prepared.outcome._tag !== "Failure") return;
      expect(prepared.outcome.failure).toMatchObject({
        _tag: "OperationRefused",
        category: "validation",
        detail: `Preserved review: installed content differs from its recorded hash or resolved source at ${prepared.entryPaths.canonical}. Keep local edits, or restore the intended source before handoff.`,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("verifies an alias retargeted to another copy on its own", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({ separateAlias: true });
      expect(prepared.outcome._tag).toBe("Success");
      expect(prepared.recording.contentReads(path.join(prepared.canonical, "SKILL.md"))).toBe(3);
      expect(prepared.recording.contentReads(path.join(prepared.separate ?? "", "SKILL.md"))).toBe(
        3,
      );
      expect(prepared.treeHashes).toHaveLength(3);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does not compute the manager hash when the record carries none", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({ computedHash: false });
      expect(prepared.outcome._tag).toBe("Success");
      // One materialized-tree walk and the candidate fingerprint.
      expect(prepared.recording.contentReads(path.join(prepared.canonical, "SKILL.md"))).toBe(2);
      expect(prepared.treeHashes).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails with the walk's refusal when the installed copy holds an escaping link", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({ escapingLink: true });
      expect(prepared.outcome._tag).toBe("Failure");
      if (prepared.outcome._tag !== "Failure") return;
      expect(prepared.outcome.failure).toMatchObject({
        _tag: "MaterializedTreeInvalid",
        root: prepared.canonical,
        reason: "unsafe symlink: escape",
      });
      expect(prepared.treeHashes.map((fact) => fact.outcome)).toEqual(["success", "failure"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves each skills directory shared by several agents once", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({});
      expect(prepared.outcome._tag).toBe("Success");
      // Native resolution reads the canonical entry's link and status once; the
      // candidate fingerprint and the installation plan account for the rest.
      expect(prepared.recording.counts(prepared.entryPaths.canonical)).toMatchObject({
        readLink: 4,
        stat: 5,
      });
      // The agent alias is a distinct directory and is still resolved on its own.
      expect(prepared.recording.counts(prepared.entryPaths.alias)).toMatchObject({
        readLink: 6,
        stat: 4,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("finds no native copy after resolving each distinct skills directory once", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareHandoff({ uninstalled: true });
      expect(prepared.outcome._tag).toBe("Failure");
      if (prepared.outcome._tag !== "Failure") return;
      expect(prepared.outcome.failure).toMatchObject({
        _tag: "OperationRefused",
        detail: "No installed native copy of review was found; the manager entry was preserved",
      });
      // An absent entry costs one resolution: its lexical and parent-resolved link probes and one status.
      expect(prepared.recording.counts(prepared.entryPaths.canonical)).toEqual({
        readLink: 2,
        stat: 1,
      });
      expect(prepared.treeHashes).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
