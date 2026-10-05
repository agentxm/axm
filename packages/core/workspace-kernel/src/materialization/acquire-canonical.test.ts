import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { LocalHookRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  AcquiredContent,
  retireCanonicalDirectory,
  sourceRefContentKey,
} from "../acquisition/index.js";
import { computeMaterializedTreeIntegrity, type LockEntry } from "../workspace-state/index.js";
import { NativeWriteAuthorityLive } from "../projection/live.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { exactVersion, extensionName, handle } from "../workspace-state/testing.js";
import { acquireCanonicalForRef } from "./acquire-canonical.js";

describe("canonical acquisition dispatch", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-acquire-canonical-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const refFor = (packageRoot: string): LocalHookRef => ({
    type: "hook",
    refType: "local",
    owner: handle("@acme"),
    name: extensionName("audit"),
    hook: { name: extensionName("audit") },
    source: { type: "local", path: packageRoot },
    location: pathToFileURL(packageRoot).href,
  });

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
    const authority = NativeWriteAuthorityLive.pipe(
      Layer.provideMerge(
        Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
      ),
    );
    const services = Layer.merge(authority, RegistryTransportTest(FetchHttpClient.layer)).pipe(
      Layer.provideMerge(NodeServices.layer),
    );
    return effect.pipe(Effect.provide(services));
  };

  it.effect("keeps an accepted local tree until acquisition is forced", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "old");
        const ref = refFor(source);
        const args = {
          ref,
          type: "hook",
          baseDir: root,
          canonicalPath,
          copyFailure: { code: "validation", detail: (target: string) => `copy failed: ${target}` },
        } as const;
        const initial = yield* acquireCanonicalForRef({
          ...args,
          accepted: Option.none(),
          force: false,
          external: { reuse: true },
        });
        const accepted = Option.some<LockEntry>({
          source: { type: "path", path: "source" },
          identity: { owner: handle("@acme"), name: extensionName("audit") },
          resolved: { tree: Schema.decodeUnknownSync(SourceHashSchema)("sha256-source") },
          treeIntegrity: initial.treeIntegrity,
        });
        fs.writeFileSync(path.join(source, "hook.sh"), "new");
        const reused = yield* acquireCanonicalForRef({
          ...args,
          accepted,
          force: false,
          external: { reuse: true },
        });
        expect(reused.reused).toBe(true);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe("old");
        const forced = yield* acquireCanonicalForRef({
          ...args,
          accepted,
          force: true,
          external: { reuse: true },
        });
        expect(forced.reused).toBe(false);
        expect(fs.readFileSync(path.join(canonicalPath, "hook.sh"), "utf8")).toBe("new");
        expect(forced.treeIntegrity).not.toBe(initial.treeIntegrity);
      }),
    ),
  );

  it.effect("maps external source and target paths without copying the package root", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        const targetPath = path.join(canonicalPath, "src");
        fs.mkdirSync(path.join(source, "src"), { recursive: true });
        fs.writeFileSync(path.join(source, "manifest.json"), "{}");
        fs.writeFileSync(path.join(source, "src", "hook.sh"), "contents");
        const acquired = yield* acquireCanonicalForRef({
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          nativeInsertionEligible: true,
          copyFailure: { code: "validation", detail: (target) => `copy failed: ${target}` },
          external: {
            sourcePath: (packageRoot) => path.join(packageRoot, "src"),
            targetPath,
          },
        });
        expect(acquired.packageRoot).toBe(targetPath);
        expect(fs.readFileSync(path.join(targetPath, "hook.sh"), "utf8")).toBe("contents");
        expect(fs.existsSync(path.join(targetPath, "manifest.json"))).toBe(false);
        yield* retireCanonicalDirectory(targetPath);
        expect(fs.existsSync(path.join(root, "canonical"))).toBe(false);
        expect(fs.readFileSync(path.join(source, "src", "hook.sh"), "utf8")).toBe("contents");
      }),
    ),
  );

  it.effect("records registry publication parents independently of an external source target", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "registry", "@acme", "subagents", "review");
        fs.mkdirSync(path.join(source, "src"), { recursive: true });
        fs.writeFileSync(path.join(source, "subagent.json"), "{}");
        fs.writeFileSync(path.join(source, "src", "review.md"), "Review the change.");
        const ref: RegistrySubagentRef = {
          type: "subagent",
          refType: "registry",
          subagent: { name: extensionName("review"), description: Option.none() },
          source: {
            type: "registry",
            name: "test",
            location: new URL("https://registry.example"),
            owner: Option.some(handle("@acme")),
          },
          owner: handle("@acme"),
          publisherBindingId: "binding-1",
          name: extensionName("review"),
          version: exactVersion("1.0.0"),
          integrity: Option.none(),
          packages: [],
        };
        const key = sourceRefContentKey(ref);
        const acquired = yield* acquireCanonicalForRef({
          ref,
          type: "subagent",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          nativeInsertionEligible: true,
          copyFailure: { code: "internal", detail: (target) => `copy failed: ${target}` },
          // A manager can supply both acquisition recipes; Registry always
          // publishes the whole package, unlike this external-source recipe.
          external: {
            sourcePath: (packageRoot) => path.join(packageRoot, "src"),
            targetPath: path.join(canonicalPath, "src"),
          },
        }).pipe(
          Effect.provideService(AcquiredContent, {
            requestedKeys: new Set([key]),
            filesByKey: new Map([[key, { directory: source }]]),
            failuresByKey: new Map(),
          }),
        );
        expect(acquired.packageRoot).toBe(canonicalPath);
        expect(fs.readFileSync(path.join(canonicalPath, "subagent.json"), "utf8")).toBe("{}");
        expect(fs.readFileSync(path.join(canonicalPath, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
        yield* retireCanonicalDirectory(canonicalPath);
        expect(fs.existsSync(path.join(root, "registry"))).toBe(false);
        expect(fs.readFileSync(path.join(source, "src", "review.md"), "utf8")).toBe(
          "Review the change.",
        );
      }),
    ),
  );

  it.effect("stages acquired bytes away from the canonical destination", () =>
    run(
      Effect.gen(function* () {
        const source = path.join(root, "source");
        const canonicalPath = path.join(root, "canonical", "audit");
        const stagedPath = path.join(root, "staging", "audit");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "hook.sh"), "staged");
        const acquired = yield* acquireCanonicalForRef({
          ref: refFor(source),
          type: "hook",
          baseDir: root,
          canonicalPath,
          accepted: Option.none(),
          force: false,
          copyFailure: { code: "validation", detail: (target) => `copy failed: ${target}` },
          stage: { baseDir: root, destinationPath: stagedPath },
        });
        expect(acquired.packageRoot).toBe(stagedPath);
        expect(fs.existsSync(canonicalPath)).toBe(false);
        expect(fs.readFileSync(path.join(stagedPath, "hook.sh"), "utf8")).toBe("staged");
        expect(acquired.treeIntegrity).toBe(yield* computeMaterializedTreeIntegrity(stagedPath));
      }),
    ),
  );
});
