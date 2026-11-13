import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { NativePlatformTest } from "../../locations/testing.js";
import { emitLockfileToml } from "../desired/lockfile/toml.js";
import {
  LOCKFILE_VERSION,
  LockfileSchema,
  SkillLockEntrySchema,
} from "../desired/lockfile/schema.js";
import { makeScopedStateApi } from "./state.js";

export const specification = defineSpecification({
  requirement: "workspace/workspace-state/shared-document-observations-are-immutable",
  title: "Consumers cannot alter shared document observations",
  statement:
    "A consumer's attempted mutation of shared decoded settings, accepted resolutions, or raw document evidence shall not change the values observed by another consumer of those document cells.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "The production scoped cells read and decode real settings and lockfile bytes before independent consumers attempt mutations.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect("protects nested decoded values and raw evidence shared by narrow readers", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const settingsPath = path.join(root, "axm.json");
    const lockfilePath = path.join(root, "axm.lock");
    const settingsBytes = '{"agents":["claude-code"],"skills":{"review":"workspace"}}';
    yield* fs.writeFileString(settingsPath, settingsBytes);
    const entry = Schema.decodeUnknownSync(SkillLockEntrySchema)({
      source: { type: "git", url: "https://example.test/review" },
      identity: { name: "review" },
      resolved: { commit: "a".repeat(40), tree: "b".repeat(40) },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
    });
    yield* fs.writeFileString(
      lockfilePath,
      emitLockfileToml(
        yield* Schema.encodeEffect(LockfileSchema)({
          lockfileVersion: LOCKFILE_VERSION,
          skills: { review: entry },
        }),
      ),
    );
    const cells = yield* makeScopedStateApi("project", { fs, path, settingsPath, lockfilePath });
    const settings = Option.getOrThrow(yield* cells.settings);
    const lockfile = Option.getOrThrow(yield* cells.lockfile);
    const raw = Option.getOrThrow(yield* cells.settingsRaw);
    Reflect.set(settings.skills ?? {}, "review", { source: "./other" });
    Reflect.set(settings.agents ?? [], "0", "codex");
    Reflect.set(lockfile.skills, "injected", {});
    const source = lockfile.skills["review"]?.source;
    if (source === undefined || !("url" in source) || !(source.url instanceof URL))
      throw new Error("Expected decoded Git URL");
    source.url.pathname = "/consumer-change";
    Reflect.set(raw, "bytes", "changed");
    Reflect.set(raw, "path", "/different-document");
    expect(Option.getOrThrow(yield* cells.settings).agents).toEqual(["claude-code"]);
    expect(Option.getOrThrow(yield* cells.settings).skills).toEqual({
      review: { source: "workspace", enabled: true },
    });
    expect(Option.getOrThrow(yield* cells.lockfile).skills).toEqual({ review: entry });
    expect(source.url.href).toBe("https://example.test/review");
    expect(Option.getOrThrow(yield* cells.settingsRaw)).toEqual({
      path: settingsPath,
      bytes: settingsBytes,
    });
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
