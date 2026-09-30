import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import { reconcileNativeManagedRegion, type NativeRegionSource } from "./index.js";
import { NativeWriteAuthorityLive } from "./live.js";
import { NativeWriteAuthority, NativeWriteRefused } from "../agent-adapters/index.js";
import { makeRecordingNativeWriteAuthority } from "../agent-adapters/testing.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";

export const specification = defineSpecification({
  requirement: "workspace/projections/native-regions-preserve-scoped-authority",
  title: "Native Rule and Knowledge regions retain source and scoped authority",
  statement:
    "AXM shall resolve native Rule and Knowledge regions physically, require exact accepted source and scope ownership for mutation, preserve foreign content, and restore the precise insertion baseline only for an eligible new intent followed by its unchanged withdrawal. Ownership proof shall use scope-relative roots so it remains valid in another project checkout with the same accepted sources. Explicit adoption shall bind to unchanged observed bytes and scope, change only the ownership marker, and confer no insertion-baseline cleanup eligibility.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  boundary: "platform",
  boundaryRationale:
    "Physical aliases and exact instruction bytes require real temporary filesystem observations.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/install/preserves-unrelated-and-unowned-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

for (const kind of ["rules", "knowledge"] as const) {
  const owner: NativeRegionSource = {
    name: "guide",
    ref: `@acme/${kind}/guide`,
    root: `agent_extensions/registry/@acme/${kind}/guide`,
    scope: "project",
  };
  describe(`${kind} native region`, () => {
    it.effect(
      "reports absent ownership before creating a native region and owned proof after apply",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "AGENTS.md");
          const authority = yield* makeRecordingNativeWriteAuthority;
          const args = {
            workspaceRoot: root,
            ownerRoot: root,
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
            scope: "project" as const,
            targetPath: file,
            displayPath: "AGENTS.md",
            owner: `@agentxm/${kind}/instructions`,
            region: kind,
            generation: "a".repeat(64),
            rendered: "Managed body",
            contributors: [owner],
            ownership: [owner],
            configuredAgentIds: [],
            eligible: false,
          };
          const proposed = yield* reconcileNativeManagedRegion({ ...args, dryRun: true }).pipe(
            Effect.provide(authority.layer),
          );
          expect(proposed.nativeLocation).toMatchObject({ ownership: "absent", state: "created" });
          expect(proposed.nativeLocation.proof).toBeUndefined();
          expect(yield* fs.exists(file)).toBe(false);
          expect((yield* authority.observed).protectedPaths).toEqual([]);
          const applied = yield* reconcileNativeManagedRegion(args).pipe(
            Effect.provide(authority.layer),
          );
          expect(applied.nativeLocation).toMatchObject({
            ownership: "owned",
            state: "created",
            proof: "exact-scoped-managed-region-sources",
          });
          const bytes = yield* fs.readFileString(file);
          const current = yield* reconcileNativeManagedRegion({ ...args, dryRun: true }).pipe(
            Effect.provide(authority.layer),
          );
          expect(current.nativeLocation).toMatchObject({
            ownership: "owned",
            state: "unchanged",
            proof: "exact-scoped-managed-region-sources",
          });
          expect(yield* fs.readFileString(file)).toBe(bytes);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("keeps accepted region ownership portable between project checkouts", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const first = yield* fs.makeTempDirectoryScoped();
        const second = yield* fs.makeTempDirectoryScoped();
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          scope: "project" as const,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          rendered: "Managed body",
          contributors: [owner],
          ownership: [owner],
          configuredAgentIds: ["codex"],
          eligible: false,
        };
        const original = path.join(first, "AGENTS.md");
        const copy = path.join(second, "AGENTS.md");
        yield* reconcileNativeManagedRegion({
          ...args,
          workspaceRoot: first,
          ownerRoot: first,
          targetPath: original,
        }).pipe(Effect.provide(authority.layer));
        yield* fs.copyFile(original, copy);
        const result = yield* reconcileNativeManagedRegion({
          ...args,
          workspaceRoot: second,
          ownerRoot: second,
          targetPath: copy,
        }).pipe(Effect.provide(authority.layer));
        expect(result.changed).toBe(false);
        expect(result.nativeLocation.ownership).toBe("owned");
        expect(yield* fs.readFileString(copy)).toBe(yield* fs.readFileString(original));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect(
      "explicitly adopts an unchanged region without rewriting its body or foreign bytes",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "AGENTS.md");
          const body = "Original body\r\nMixed line\n";
          const before = `# Foreign\r\n<!-- axm:start v=1 region=${kind} ext=@agentxm/${kind}/instructions gen=${"a".repeat(64)} -->\r\n${body}<!-- axm:end v=1 region=${kind} -->\r\nForeign tail`;
          yield* fs.writeFileString(file, before);
          const authority = yield* makeRecordingNativeWriteAuthority;
          const args = {
            workspaceRoot: root,
            ownerRoot: root,
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
            scope: "project" as const,
            targetPath: file,
            displayPath: "AGENTS.md",
            owner: `@agentxm/${kind}/instructions`,
            region: kind,
            generation: "b".repeat(64),
            rendered: "Proposed canonical body",
            contributors: [owner],
            ownership: [owner],
            configuredAgentIds: [],
            eligible: false,
          };
          expect(
            (yield* reconcileNativeManagedRegion(args).pipe(
              Effect.provide(authority.layer),
              Effect.result,
            ))._tag,
          ).toBe("Failure");
          const preview = yield* reconcileNativeManagedRegion({
            ...args,
            adoption: { expectedRaw: before },
            dryRun: true,
          }).pipe(Effect.provide(authority.layer));
          expect(preview.changed).toBe(true);
          expect(yield* fs.readFileString(file)).toBe(before);
          yield* reconcileNativeManagedRegion({ ...args, adoption: { expectedRaw: before } }).pipe(
            Effect.provide(authority.layer),
          );
          const adopted = yield* fs.readFileString(file);
          expect(adopted).toContain(`\r\n${body}<!-- axm:end`);
          expect(adopted.startsWith("# Foreign\r\n")).toBe(true);
          expect(adopted.endsWith("\r\nForeign tail")).toBe(true);
          expect(adopted).not.toContain("Proposed canonical body");
          expect(adopted).toContain(`gen=${"a".repeat(64)}`);
          expect(
            (yield* reconcileNativeManagedRegion({
              ...args,
              adoption: { expectedRaw: before },
            }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
          ).toBe("Failure");
          expect(yield* fs.readFileString(file)).toBe(adopted);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("resolves an instruction alias through the captured user vendor root", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const home = path.join(root, "home");
        const vendor = path.join(root, "vendor");
        yield* fs.makeDirectory(home);
        yield* fs.makeDirectory(vendor);
        const target = path.join(vendor, "CLAUDE.md");
        yield* fs.writeFileString(target, "# Foreign\n");
        yield* fs.symlink(target, path.join(home, "AGENTS.md"));
        const proof: NativeRegionSource = { ...owner, scope: "user" };
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: home,
          ownerRoot: home,
          nativeDirectoryInputs: {
            skillsDirectoryOverrides: {},
            userConfigRootOverrides: { "claude-code": vendor },
          },
          targetPath: target,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          rendered: "Managed body",
          contributors: [proof],
          ownership: [proof],
          configuredAgentIds: ["claude-code"],
          eligible: false,
        };
        expect(
          (yield* reconcileNativeManagedRegion({ ...args, scope: "project" }).pipe(
            Effect.provide(authority.layer),
            Effect.result,
          ))._tag,
        ).toBe("Failure");
        expect(yield* fs.readFileString(target)).toBe("# Foreign\n");
        const result = yield* reconcileNativeManagedRegion({ ...args, scope: "user" }).pipe(
          Effect.provide(authority.layer),
        );
        expect(result.nativeLocation.configuredConsumers).toEqual(["claude-code"]);
        expect(yield* fs.readLink(path.join(home, "AGENTS.md"))).toBe(target);
        expect(yield* fs.readFileString(target)).toContain("Managed body");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    for (const baseline of [undefined, "", "# Foreign instructions\r\n\r\n"]) {
      it.effect(
        `restores its ${baseline === undefined ? "absent" : baseline.length === 0 ? "empty" : "foreign-content"} insertion baseline`,
        () =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const root = yield* fs.makeTempDirectoryScoped();
            const file = path.join(root, "AGENTS.md");
            if (baseline !== undefined) yield* fs.writeFileString(file, baseline);
            const authority = NativeWriteAuthorityLive.pipe(
              Layer.provide(
                Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
              ),
            );
            const args = {
              workspaceRoot: root,
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              ownerRoot: root,
              scope: "project" as const,
              targetPath: file,
              displayPath: "AGENTS.md",
              owner: `@agentxm/${kind}/instructions`,
              region: kind,
              generation: "a".repeat(64),
              contributors: [owner],
              ownership: [owner],
              configuredAgentIds: ["codex"],
              eligible: true,
            };
            yield* reconcileNativeManagedRegion({ ...args, rendered: "Managed body" }).pipe(
              Effect.provide(authority),
            );
            const removed = yield* reconcileNativeManagedRegion({
              ...args,
              contributors: [],
              rendered: "",
              eligible: false,
            }).pipe(Effect.provide(authority));
            expect(removed.nativeLocation.state).toBe("removed");
            if (baseline === undefined) expect(yield* fs.exists(file)).toBe(false);
            else expect(yield* fs.readFileString(file)).toBe(baseline);
          }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }

    it.effect("preserves a same-name region belonging to another accepted source root", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "AGENTS.md");
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          ownerRoot: root,
          scope: "project" as const,
          targetPath: file,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          contributors: [owner],
          ownership: [owner],
          configuredAgentIds: [],
          eligible: false,
        };
        yield* reconcileNativeManagedRegion({ ...args, rendered: "Original body" }).pipe(
          Effect.provide(authority.layer),
        );
        const before = yield* fs.readFileString(file);
        const replacement = { ...owner, root: "another/source" };
        expect(
          (yield* reconcileNativeManagedRegion({
            ...args,
            contributors: [replacement],
            ownership: [replacement],
            rendered: "Replacement",
          }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
        ).toBe("Failure");
        const withdrawal = yield* reconcileNativeManagedRegion({
          ...args,
          contributors: [],
          ownership: [replacement],
          rendered: "",
        }).pipe(Effect.provide(authority.layer));
        expect(withdrawal.nativeLocation.ownership).toBe("unowned");
        expect(yield* fs.readFileString(file)).toBe(before);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("preserves mixed foreign line endings and opaque current generated bodies", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "AGENTS.md");
        const prefix = "# Foreign\r\nLF paragraph\n";
        const suffix = "\nForeign tail\r\n";
        yield* fs.writeFileString(file, prefix);
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          ownerRoot: root,
          scope: "project" as const,
          targetPath: file,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          contributors: [owner],
          ownership: [owner],
          configuredAgentIds: [],
          eligible: false,
        };
        yield* reconcileNativeManagedRegion({ ...args, rendered: "Original managed body" }).pipe(
          Effect.provide(authority.layer),
        );
        yield* fs.writeFileString(file, (yield* fs.readFileString(file)) + suffix);
        yield* reconcileNativeManagedRegion({
          ...args,
          generation: "b".repeat(64),
          rendered: "Expected managed body",
        }).pipe(Effect.provide(authority.layer));
        const beforeRewrite = yield* fs.readFileString(file);
        expect(beforeRewrite.startsWith(prefix)).toBe(true);
        expect(beforeRewrite.endsWith(suffix)).toBe(true);
        const rewritten = beforeRewrite.replace(
          "Expected managed body",
          "Repository formatter output",
        );
        yield* fs.writeFileString(file, rewritten);
        const current = yield* reconcileNativeManagedRegion({
          ...args,
          generation: "b".repeat(64),
          rendered: "Expected managed body",
        }).pipe(Effect.provide(authority.layer));
        expect(current.changed).toBe(false);
        expect(yield* fs.readFileString(file)).toBe(rewritten);
        yield* reconcileNativeManagedRegion({ ...args, contributors: [], rendered: "" }).pipe(
          Effect.provide(authority.layer),
        );
        expect(yield* fs.readFileString(file)).toBe(prefix + suffix);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("preserves a current body rewrite without renewing its absent-file inverse", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "AGENTS.md");
        const authority = NativeWriteAuthorityLive.pipe(
          Layer.provide(
            Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
          ),
        );
        const args = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          ownerRoot: root,
          scope: "project" as const,
          targetPath: file,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          contributors: [owner],
          ownership: [owner],
          configuredAgentIds: [],
          eligible: true,
        };
        yield* reconcileNativeManagedRegion({ ...args, rendered: "Generated body" }).pipe(
          Effect.provide(authority),
        );
        const rewritten = (yield* fs.readFileString(file)).replace(
          "Generated body",
          "Repository formatter output",
        );
        yield* fs.writeFileString(file, rewritten);
        expect(
          (yield* reconcileNativeManagedRegion({
            ...args,
            rendered: "Generated body",
            eligible: false,
          }).pipe(Effect.provide(authority))).changed,
        ).toBe(false);
        expect(yield* fs.readFileString(file)).toBe(rewritten);
        yield* reconcileNativeManagedRegion({
          ...args,
          contributors: [],
          rendered: "",
          eligible: false,
        }).pipe(Effect.provide(authority));
        expect(yield* fs.exists(file)).toBe(true);
        expect(yield* fs.readFileString(file)).toBe("");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("refuses an alias retargeted while waiting for the native write lock", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const originalFile = path.join(root, "original.md");
        const replacementFile = path.join(root, "replacement.md");
        const alias = path.join(root, "AGENTS.md");
        yield* fs.writeFileString(originalFile, "# Original\n");
        yield* fs.writeFileString(replacementFile, "# Replacement\n");
        yield* fs.symlink("original.md", alias);
        const recording = yield* makeRecordingNativeWriteAuthority;
        const retargetingAuthority = Layer.effect(
          NativeWriteAuthority,
          Effect.map(NativeWriteAuthority, (authority) =>
            NativeWriteAuthority.of({
              ...authority,
              withExclusiveWrite: (target, effect) =>
                authority.withExclusiveWrite(
                  target,
                  fs.remove(alias).pipe(
                    Effect.andThen(fs.symlink("replacement.md", alias)),
                    Effect.mapError((cause) => new NativeWriteRefused({ path: target, cause })),
                    Effect.andThen(effect),
                  ),
                ),
            }),
          ),
        ).pipe(Layer.provide(recording.layer));
        const result = yield* reconcileNativeManagedRegion({
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          ownerRoot: root,
          scope: "project",
          targetPath: originalFile,
          displayPath: "AGENTS.md",
          owner: `@agentxm/${kind}/instructions`,
          region: kind,
          generation: "a".repeat(64),
          contributors: [owner],
          ownership: [owner],
          configuredAgentIds: [],
          eligible: true,
          rendered: "Managed body",
        }).pipe(Effect.provide(retargetingAuthority), Effect.result);
        expect(result._tag).toBe("Failure");
        expect(yield* fs.readFileString(originalFile)).toBe("# Original\n");
        expect(yield* fs.readFileString(replacementFile)).toBe("# Replacement\n");
        expect((yield* recording.observed).protectedPaths).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    it.effect("refuses an instruction alias into its contributor source before mutation", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const source = path.join(root, owner.root, "src/index.md");
        yield* fs.makeDirectory(path.dirname(source), { recursive: true });
        yield* fs.writeFileString(source, "# Source\n");
        yield* fs.symlink(source, path.join(root, "AGENTS.md"));
        const authority = yield* makeRecordingNativeWriteAuthority;
        expect(
          (yield* reconcileNativeManagedRegion({
            workspaceRoot: root,
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
            ownerRoot: root,
            scope: "project",
            targetPath: source,
            displayPath: "AGENTS.md",
            owner: `@agentxm/${kind}/instructions`,
            region: kind,
            generation: "a".repeat(64),
            contributors: [owner],
            ownership: [owner],
            configuredAgentIds: [],
            eligible: true,
            rendered: "Managed body",
          }).pipe(Effect.provide(authority.layer), Effect.result))._tag,
        ).toBe("Failure");
        expect(yield* fs.readFileString(source)).toBe("# Source\n");
        expect((yield* authority.observed).protectedPaths).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  });
}
