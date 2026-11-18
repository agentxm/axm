/**
 * Canonical-extensions scanner work: a subject file the scan has just read is
 * not probed again, and a package directory the scan has just classified as a
 * directory is not stat'd again. Runs over a real temporary directory so read
 * and probe failures keep their platform meaning.
 */

import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout } from "../../workspace/layout.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeCanonicalExtensionsScanner } from "../scanners/canonical-extensions.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "canonical-extensions-work-")),
  );
});

afterEach(() => {
  nodeFs.rmSync(projectRoot, { recursive: true, force: true });
});

const write = (relative: string, contents: string) => {
  const target = nodePath.join(projectRoot, relative);
  nodeFs.mkdirSync(nodePath.dirname(target), { recursive: true });
  nodeFs.writeFileSync(target, contents);
};

const manifest = (type: string, name: string) =>
  JSON.stringify({ owner: "@owner", type, name, version: "1.0.0" });

const scanRecorded = Effect.gen(function* () {
  const path = yield* Path.Path;
  const base = yield* FileSystem.FileSystem;
  const { fileSystem, recording } = makeRecordingFileSystem(base);
  const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, projectRoot), {
    owner: decodeHandleSync("@owner"),
  }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
  const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
  recording.reset();
  const occurrences = yield* makeCanonicalExtensionsScanner({
    fs: fileSystem,
    path,
    workspaceRoot: projectRoot,
    layout,
    diagnostics: makeDiagnostics(ref),
  });
  return { occurrences, warnings: yield* Ref.get(ref), recording };
}).pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, Path.layer)));

describe("canonical-extensions scan work", () => {
  it.effect("observes read subject files and classified package directories once", () =>
    Effect.gen(function* () {
      const acquired = "agent_extensions/registry.agentxm.ai/@owner";
      write("agent_extensions/github/acme/tools/.agents/skills/portable/SKILL.md", "# Portable\n");
      write(`${acquired}/subagents/reviewer/subagent.json`, manifest("subagent", "reviewer"));
      write(`${acquired}/packs/bundle/pack.json`, manifest("pack", "bundle"));
      write(`${acquired}/mcps/tools/mcp.json`, manifest("mcp-server", "tools"));
      write(`${acquired}/skills/native/skill.json`, manifest("skill", "native"));
      write(`${acquired}/skills/native/src/SKILL.md`, "# Native\n");
      // A subagent manifest path the scan cannot read as a file.
      write(`${acquired}/subagents/broken/subagent.json/entry`, "not a manifest\n");
      write("subagents/helper/subagent.json", manifest("subagent", "helper"));
      write("packs/team/pack.json", manifest("pack", "team"));
      write("mcps/local/mcp.json", manifest("mcp-server", "local"));

      const { occurrences, warnings, recording } = yield* scanRecorded;
      const at = (relative: string) => nodePath.join(projectRoot, relative);

      expect(
        occurrences.map((occurrence) => ({
          type: occurrence.type,
          origin: occurrence.origin,
          name: occurrence.name,
          contentLocation: occurrence.contentLocation,
          subjectFile: Option.getOrNull(occurrence.subjectFile),
          subjectFileExists: occurrence.subjectFileExists,
        })),
      ).toEqual([
        {
          type: "skill",
          origin: "external-axm",
          name: "portable",
          contentLocation: at("agent_extensions/github/acme/tools/.agents/skills/portable"),
          subjectFile: at("agent_extensions/github/acme/tools/.agents/skills/portable/SKILL.md"),
          subjectFileExists: true,
        },
        {
          type: "mcp-server",
          origin: "canonical-axm",
          name: "tools",
          contentLocation: at(`${acquired}/mcps/tools`),
          subjectFile: null,
          subjectFileExists: false,
        },
        {
          type: "pack",
          origin: "canonical-axm",
          name: "bundle",
          contentLocation: at(`${acquired}/packs/bundle`),
          subjectFile: null,
          subjectFileExists: false,
        },
        {
          type: "skill",
          origin: "canonical-axm",
          name: "native",
          contentLocation: at(`${acquired}/skills/native/src`),
          subjectFile: at(`${acquired}/skills/native/src/SKILL.md`),
          subjectFileExists: true,
        },
        {
          type: "subagent",
          origin: "canonical-axm",
          name: "broken",
          contentLocation: at(`${acquired}/subagents/broken`),
          subjectFile: at(`${acquired}/subagents/broken/subagent.json`),
          subjectFileExists: true,
        },
        {
          type: "subagent",
          origin: "canonical-axm",
          name: "reviewer",
          contentLocation: at(`${acquired}/subagents/reviewer`),
          subjectFile: at(`${acquired}/subagents/reviewer/subagent.json`),
          subjectFileExists: true,
        },
        {
          type: "mcp-server",
          origin: "canonical-axm",
          name: "local",
          contentLocation: at("mcps/local"),
          subjectFile: null,
          subjectFileExists: false,
        },
        {
          type: "subagent",
          origin: "canonical-axm",
          name: "helper",
          contentLocation: at("subagents/helper"),
          subjectFile: at("subagents/helper/subagent.json"),
          subjectFileExists: true,
        },
        {
          type: "pack",
          origin: "canonical-axm",
          name: "team",
          contentLocation: at("packs/team"),
          subjectFile: null,
          subjectFileExists: false,
        },
      ]);
      expect(warnings).toEqual([
        {
          source: "scanner",
          message: `canonical-extensions: cannot read ${at(`${acquired}/subagents/broken/subagent.json`)}`,
          path: at(`${acquired}/subagents/broken/subagent.json`),
          code: "scanner-io",
        },
      ]);

      // A subject file the scan read is not probed again.
      expect(
        recording.counts(at("agent_extensions/github/acme/tools/.agents/skills/portable/SKILL.md")),
      ).toEqual({ readFile: 1 });
      expect(recording.counts(at(`${acquired}/subagents/reviewer/subagent.json`))).toEqual({
        readFile: 1,
      });
      // A package directory its parent classified is stat'd once.
      for (const directory of [
        `${acquired}/subagents/reviewer`,
        `${acquired}/packs/bundle`,
        `${acquired}/mcps/tools`,
        `${acquired}/subagents/broken`,
      ]) {
        expect(recording.counts(at(directory)), directory).toEqual({ stat: 1, readDirectory: 1 });
      }
      for (const directory of ["subagents/helper", "packs/team", "mcps/local"]) {
        expect(recording.counts(at(directory)), directory).toEqual({ stat: 1 });
      }

      // Unchanged: content beneath src, a subject file the scan did not read,
      // and a manifest path that could not be read are still observed directly.
      expect(recording.counts(at(`${acquired}/skills/native/src`))).toEqual({ stat: 1 });
      expect(recording.counts(at(`${acquired}/skills/native/src/SKILL.md`))).toEqual({
        access: 1,
      });
      expect(recording.counts(at("subagents/helper/subagent.json"))).toEqual({ access: 1 });
      expect(recording.counts(at(`${acquired}/subagents/broken/subagent.json`))).toEqual({
        readFile: 1,
        access: 1,
      });
    }),
  );

  it.effect("still stats an acquired root that holds a package itself", () =>
    Effect.gen(function* () {
      write("agent_extensions/pack.json", manifest("pack", "rooted"));

      const { occurrences, recording } = yield* scanRecorded;

      expect(occurrences.map((occurrence) => occurrence.type)).toEqual(["pack"]);
      expect(recording.counts(nodePath.join(projectRoot, "agent_extensions"))).toEqual({
        readDirectory: 1,
        stat: 1,
      });
    }),
  );
});
