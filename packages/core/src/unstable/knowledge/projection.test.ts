import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  KNOWLEDGE_MATERIALIZATION_STATE,
  reconcileKnowledgeProjection,
  type KnowledgeProjectionBundle,
} from "./projection.js";

const fixture = () => {
  const root = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-projection-"));
  const axmDir = nodePath.join(root, ".axm");
  const sourceDir = nodePath.join(axmDir, "extensions", "@acme", "knowledge", "platform", "src");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(nodePath.join(sourceDir, "index.md"), "# Platform\n");
  const bundle: KnowledgeProjectionBundle = {
    owner: "@acme",
    name: "platform",
    sourceDir,
    description: "Platform guidance",
    version: "1.0.0",
    conceptCount: 1,
  };
  return { root, axmDir, bundle };
};

const run = (
  root: string,
  axmDir: string,
  bundles: ReadonlyArray<KnowledgeProjectionBundle>,
  options?: {
    readonly directory?: string;
    readonly dryRun?: boolean;
    readonly symlinkSupported?: boolean;
  },
) =>
  reconcileKnowledgeProjection({
    scopeRoot: root,
    axmDir,
    config: {
      directory: options?.directory ?? ".agents/knowledge",
      dir: nodePath.join(root, options?.directory ?? ".agents/knowledge"),
    },
    bundles,
    instructionsPath: nodePath.join(root, "AGENTS.md"),
    ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options?.symlinkSupported === undefined
      ? {}
      : { symlinkSupported: options.symlinkSupported }),
  }).pipe(Effect.provide(NodeServices.layer));

describe("reconcileKnowledgeProjection", () => {
  it.effect("projects src with a relative symlink and writes the aggregate index and bridge", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const result = yield* run(root, axmDir, [bundle], { symlinkSupported: true });
        const destination = nodePath.join(root, ".agents", "knowledge", "@acme", "platform");

        expect(result.changed).toBe(true);
        expect(readlinkSync(destination)).toBe(
          nodePath.relative(nodePath.dirname(destination), bundle.sourceDir),
        );
        expect(
          readFileSync(nodePath.join(root, ".agents", "knowledge", "index.md"), "utf8"),
        ).toContain("[@acme/platform](@acme/platform/index.md)");
        expect(readFileSync(nodePath.join(root, "AGENTS.md"), "utf8")).toContain(
          "`.agents/knowledge/index.md`",
        );
        expect(existsSync(nodePath.join(destination, "knowledge.json"))).toBe(false);
        expect(existsSync(nodePath.join(axmDir, "knowledge", "index.md"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("falls back to a marker-free managed copy", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const result = yield* run(root, axmDir, [bundle], { symlinkSupported: false });
        const destination = nodePath.join(root, ".agents", "knowledge", "@acme", "platform");

        expect(
          result.artifacts.find((artifact) => artifact.path.endsWith("@acme/platform")),
        ).toMatchObject({ mechanism: "copy" });
        expect(readFileSync(nodePath.join(destination, "index.md"), "utf8")).toBe("# Platform\n");
        expect(readFileSync(nodePath.join(destination, "index.md"), "utf8")).not.toContain("AXM");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("is idempotent and dry-run writes nothing", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        yield* run(root, axmDir, [bundle], { symlinkSupported: true });
        const second = yield* run(root, axmDir, [bundle], { symlinkSupported: true });
        expect(second.artifacts).toEqual([
          {
            path: ".agents/knowledge/@acme/platform",
            change: "unchanged",
            mechanism: "symlink",
          },
        ]);
        expect(second.changed).toBe(false);

        const preview = yield* run(root, axmDir, [], {
          dryRun: true,
          symlinkSupported: true,
        });
        expect(preview.changed).toBe(true);
        expect(existsSync(nodePath.join(root, ".agents", "knowledge", "@acme", "platform"))).toBe(
          true,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect(
    "removes disabled projections and the managed bridge while preserving unrelated instructions",
    () =>
      Effect.gen(function* () {
        const { root, axmDir, bundle } = fixture();
        try {
          writeFileSync(nodePath.join(root, "AGENTS.md"), "# Local instructions\n");
          yield* run(root, axmDir, [bundle], { symlinkSupported: true });
          yield* run(root, axmDir, [], { symlinkSupported: true });

          expect(existsSync(nodePath.join(root, ".agents", "knowledge", "@acme", "platform"))).toBe(
            false,
          );
          expect(readFileSync(nodePath.join(root, "AGENTS.md"), "utf8")).toBe(
            "# Local instructions\n",
          );
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }),
  );

  it.effect("relocates managed artifacts and preserves unknown files in the old root", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        yield* run(root, axmDir, [bundle], { symlinkSupported: true });
        writeFileSync(nodePath.join(root, ".agents", "knowledge", "notes.md"), "keep\n");

        yield* run(root, axmDir, [bundle], {
          directory: "docs/knowledge",
          symlinkSupported: true,
        });

        expect(existsSync(nodePath.join(root, "docs", "knowledge", "@acme", "platform"))).toBe(
          true,
        );
        expect(existsSync(nodePath.join(root, ".agents", "knowledge", "@acme", "platform"))).toBe(
          false,
        );
        expect(existsSync(nodePath.join(root, ".agents", "knowledge", "index.md"))).toBe(false);
        expect(readFileSync(nodePath.join(root, ".agents", "knowledge", "notes.md"), "utf8")).toBe(
          "keep\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("removes the legacy internal index on first reconciliation", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const legacyIndex = nodePath.join(axmDir, "knowledge", "index.md");
        mkdirSync(nodePath.dirname(legacyIndex), { recursive: true });
        writeFileSync(legacyIndex, "# Legacy derived index\n");

        yield* run(root, axmDir, [bundle], { symlinkSupported: true });

        expect(existsSync(legacyIndex)).toBe(false);
        expect(existsSync(nodePath.join(root, ".agents", "knowledge", "index.md"))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("keeps the old projection when relocation preflight conflicts", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        yield* run(root, axmDir, [bundle], { symlinkSupported: true });
        const oldProjection = nodePath.join(root, ".agents", "knowledge", "@acme", "platform");
        const newProjection = nodePath.join(root, "docs", "knowledge", "@acme", "platform");
        mkdirSync(newProjection, { recursive: true });
        writeFileSync(nodePath.join(newProjection, "index.md"), "# User content\n");

        const error = yield* run(root, axmDir, [bundle], {
          directory: "docs/knowledge",
          symlinkSupported: true,
        }).pipe(Effect.flip);

        expect(error.code).toBe("conflict");
        expect(existsSync(oldProjection)).toBe(true);
        expect(readFileSync(nodePath.join(newProjection, "index.md"), "utf8")).toBe(
          "# User content\n",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects an unmanaged destination without changing it", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const destination = nodePath.join(root, ".agents", "knowledge", "@acme", "platform");
        mkdirSync(destination, { recursive: true });
        writeFileSync(nodePath.join(destination, "index.md"), "# User content\n");

        const error = yield* run(root, axmDir, [bundle], { symlinkSupported: true }).pipe(
          Effect.flip,
        );

        expect(error.code).toBe("conflict");
        expect(readFileSync(nodePath.join(destination, "index.md"), "utf8")).toBe(
          "# User content\n",
        );
        expect(existsSync(nodePath.join(axmDir, ".local", KNOWLEDGE_MATERIALIZATION_STATE))).toBe(
          false,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects duplicate owner/name destinations before writing", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const error = yield* run(root, axmDir, [bundle, { ...bundle }], {
          symlinkSupported: true,
        }).pipe(Effect.flip);
        expect(error.code).toBe("conflict");
        expect(existsSync(nodePath.join(root, ".agents", "knowledge"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("preserves an unavailable bundle while reconciling healthy bundles", () =>
    Effect.gen(function* () {
      const { root, axmDir, bundle } = fixture();
      try {
        const unavailableSource = nodePath.join(
          axmDir,
          "extensions",
          "@acme",
          "knowledge",
          "unavailable",
          "src",
        );
        mkdirSync(unavailableSource, { recursive: true });
        writeFileSync(nodePath.join(unavailableSource, "index.md"), "# Unavailable\n");
        const unavailable = {
          ...bundle,
          name: "unavailable",
          sourceDir: unavailableSource,
        } satisfies KnowledgeProjectionBundle;

        yield* run(root, axmDir, [unavailable], { symlinkSupported: true });

        const result = yield* reconcileKnowledgeProjection({
          scopeRoot: root,
          axmDir,
          config: {
            directory: ".agents/knowledge",
            dir: nodePath.join(root, ".agents", "knowledge"),
          },
          bundles: [bundle],
          instructionsPath: nodePath.join(root, "AGENTS.md"),
          symlinkSupported: true,
          preserveBundleNames: new Set(["unavailable"]),
        }).pipe(Effect.provide(NodeServices.layer));

        expect(result.changed).toBe(true);
        expect(existsSync(nodePath.join(root, ".agents", "knowledge", "@acme", "platform"))).toBe(
          true,
        );
        expect(
          existsSync(nodePath.join(root, ".agents", "knowledge", "@acme", "unavailable")),
        ).toBe(true);
        const index = readFileSync(nodePath.join(root, ".agents", "knowledge", "index.md"), "utf8");
        expect(index).toContain("[@acme/platform]");
        expect(index).toContain("[@acme/unavailable]");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
});
