import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { decodeExtensionNameSync } from "../extensions/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { KnowledgeManager, KnowledgeManagerLive } from "./manager.js";
import type { LocalKnowledgeRef } from "./refs.js";

const writeKnowledgePackage = (root: string, name: string, includeType: boolean) => {
  mkdirSync(nodePath.join(root, "src"), { recursive: true });
  writeFileSync(
    nodePath.join(root, "knowledge.json"),
    JSON.stringify(
      {
        owner: "@acme",
        type: "knowledge",
        name,
        version: "1.0.0",
        format: { name: "okf", version: "0.1" },
        bundleRoot: "src",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    nodePath.join(root, "src", "index.md"),
    "---\nokf_version: 0.1\n---\n# Knowledge\n",
  );
  writeFileSync(
    nodePath.join(root, "src", "concept.md"),
    `${includeType ? "---\ntype: concept\n---\n" : ""}# A useful concept\n`,
  );
};

const localRef = (name: string, root: string): LocalKnowledgeRef => ({
  type: "knowledge",
  refType: "local",
  source: { type: "local", path: root },
  location: pathToFileURL(root).href,
  knowledge: { name: decodeExtensionNameSync(name) },
});

const managerLayer = (workspaceRoot: string) =>
  KnowledgeManagerLive.pipe(
    Layer.provide(
      Layer.succeed(
        WorkspaceMutations,
        makeBaseWorkspaceMock(nodePath.join(workspaceRoot, ".axm"), {
          getConfiguredKnowledgeEntries: () => Effect.succeed({}),
        }),
      ),
    ),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        find: () => Effect.succeed([]),
        fetch: () => Effect.fail(makeAppError({ code: "validation", detail: "not used" })),
        cloneUrl: () => Option.none(),
        origin: () => "test",
      }),
    ),
    Layer.provide(NodeServices.layer),
  );

describe("KnowledgeManager", () => {
  it.effect("materializes a valid OKF bundle in isolation and rebuilds the derived index", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "handbook", true);

        yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)));

        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              ".axm",
              "extensions",
              "external",
              "knowledge",
              "handbook",
              "src",
              "concept.md",
            ),
          ),
        ).toBe(true);
        expect(
          readFileSync(nodePath.join(workspaceRoot, ".axm", "knowledge", "index.md"), "utf8"),
        ).toContain("[handbook]");
        const instructions = readFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "utf8");
        expect(instructions).toContain("region=knowledge-discovery");
        expect(instructions).toContain("untrusted reference material");
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );

  it.effect("rejects an invalid concept and removes the partial isolated copy", () =>
    Effect.gen(function* () {
      const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-knowledge-manager-"));
      try {
        const sourceRoot = nodePath.join(workspaceRoot, "source");
        writeKnowledgePackage(sourceRoot, "invalid-handbook", false);

        const error = yield* Effect.gen(function* () {
          const manager = yield* KnowledgeManager;
          yield* manager.materializeInstall({ ref: localRef("invalid-handbook", sourceRoot) });
        }).pipe(Effect.provide(managerLayer(workspaceRoot)), Effect.flip);

        expect(error.detail).toContain("requires a non-empty frontmatter type");
        expect(
          existsSync(
            nodePath.join(
              workspaceRoot,
              ".axm",
              "extensions",
              "external",
              "knowledge",
              "invalid-handbook",
            ),
          ),
        ).toBe(false);
      } finally {
        rmSync(workspaceRoot, { recursive: true, force: true });
      }
    }),
  );
});
