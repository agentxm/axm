/**
 * Work evidence for MCP sync: the locked writer consumes the proposal that
 * validation rendered from an identical preimage, and removal planning reads
 * each container once in its co-reader step. The controls pin the outcomes
 * that must not depend on that reuse when the observed state changes.
 */
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import { workObservations } from "../../locations/testing.js";
import { makeRecordingNativeWriteAuthority } from "../testing.js";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import type { McpServerDeclaration } from "./expected-entry.js";
import {
  prepareMcpServerRemovals,
  removeMcpServerFromAgents,
  syncInlineMcpServerToAgents,
  type McpServerSyncOutcome,
} from "./sync.js";

const nativeDirectoryInputs = { skillsDirectoryOverrides: {} };

const foreign = { command: "foreign-server" };
const managed = {
  command: "node",
  "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/review", source: "inline" },
};

const inlineEntry: McpServerDeclaration = {
  kind: "inline",
  connection: { transport: "stdio", command: "node", env: {} },
  enabled: true,
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** A real workspace directory removed when the case ends. */
const withWorkspace = <A, E, R>(use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-prepared-"))),
    use,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );

interface ObserveOptions {
  /** Runs before each string read, with that path's one-based read ordinal and the parses so far. */
  readonly beforeRead?: (path: string, ordinal: number, parses: number) => void;
  /** Writes of this path fail as a permission refusal. */
  readonly failWritesOf?: string;
}

/**
 * Run with a recording filesystem over the Node platform and a recording
 * native write authority, after fixture setup has been forgotten.
 */
const observe = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | NativeWriteAuthority | FileSystemRecorder | NodeServices.NodeServices
  >,
  options: ObserveOptions = {},
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const fs = yield* FileSystem.FileSystem;
    const authority = yield* makeRecordingNativeWriteAuthority;
    const observations = workObservations(false);
    const parses = () =>
      observations.facts.filter((fact) => fact.kind === "axm.parse.native").length;
    const ordinals = new Map<string, number>();
    const hooked: FileSystem.FileSystem = {
      ...fs,
      readFileString: (path, encoding) =>
        Effect.suspend(() => {
          const ordinal = (ordinals.get(path) ?? 0) + 1;
          ordinals.set(path, ordinal);
          options.beforeRead?.(path, ordinal, parses());
          return fs.readFileString(path, encoding);
        }),
      writeFile: (path, data, writeOptions) =>
        path === options.failWritesOf
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "writeFile",
                pathOrDescriptor: path,
              }),
            )
          : fs.writeFile(path, data, writeOptions),
      writeFileString: (path, data, writeOptions) =>
        path === options.failWritesOf
          ? Effect.fail(
              PlatformError.systemError({
                _tag: "PermissionDenied",
                module: "FileSystem",
                method: "writeFileString",
                pathOrDescriptor: path,
              }),
            )
          : fs.writeFileString(path, data, writeOptions),
    };
    recording.reset();
    const result = yield* effect.pipe(
      Effect.provideService(FileSystem.FileSystem, hooked),
      Effect.provide(authority.layer),
      observations.provide,
      Effect.result,
    );
    return { result, recording, parses: parses(), authority: yield* authority.observed };
  }).pipe(
    // The recording filesystem replaces the platform's own.
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

const failureOf = <A, E>(result: Result.Result<A, E>) =>
  Result.isFailure(result) ? result.failure : undefined;

const addReview = (root: string, agentIds: ReadonlyArray<string> = ["claude-code"]) =>
  syncInlineMcpServerToAgents(agentIds, {
    nativeDirectoryInputs,
    workspaceRoot: root,
    serverName: "review",
    entry: inlineEntry,
  });

const removeReview = (
  root: string,
  agentIds: ReadonlyArray<string> = ["claude-code"],
  options: { readonly dryRun?: boolean; readonly scope?: "project" | "user" } = {},
) =>
  removeMcpServerFromAgents(agentIds, {
    nativeDirectoryInputs,
    workspaceRoot: root,
    serverName: "review",
    ...options,
  });

/** The change labels reported for each agent's targets. */
const labels = (outcomes: ReadonlyArray<McpServerSyncOutcome>) =>
  outcomes.map((outcome) => ({
    tag: outcome._tag,
    targets: (outcome.targets ?? []).map((target) => ({
      path: target.path,
      change: target.change,
      state: target.nativeLocation?.state,
    })),
  }));

describe("MCP sync writes from a validated proposal", () => {
  it.effect("the locked writer reuses the validated proposal for an unchanged preimage", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, json({ mcpServers: { foreign } }));
        const phases: Array<number> = [];
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, _ordinal, parses) => {
            if (path === file) phases.push(parses);
          },
        });
        expect(observed.result._tag).toBe("Success");
        // Content reads: competing-entry discovery, validation, the writer's
        // locked read, readback.
        expect(observed.recording.contentReads(file)).toBe(4);
        expect(observed.recording.writes(file)).toBe(1);
        // Parses recorded before each read and in total: discovery parses the
        // preimage once, validation the preimage and its proposal, the writer
        // nothing more, readback the published document.
        expect([...phases, observed.parses]).toEqual([0, 1, 3, 3, 4]);
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
        });
      }),
    ),
  );

  it.effect("a reused proposal for a declared server reports the server as updated", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(
          file,
          json({ mcpServers: { foreign, review: { ...managed, command: "old" } } }),
        );
        const phases: Array<number> = [];
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, _ordinal, parses) => {
            if (path === file) phases.push(parses);
          },
        });
        expect(labels(Result.getOrThrow(observed.result))).toEqual([
          { tag: "success", targets: [{ path: file, change: "updated", state: "updated" }] },
        ]);
        // The writer adds no parse between its locked read and readback.
        expect([...phases, observed.parses]).toEqual([0, 1, 3, 3, 4]);
        expect(observed.recording.writes(file)).toBe(1);
        expect(observed.authority.records.map(({ path, change }) => ({ path, change }))).toEqual([
          { path: file, change: "modified" },
        ]);
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
        });
      }),
    ),
  );

  it.effect("a reused proposal identical to the locked preimage writes nothing", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, json({ mcpServers: { foreign } }));
        const first = yield* observe(addReview(root));
        expect(first.result._tag).toBe("Success");
        const published = readFileSync(file, "utf8");
        const phases: Array<number> = [];
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, _ordinal, parses) => {
            if (path === file) phases.push(parses);
          },
        });
        expect(labels(Result.getOrThrow(observed.result))).toEqual([
          { tag: "success", targets: [{ path: file, change: "unchanged", state: "unchanged" }] },
        ]);
        // Validation parses the preimage once, as its proposal is the same text;
        // the writer adds no parse before readback.
        expect([...phases, observed.parses]).toEqual([0, 1, 2, 2, 3]);
        expect(observed.recording.writes(file)).toBe(0);
        expect(observed.authority.protectedPaths).toEqual([]);
        expect(observed.authority.records).toEqual([]);
        expect(readFileSync(file, "utf8")).toBe(published);
      }),
    ),
  );

  it.effect("a foreign edit before the locked read is rendered again and preserved", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, json({ mcpServers: { foreign } }));
        const phases: Array<number> = [];
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, ordinal, parses) => {
            if (path !== file) return;
            phases.push(parses);
            if (ordinal === 3) writeFileSync(file, json({ mcpServers: { foreign }, extra: true }));
          },
        });
        expect(labels(Result.getOrThrow(observed.result))).toEqual([
          {
            tag: "success",
            targets: [{ path: file, change: "updated", state: "created" }],
          },
        ]);
        // The writer parses the fresh preimage and its new proposal.
        expect([...phases, observed.parses]).toEqual([0, 1, 3, 5, 6]);
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
          extra: true,
        });
      }),
    ),
  );

  it.effect("identical bytes under a new file identity are written in the current file", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(file, preimage);
        let replacedInode: number | undefined;
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, ordinal) => {
            if (path !== file || ordinal !== 3) return;
            const replacement = nodePath.join(root, "replacement.json");
            writeFileSync(replacement, preimage);
            renameSync(replacement, file);
            replacedInode = statSync(file).ino;
          },
        });
        expect(observed.result._tag).toBe("Success");
        expect(statSync(file).ino).toBe(replacedInode);
        expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
        });
        expect(observed.authority.protectedPaths).toEqual([file]);
        expect(observed.authority.records.map(({ path, change }) => ({ path, change }))).toEqual([
          { path: file, change: "modified" },
        ]);
        // The locked preimage equals the validated one, so the proposal is reused.
        expect(observed.parses).toBe(4);
      }),
    ),
  );

  it.effect("identical bytes at a different physical path are rendered for that path", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const other = nodePath.join(root, "other.json");
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(file, preimage);
        writeFileSync(other, preimage);
        const phases: Array<number> = [];
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, ordinal, parses) => {
            if (path !== file) return;
            phases.push(parses);
            // While validation reads it, the planned file becomes a link to
            // another file with the same bytes.
            if (ordinal === 2) {
              unlinkSync(file);
              symlinkSync("other.json", file);
            }
          },
        });
        expect(observed.result._tag).toBe("Success");
        // The writer resolves the other file and parses it and its proposal;
        // readback of the planned file finds no reader routed to it.
        expect([...phases, observed.parses]).toEqual([0, 1, 5, 5]);
        expect(JSON.parse(readFileSync(other, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
        });
        expect(observed.authority.records.map(({ path }) => path)).toEqual([other]);
      }),
    ),
  );

  it.effect("a declared route retargeted before validation is refused before any write", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const first = nodePath.join(root, "first.json");
        const second = nodePath.join(root, "second.json");
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(first, preimage);
        writeFileSync(second, preimage);
        symlinkSync("first.json", file);
        const observed = yield* observe(addReview(root), {
          beforeRead: (path, ordinal) => {
            // Discovery reads through the route; validation then rechecks it.
            if (path === file && ordinal === 1) {
              unlinkSync(file);
              symlinkSync("second.json", file);
            }
          },
        });
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `MCP location changed before writing: ${file}`,
        });
        expect(readFileSync(first, "utf8")).toBe(preimage);
        expect(readFileSync(second, "utf8")).toBe(preimage);
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );

  it.effect("hard-linked containers are refused before any write", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const claude = nodePath.join(root, ".mcp.json");
        const cursor = nodePath.join(root, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor));
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(claude, preimage);
        linkSync(claude, cursor);
        const observed = yield* observe(addReview(root, ["claude-code", "cursor"]));
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `Cannot use MCP location ${claude}: hardlink`,
        });
        expect(readFileSync(claude, "utf8")).toBe(preimage);
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );

  it.effect("each planned write reuses only its own unchanged preimage", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const claude = nodePath.join(root, ".mcp.json");
        const cursor = nodePath.join(root, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor));
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(claude, preimage);
        writeFileSync(cursor, preimage);
        const phases: Array<{ readonly path: string; readonly parses: number }> = [];
        const observed = yield* observe(addReview(root, ["claude-code", "cursor"]), {
          beforeRead: (path, ordinal, parses) => {
            if (path !== claude && path !== cursor) return;
            phases.push({ path: nodePath.relative(root, path), parses });
            // While the first file is written, the second changes after its validation.
            if (path === claude && ordinal === 3)
              writeFileSync(cursor, json({ mcpServers: { foreign }, extra: true }));
          },
        });
        expect(labels(Result.getOrThrow(observed.result))).toEqual([
          { tag: "success", targets: [{ path: claude, change: "updated", state: "created" }] },
          { tag: "success", targets: [{ path: cursor, change: "updated", state: "created" }] },
        ]);
        expect([...phases, { path: "end", parses: observed.parses }]).toEqual([
          // Discovery of each file, then validation of each.
          { path: ".mcp.json", parses: 0 },
          { path: ".cursor/mcp.json", parses: 1 },
          { path: ".mcp.json", parses: 2 },
          { path: ".cursor/mcp.json", parses: 4 },
          // The first writer reuses its proposal before its readback.
          { path: ".mcp.json", parses: 4 },
          { path: ".mcp.json", parses: 4 },
          // The second writer renders its changed preimage again before readback.
          { path: ".cursor/mcp.json", parses: 5 },
          { path: ".cursor/mcp.json", parses: 7 },
          { path: "end", parses: 8 },
        ]);
        expect(JSON.parse(readFileSync(cursor, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
          extra: true,
        });
        expect(observed.authority.records.map(({ path }) => path)).toEqual([claude, cursor]);
      }),
    ),
  );

  it.effect("absent and empty preimages keep their labels from the locked read", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const cases = [
          { name: "absent", setup: () => undefined, race: false },
          { name: "empty", setup: () => writeFileSync(file, ""), race: false },
          { name: "created before the lock", setup: () => undefined, race: true },
        ];
        const observedCases: Array<unknown> = [];
        for (const fixture of cases) {
          rmSync(file, { force: true });
          fixture.setup();
          const observed = yield* observe(addReview(root), {
            beforeRead: (path, ordinal) => {
              if (fixture.race && path === file && ordinal === 3) writeFileSync(file, "");
            },
          });
          observedCases.push({
            name: fixture.name,
            outcomes: labels(Result.getOrThrow(observed.result)),
            records: observed.authority.records.map(({ change }) => change),
            parses: observed.parses,
            raw: readFileSync(file, "utf8"),
          });
        }
        const raw = json({ mcpServers: { review: { type: "stdio", command: "node" } } });
        const outcome = (change: string) => [
          { tag: "success", targets: [{ path: file, change, state: "created" }] },
        ];
        expect(observedCases).toEqual([
          { name: "absent", outcomes: outcome("created"), records: ["created"], parses: 3, raw },
          { name: "empty", outcomes: outcome("updated"), records: ["modified"], parses: 3, raw },
          {
            name: "created before the lock",
            outcomes: outcome("updated"),
            records: ["modified"],
            parses: 3,
            raw,
          },
        ]);
      }),
    ),
  );

  it.effect("a failed later write keeps the earlier publication and its refusal", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const claude = nodePath.join(root, ".mcp.json");
        const cursor = nodePath.join(root, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor));
        const preimage = json({ mcpServers: { foreign } });
        writeFileSync(claude, preimage);
        writeFileSync(cursor, preimage);
        const observed = yield* observe(addReview(root, ["claude-code", "cursor"]), {
          failWritesOf: cursor,
        });
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "WriteBackupRetained",
          cause: { _tag: "McpConfigIoFailed", detail: `Failed to write MCP config: ${cursor}` },
        });
        expect(JSON.parse(readFileSync(claude, "utf8"))).toMatchObject({
          mcpServers: { foreign, review: { command: "node" } },
        });
        expect(readFileSync(cursor, "utf8")).toBe(preimage);
        expect(observed.authority.records.map(({ path, change }) => ({ path, change }))).toEqual([
          { path: claude, change: "modified" },
        ]);
      }),
    ),
  );
});

describe("MCP removal planning reads each container once per co-reader step", () => {
  it.effect("removal planning reads each container once in its co-reader step", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const before = json({ mcpServers: { foreign, review: managed } });
        const observedCases: Array<unknown> = [];
        for (const dryRun of [false, true]) {
          writeFileSync(file, before);
          const observed = yield* observe(removeReview(root, ["claude-code"], { dryRun }));
          observedCases.push({
            dryRun,
            outcomes: labels(Result.getOrThrow(observed.result)),
            reads: observed.recording.contentReads(file),
            parses: observed.parses,
            raw: readFileSync(file, "utf8"),
          });
        }
        const outcome = [
          { tag: "success", targets: [{ path: file, change: "updated", state: "removed" }] },
        ];
        expect(observedCases).toEqual([
          {
            dryRun: false,
            outcomes: outcome,
            reads: 5,
            parses: 7,
            raw: json({ mcpServers: { foreign } }),
          },
          { dryRun: true, outcomes: outcome, reads: 5, parses: 7, raw: before },
        ]);
      }),
    ),
  );

  it.effect("a later container corrupted after the first preflight is refused before writing", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const claude = nodePath.join(root, ".mcp.json");
        const cursor = nodePath.join(root, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor));
        const before = json({ mcpServers: { foreign, review: managed } });
        writeFileSync(claude, before);
        writeFileSync(cursor, before);
        const observed = yield* observe(removeReview(root, ["claude-code", "cursor"]), {
          beforeRead: (path, ordinal) => {
            // Discovery and the first preflight have read it.
            if (path === cursor && ordinal === 3) writeFileSync(cursor, "{broken");
          },
        });
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `Invalid MCP config JSON/JSONC: ${cursor}`,
        });
        expect(readFileSync(claude, "utf8")).toBe(before);
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );

  it.effect("a container route escaping the workspace is refused before writing", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const outside = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-outside-"));
        try {
          const file = nodePath.join(root, ".mcp.json");
          const inside = nodePath.join(root, "inside.json");
          const escaped = nodePath.join(outside, "mcp.json");
          const before = json({ mcpServers: { foreign, review: managed } });
          writeFileSync(inside, before);
          writeFileSync(escaped, before);
          symlinkSync("inside.json", file);
          const observed = yield* observe(removeReview(root), {
            beforeRead: (path, ordinal) => {
              // The first preflight has read the referent.
              if (path === inside && ordinal === 2) {
                unlinkSync(file);
                symlinkSync(escaped, file);
              }
            },
          });
          expect(failureOf(observed.result)).toMatchObject({ _tag: "McpConfigInvalid" });
          expect(readFileSync(inside, "utf8")).toBe(before);
          expect(readFileSync(escaped, "utf8")).toBe(before);
          expect(observed.authority.records).toEqual([]);
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("a container with __proto__ members is withdrawn as before", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const before =
          '{\n  "__proto__": { "polluted": true },\n  "mcpServers": {\n    "__proto__": { "command": "proto" },\n    "review": ' +
          JSON.stringify(managed) +
          ',\n    "foreign": { "command": "foreign-server" }\n  }\n}\n';
        writeFileSync(file, before);
        const observed = yield* observe(removeReview(root));
        expect(labels(Result.getOrThrow(observed.result))).toEqual([
          { tag: "success", targets: [{ path: file, change: "updated", state: "removed" }] },
        ]);
        expect(readFileSync(file, "utf8")).toBe(
          '{\n  "__proto__": { "polluted": true },\n  "mcpServers": {\n    "__proto__": {\n      "command": "proto"\n    },\n    "foreign": { "command": "foreign-server" }\n  }\n}\n',
        );
      }),
    ),
  );

  it.effect("a YAML container keeps tagged values and __proto__ keys through withdrawal", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".hermes/config.yaml");
        mkdirSync(nodePath.dirname(file));
        const before = [
          "__proto__:",
          "  polluted: true",
          "started: !!timestamp 2001-12-14t21:59:43.10-05:00",
          "tags: !!set",
          "  ? alpha",
          "  ? beta",
          "blob: !!binary aGVsbG8gd29ybGQ=",
          "mcp_servers:",
          "  review:",
          "    command: node",
          "    enabled: true",
          "  foreign:",
          "    command: foreign-server",
          "",
        ].join("\n");
        const observedCases: Array<unknown> = [];
        for (const dryRun of [true, false]) {
          writeFileSync(file, before);
          const observed = yield* observe(
            removeReview(root, ["hermes"], { dryRun, scope: "user" }),
          );
          observedCases.push({
            dryRun,
            outcomes: labels(Result.getOrThrow(observed.result)),
            raw: readFileSync(file, "utf8"),
          });
        }
        const outcome = [
          {
            tag: "success",
            targets: [{ path: file, change: "updated", state: "removed" }],
          },
        ];
        expect(observedCases).toEqual([
          { dryRun: true, outcomes: outcome, raw: before },
          {
            dryRun: false,
            outcomes: outcome,
            // Today's YAML rendering normalizes the timestamp; the other values keep their text.
            raw: before
              .replace("  review:\n    command: node\n    enabled: true\n", "")
              .replace("2001-12-14t21:59:43.10-05:00", "2001-12-15T02:59:43.100Z"),
          },
        ]);
      }),
    ),
  );

  it.effect("a YAML render that would orphan an alias is refused before writing", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".hermes/config.yaml");
        mkdirSync(nodePath.dirname(file));
        const before = [
          "mcp_servers:",
          "  review: &shared",
          "    command: node",
          "    enabled: true",
          "  foreign:",
          "    command: foreign-server",
          "copy: *shared",
          "",
        ].join("\n");
        writeFileSync(file, before);
        const observed = yield* observe(removeReview(root, ["hermes"], { scope: "user" }));
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `Invalid MCP config YAML: ${file}`,
        });
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );
});

describe("MCP withdrawals of several entries share one target preparation", () => {
  const managedAs = (name: string) => ({
    ...managed,
    "x-axm": { ...managed["x-axm"], ext: `@workspace/mcps/${name}` },
  });
  const both = json({ mcpServers: { foreign, review: managed, lint: managedAs("lint") } });
  const removalArgs = (root: string) => ({
    nativeDirectoryInputs,
    workspaceRoot: root,
    disableOnly: true,
  });

  /** Withdraw both entries with one call each, as separate owners would. */
  const separately = (root: string, agentIds: ReadonlyArray<string>) =>
    Effect.forEach(["review", "lint"], (serverName) =>
      removeMcpServerFromAgents(agentIds, { ...removalArgs(root), serverName, dryRun: true }),
    );

  /** Withdraw both entries from one preparation, running `between` after the first. */
  const together = (
    root: string,
    agentIds: ReadonlyArray<string>,
    between: () => void = () => undefined,
  ) =>
    Effect.gen(function* () {
      const removals = yield* prepareMcpServerRemovals(agentIds, removalArgs(root));
      const first = yield* removals.remove("review", { dryRun: true });
      between();
      const second = yield* removals.remove("lint", { dryRun: true });
      return [first, second];
    });

  /** Route observations of one path: real paths, link reads and stats. */
  const routeCalls = (
    recording: { readonly counts: (path: string) => Readonly<Record<string, number | undefined>> },
    path: string,
  ) => {
    const counts = recording.counts(path);
    return {
      realPath: counts["realPath"] ?? 0,
      readLink: counts["readLink"] ?? 0,
      stat: counts["stat"] ?? 0,
    };
  };

  it.effect("one preparation serves both dry-run withdrawals with the same outcomes", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, both);
        const apart = yield* observe(separately(root, ["claude-code"]));
        writeFileSync(file, both);
        const shared = yield* observe(together(root, ["claude-code"]));
        expect(Result.getOrThrow(shared.result)).toEqual(Result.getOrThrow(apart.result));
        expect(Result.getOrThrow(shared.result).map(labels)).toEqual([
          [{ tag: "success", targets: [{ path: file, change: "updated", state: "removed" }] }],
          [{ tag: "success", targets: [{ path: file, change: "updated", state: "removed" }] }],
        ]);
        expect(readFileSync(file, "utf8")).toBe(both);
        expect({
          reads: apart.recording.contentReads(file),
          parses: apart.parses,
          route: routeCalls(apart.recording, file),
        }).toEqual({ reads: 10, parses: 14, route: { realPath: 44, readLink: 36, stat: 36 } });
        // The second withdrawal skips the target resolution, its competing-entry
        // read and the first co-reader check; its render, co-reader check, route
        // rechecks and dry-run readback stay.
        expect({
          reads: shared.recording.contentReads(file),
          parses: shared.parses,
          route: routeCalls(shared.recording, file),
        }).toEqual({ reads: 8, parses: 12, route: { realPath: 40, readLink: 35, stat: 35 } });
      }),
    ),
  );

  it.effect("one preparation keeps each container's first checks in order across groups", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const claude = nodePath.join(root, ".mcp.json");
        const cursor = nodePath.join(root, ".cursor/mcp.json");
        mkdirSync(nodePath.dirname(cursor));
        const reads = (into: Array<string>) => ({
          beforeRead: (path: string) => {
            if (path === claude || path === cursor) into.push(nodePath.relative(root, path));
          },
        });
        const agents = ["claude-code", "cursor"];
        writeFileSync(claude, both);
        writeFileSync(cursor, both);
        const first: Array<string> = [];
        yield* observe(
          removeMcpServerFromAgents(agents, {
            ...removalArgs(root),
            serverName: "review",
            dryRun: true,
          }),
          reads(first),
        );
        const apartReads: Array<string> = [];
        const apart = yield* observe(separately(root, agents), reads(apartReads));
        const sharedReads: Array<string> = [];
        const shared = yield* observe(together(root, agents), reads(sharedReads));
        expect(Result.getOrThrow(shared.result)).toEqual(Result.getOrThrow(apart.result));
        // The first withdrawal reads exactly as a lone call does; the second
        // reads only what follows the shared preparation.
        expect(sharedReads.slice(0, first.length)).toEqual(first);
        expect(sharedReads.slice(first.length)).toEqual(
          apartReads.slice(apartReads.length - (sharedReads.length - first.length)),
        );
        expect({ apart: apartReads.length, shared: sharedReads.length }).toEqual({
          apart: 20,
          shared: 16,
        });
      }),
    ),
  );

  it.effect("a container corrupted after the first dry run is refused for the second", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        writeFileSync(file, both);
        const observed = yield* observe(
          together(root, ["claude-code"], () => writeFileSync(file, "{broken")),
        );
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `Invalid MCP config JSON/JSONC: ${file}`,
        });
        expect(readFileSync(file, "utf8")).toBe("{broken");
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );

  it.effect("a route retargeted after the first dry run is refused for the second", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const file = nodePath.join(root, ".mcp.json");
        const other = nodePath.join(root, "other.json");
        writeFileSync(file, both);
        writeFileSync(other, both);
        const observed = yield* observe(
          together(root, ["claude-code"], () => {
            unlinkSync(file);
            symlinkSync("other.json", file);
          }),
        );
        expect(failureOf(observed.result)).toMatchObject({
          _tag: "McpConfigInvalid",
          detail: `MCP location changed before removal: ${file}`,
        });
        expect(readFileSync(other, "utf8")).toBe(both);
        expect(observed.authority.records).toEqual([]);
      }),
    ),
  );
});
