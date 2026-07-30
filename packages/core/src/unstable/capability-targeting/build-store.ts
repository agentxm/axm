/** Content-addressed materialization for capability-targeted skill artifacts. */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";

import { computeSourceHash } from "../extensions/rendered-files.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import type { SourceHash } from "../extensions/rendered-files.js";
import type { CapabilityRenderTarget, CapabilityTargetingFinding } from "./render.js";
import { renderCapabilityTargetedMarkdown } from "./render.js";
import { markdownSemanticallyEquivalent } from "./semantic-equivalence.js";

export const CAPABILITY_TARGETING_DSL_VERSION = "1";
export const AGENT_CAPABILITY_CATALOG_VERSION = "2026-07-15.1";

export interface CapabilityRenderInput {
  readonly sourceHash: SourceHash;
  readonly agent: string;
  readonly catalogVersion: string;
  readonly dslVersion: string;
  readonly capabilityHash: SourceHash;
  readonly referencedCapabilities: ReadonlyArray<string>;
}

export interface CapabilityTargetedBuildResult {
  readonly artifactSourcePath: string;
  readonly didRender: boolean;
  readonly degraded: boolean;
  readonly findings: ReadonlyArray<CapabilityTargetingFinding>;
  readonly renderInput?: CapabilityRenderInput;
}

interface SourceFile {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

interface RenderedFile extends SourceFile {
  readonly renderedText?: string;
}

const listFiles = (
  root: string,
  current: string,
): Effect.Effect<ReadonlyArray<SourceFile>, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = [...(yield* fs.readDirectory(current))].sort();
    const files: Array<SourceFile> = [];
    for (const name of names) {
      const absolute = path.join(current, name);
      const stat = yield* fs.stat(absolute);
      if (stat.type === "Directory") {
        files.push(...(yield* listFiles(root, absolute)));
      } else {
        files.push({
          relativePath: path.relative(root, absolute),
          bytes: yield* fs.readFile(absolute),
        });
      }
    }
    return files;
  });

const hashFiles = (files: ReadonlyArray<RenderedFile>, rendered: boolean): SourceHash => {
  const parts: Array<string> = [];
  for (const file of [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  )) {
    const content =
      rendered && file.renderedText !== undefined
        ? file.renderedText
        : Array.from(file.bytes).join(",");
    parts.push(`${file.relativePath}\u0000${content}`);
  }
  return computeSourceHash(parts.join("\u0000"));
};

const tokenKeys = (content: string): ReadonlyArray<string> => {
  const keys = new Set<string>();
  for (const match of content.matchAll(/\{\{\s*([a-z]+:[a-z0-9][a-z0-9-]*)/g)) {
    const key = match[1];
    if (key !== undefined) keys.add(key);
  }
  return Array.from(keys).sort();
};

const capabilityInputHash = (
  target: CapabilityRenderTarget,
  referencedCapabilities: ReadonlyArray<string>,
  referencedTokens: ReadonlyArray<string>,
): SourceHash => {
  const capabilities = referencedCapabilities.map((key) => [key, target.capabilities[key] ?? null]);
  const tokens = referencedTokens.map((key) => [key, target.tokens[key] ?? null]);
  return computeSourceHash(JSON.stringify({ capabilities, tokens }));
};

/**
 * Render Markdown files for one target. Plain sources return the canonical
 * directory unchanged; opted-in sources return an immutable build directory.
 */
export const materializeCapabilityTargetedBuild = (args: {
  readonly baseDir: string;
  readonly canonicalSourcePath: string;
  readonly extensionName: string;
  readonly target: CapabilityRenderTarget;
}): Effect.Effect<CapabilityTargetedBuildResult, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const decoder = new TextDecoder();
    const files = yield* listFiles(args.canonicalSourcePath, args.canonicalSourcePath);
    const findings: Array<CapabilityTargetingFinding> = [];
    const referencedCapabilities = new Set<string>();
    const referencedTokens = new Set<string>();
    let didTarget = false;
    let degraded = false;

    const renderedFiles: Array<RenderedFile> = files.map((file) => {
      if (!file.relativePath.toLowerCase().endsWith(".md")) return file;
      const source = decoder.decode(file.bytes);
      for (const key of tokenKeys(source)) referencedTokens.add(key);
      const rendered = renderCapabilityTargetedMarkdown(source, args.target);
      if (rendered.didRender || rendered.degraded) didTarget = true;
      if (rendered.degraded) degraded = true;
      findings.push(...rendered.findings);
      for (const capability of rendered.referencedCapabilities) {
        referencedCapabilities.add(capability);
      }
      return {
        ...file,
        ...(rendered.didRender || rendered.degraded ? { renderedText: rendered.content } : {}),
      };
    });

    if (!didTarget) {
      return {
        artifactSourcePath: args.canonicalSourcePath,
        didRender: false,
        degraded: false,
        findings: [],
      };
    }

    const sourceHash = hashFiles(renderedFiles, false);
    const buildHash = hashFiles(renderedFiles, true);
    const capabilityKeys = Array.from(referencedCapabilities).sort();
    const capabilityHash = capabilityInputHash(
      args.target,
      capabilityKeys,
      Array.from(referencedTokens).sort(),
    );
    const buildPath = path.join(
      args.baseDir,
      ".axm",
      "build",
      "skills",
      args.extensionName,
      buildHash,
    );
    const exists = yield* fs.exists(buildPath);
    if (!exists) {
      // Build into a temp dir and atomically rename into the content-addressed
      // slot, so a mid-build failure never leaves a partial build that later
      // reads as complete (poisoned cache), and concurrent builders never
      // observe an incomplete buildPath. The temp is removed on any failure.
      //
      // Deliberately not `writeFileAtomic` (utils/atomic-write.ts): that helper
      // replaces a single file, while this publishes a whole rendered directory
      // and must treat losing the rename race to a concurrent builder of the
      // same content-addressed slot as a benign win.
      const tempPath = `${buildPath}.${process.pid}.tmp`;
      yield* Effect.gen(function* () {
        yield* fs.remove(tempPath, { recursive: true }).pipe(Effect.ignore);
        yield* copyExtensionDirectory(args.canonicalSourcePath, tempPath, {
          forAgentArtifact: true,
        });
        for (const file of renderedFiles) {
          if (file.renderedText === undefined) continue;
          const outputPath = path.join(tempPath, file.relativePath);
          yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
          yield* fs.writeFileString(outputPath, file.renderedText);
        }
        yield* fs.makeDirectory(path.dirname(buildPath), { recursive: true });
        yield* fs.rename(tempPath, buildPath).pipe(
          // A concurrent builder may have published the same (content-addressed)
          // build first; that is a benign win, not a failure.
          Effect.catch((error) =>
            fs
              .exists(buildPath)
              .pipe(Effect.flatMap((published) => (published ? Effect.void : Effect.fail(error)))),
          ),
        );
      }).pipe(Effect.ensuring(fs.remove(tempPath, { recursive: true }).pipe(Effect.ignore)));
    } else {
      for (const file of renderedFiles) {
        if (file.renderedText === undefined) continue;
        const outputPath = path.join(buildPath, file.relativePath);
        const outputExists = yield* fs.exists(outputPath);
        if (!outputExists) {
          yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
          yield* fs.writeFileString(outputPath, file.renderedText);
          continue;
        }
        const current = yield* fs.readFileString(outputPath);
        if (!markdownSemanticallyEquivalent(current, file.renderedText)) {
          findings.push({
            code: "rendered-artifact-drift",
            message: `${file.relativePath} differs semantically from its canonical capability render; edit the canonical source or restore with --fix`,
            structural: false,
          });
        }
      }
    }

    return {
      artifactSourcePath: buildPath,
      didRender: true,
      degraded,
      findings,
      renderInput: {
        sourceHash,
        agent: args.target.agentId,
        catalogVersion: AGENT_CAPABILITY_CATALOG_VERSION,
        dslVersion: CAPABILITY_TARGETING_DSL_VERSION,
        capabilityHash,
        referencedCapabilities: capabilityKeys,
      },
    };
  });
