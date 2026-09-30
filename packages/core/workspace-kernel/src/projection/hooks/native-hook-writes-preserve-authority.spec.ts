import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import {
  reconcileNativeHookConfig,
  updateHooksJson,
  readManagedHookUnits,
  type HookOwnership,
} from "../../agent-adapters/index.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import { resolveNativeReadLocation } from "../../locations/index.js";
import { makeRecordingNativeWriteAuthority } from "../../agent-adapters/testing.js";
import { NativeWriteAuthorityLive } from "../live.js";
import { reconcileNativeManagedRegion } from "../index.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";

export const specification = defineSpecification({
  requirement: "workspace/hooks/native-writes-preserve-scoped-authority",
  title: "Native Hook writes preserve exact scoped authority and foreign content",
  statement:
    "AXM shall mutate Hook entries only under exact accepted identity, scope, and canonical source-root ownership, shall preserve foreign entries and their untouched bytes, and shall refuse escaping aliases or a whole-file grammar conflict before writing native configuration.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition", "agent-interoperability"],
  boundary: "platform",
  boundaryRationale:
    "Real temporary files and aliases distinguish physical native writes from lexical declarations.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/install/preserves-unrelated-and-unowned-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const owner: HookOwnership = {
  name: "audit",
  ref: "@acme/hooks/audit",
  scope: "project",
  root: "agent_extensions/registry/@acme/hooks/audit",
};
const groups = (proof: HookOwnership = owner) => ({
  PreToolUse: [
    {
      matcher: "Write",
      hooks: [
        {
          type: "command",
          command: "bash audit.sh",
          "x-axm": {
            v: 1,
            managed: true,
            unit: `hook:${proof.name}`,
            source: "extension",
            ref: proof.ref,
            scope: proof.scope,
            root: proof.root,
          },
        },
      ],
    },
  ],
});

describe("native Hook ownership", () => {
  it.effect(
    "reports observed Hook ownership during preview and owned proof only after creation",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".claude/settings.json");
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          ownerRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          scope: "project" as const,
          path: file,
          aliases: [file],
          consumers: ["claude-code"],
          settingsKey: "hooks",
          format: "json" as const,
          ownership: [owner],
          rendered: groups(),
          nativeInsertionEligibleNames: new Set<string>(),
        };
        const proposed = yield* reconcileNativeHookConfig({ ...args, dryRun: true }).pipe(
          Effect.provide(authority.layer),
        );
        expect(proposed.nativeLocation).toMatchObject({ ownership: "absent", state: "created" });
        expect(proposed.nativeLocation.proof).toBeUndefined();
        expect(yield* fs.exists(file)).toBe(false);
        expect((yield* authority.observed).protectedPaths).toEqual([]);
        const applied = yield* reconcileNativeHookConfig(args).pipe(
          Effect.provide(authority.layer),
        );
        expect(applied.nativeLocation).toMatchObject({
          ownership: "owned",
          state: "created",
          proof: "exact-hook-identity-scope-and-source-root",
        });
        const bytes = yield* fs.readFileString(file);
        const current = yield* reconcileNativeHookConfig({ ...args, dryRun: true }).pipe(
          Effect.provide(authority.layer),
        );
        expect(current.nativeLocation).toMatchObject({
          ownership: "owned",
          state: "unchanged",
          proof: "exact-hook-identity-scope-and-source-root",
        });
        expect(yield* fs.readFileString(file)).toBe(bytes);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("uses a captured external vendor root only in user scope", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const home = path.join(root, "home");
      const vendor = path.join(root, "vendor");
      yield* fs.makeDirectory(home);
      yield* fs.makeDirectory(vendor);
      const file = path.join(vendor, "settings.json");
      const proof: HookOwnership = { ...owner, scope: "user" };
      const authority = yield* makeRecordingNativeWriteAuthority;
      const args = {
        workspaceRoot: home,
        nativeDirectoryInputs: {
          skillsDirectoryOverrides: {},
          userConfigRootOverrides: { "claude-code": vendor },
        },
        ownerRoot: home,
        path: file,
        aliases: [file],
        consumers: ["claude-code"],
        settingsKey: "hooks",
        format: "json" as const,
        ownership: [proof],
        rendered: groups(proof),
        nativeInsertionEligibleNames: new Set<string>(),
      };
      expect(
        (yield* reconcileNativeHookConfig({ ...args, scope: "project" }).pipe(
          Effect.provide(authority.layer),
          Effect.result,
        ))._tag,
      ).toBe("Failure");
      expect(yield* fs.exists(file)).toBe(false);
      const result = yield* reconcileNativeHookConfig({ ...args, scope: "user" }).pipe(
        Effect.provide(authority.layer),
      );
      expect(result.nativeLocation.address.path).toBe(file);
      expect(result.nativeLocation.configuredConsumers).toEqual(["claude-code"]);
      expect(result.nativeLocation.availability).toEqual([
        expect.objectContaining({ agentId: "claude-code", state: "unverified" }),
      ]);
      expect(yield* fs.readFileString(file)).toContain("bash audit.sh");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("expands user Hook routes against the selected home root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const native = AGENTS.find(({ id }) => id === "claude-code")?.capabilities.hook.native;
      const declaration =
        native !== undefined && "locations" in native
          ? native.locations.find(({ scope }) => scope === "user")
          : undefined;
      if (declaration === undefined) throw new Error("Claude user Hook reader is not declared");
      expect(
        resolveNativeReadLocation(
          path,
          "claude-code",
          declaration,
          { scope: "user", workspaceRoot: "/selected-home" },
          { skillsDirectoryOverrides: {} },
        )?.path,
      ).toBe("/selected-home/.claude/settings.json");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each([false, true])(
    "only a configured TOML co-reader constrains Hook writes: %s",
    (configured) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".claude/settings.json");
        yield* fs.makeDirectory(path.dirname(file));
        yield* fs.makeDirectory(path.join(root, ".codex"));
        yield* fs.writeFileString(file, "");
        yield* fs.symlink("../.claude/settings.json", path.join(root, ".codex/config.toml"));
        const authority = yield* makeRecordingNativeWriteAuthority;
        const result = yield* reconcileNativeHookConfig({
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          ownerRoot: root,
          scope: "project",
          path: file,
          aliases: [file],
          consumers: ["claude-code"],
          configuredAgentIds: configured ? ["claude-code", "codex"] : ["claude-code"],
          settingsKey: "hooks",
          format: "json",
          rendered: groups(),
          ownership: [owner],
          nativeInsertionEligibleNames: new Set(),
        }).pipe(Effect.provide(authority.layer), Effect.result);
        expect(result._tag).toBe(configured ? "Failure" : "Success");
        if (configured) {
          expect(yield* fs.readFileString(file)).toBe("");
          expect((yield* authority.observed).protectedPaths).toEqual([]);
        } else {
          expect(yield* fs.readFileString(file)).toContain("PreToolUse");
          expect(yield* fs.readLink(path.join(root, ".codex/config.toml"))).toBe(
            "../.claude/settings.json",
          );
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const foreign of [
    { ...owner, ref: "@foreign/hooks/audit" },
    { ...owner, scope: "user" as const },
    { ...owner, root: "unrelated" },
  ]) {
    it.effect(`refuses mismatched ${foreign.ref}/${foreign.scope}/${foreign.root} evidence`, () =>
      Effect.gen(function* () {
        const raw = JSON.stringify({ hooks: groups(foreign) });
        expect(yield* readManagedHookUnits("native.json", "hooks", raw, [owner])).toEqual([]);
        const failure = yield* updateHooksJson(
          "native.json",
          "hooks",
          raw,
          groups(),
          [owner],
          "json",
        ).pipe(Effect.result);
        expect(failure._tag).toBe("Failure");
        expect(yield* updateHooksJson("native.json", "hooks", raw, {}, [owner], "json")).toBe(raw);
      }),
    );
  }

  it.effect(
    "preserves foreign Hook comments and empty groups while retiring an owned neighbor",
    () =>
      Effect.gen(function* () {
        const foreign =
          '"Stop": [\n // foreign hook comment\n {"hooks": []}, {"hooks": [{"type":"command", "command":"echo keep"}]}\n]';
        const raw = `{ "hooks": {${foreign}, "PreToolUse": ${JSON.stringify(groups().PreToolUse)}} }`;
        const next = yield* updateHooksJson("native.jsonc", "hooks", raw, {}, [owner], "jsonc");
        expect(next).toContain(foreign);
        expect(next).not.toContain("bash audit.sh");
      }),
  );

  it.effect("writes an in-root aliased configuration once and preserves its link", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "native.json");
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(file, "{}\n");
      yield* fs.symlink("native.json", alias);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const args = {
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        ownerRoot: root,
        scope: "project" as const,
        path: alias,
        aliases: [file, alias],
        consumers: ["first", "second"],
        settingsKey: "hooks",
        format: "json" as const,
        rendered: groups(),
        ownership: [owner],
        nativeInsertionEligibleNames: new Set<string>(),
      };
      const outcome = yield* reconcileNativeHookConfig(args).pipe(Effect.provide(authority.layer));
      expect(outcome.nativeLocation.address.path).toBe(file);
      expect(outcome.nativeLocation.configuredConsumers).toEqual(["first", "second"]);
      expect(yield* fs.readLink(alias)).toBe("native.json");
      yield* reconcileNativeHookConfig(args).pipe(Effect.provide(authority.layer));
      expect((yield* authority.observed).records).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses whole-file JSONC when the location requires strict JSON", () =>
    Effect.gen(function* () {
      const raw = '{\n// foreign comment\n"unowned": true\n}';
      expect(
        (yield* updateHooksJson("native.json", "hooks", raw, groups(), [owner], "json").pipe(
          Effect.result,
        ))._tag,
      ).toBe("Failure");
    }),
  );

  it.effect("refuses an escaping file alias before protecting or writing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      const external = path.join(outside, "native.json");
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(external, "{}\n");
      yield* fs.symlink(external, alias);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* reconcileNativeHookConfig({
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        ownerRoot: root,
        scope: "project",
        path: alias,
        aliases: [alias],
        consumers: ["reader"],
        settingsKey: "hooks",
        format: "json",
        rendered: groups(),
        ownership: [owner],
        nativeInsertionEligibleNames: new Set(),
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(external)).toBe("{}\n");
      expect((yield* authority.observed).protectedPaths).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const baseline of [undefined, "{ }\n"]) {
    it.effect(
      `restores an eligible ${baseline === undefined ? "absent" : "preexisting"} baseline after a batch of Hook insertions`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "native.json");
          if (baseline !== undefined) yield* fs.writeFileString(file, baseline);
          const second = {
            ...owner,
            name: "second",
            ref: "@acme/hooks/second",
            root: "agent_extensions/registry/@acme/hooks/second",
          };
          const rendered = { PreToolUse: [...groups().PreToolUse, ...groups(second).PreToolUse] };
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
            path: file,
            aliases: [file],
            consumers: ["claude-code"],
            settingsKey: "hooks",
            format: "json" as const,
            ownership: [owner, second],
            nativeInsertionEligibleNames: new Set([owner.name, second.name]),
          };
          yield* reconcileNativeHookConfig({ ...args, rendered }).pipe(Effect.provide(authority));
          yield* reconcileNativeHookConfig({
            ...args,
            rendered: {},
            nativeInsertionEligibleNames: new Set(),
          }).pipe(Effect.provide(authority));
          if (baseline === undefined) expect(yield* fs.exists(file)).toBe(false);
          else expect(yield* fs.readFileString(file)).toBe(baseline);
          expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(false);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  for (const baseline of [undefined, "", "# Existing instructions\n"]) {
    it.effect(
      `restores the ${baseline === undefined ? "absent" : baseline.length === 0 ? "empty" : "foreign-content"} baseline after advisory Hook withdrawal`,
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
            owner: "@agentxm/hooks/fallbacks",
            region: "hook-fallbacks" as const,
            generation: "a".repeat(64),
            contributors: [owner],
            ownership: [owner],
            configuredAgentIds: ["windsurf"],
            eligible: true,
          };
          yield* reconcileNativeManagedRegion({ ...args, rendered: "Advisory hook body" }).pipe(
            Effect.provide(authority),
          );
          yield* reconcileNativeManagedRegion({
            ...args,
            contributors: [],
            rendered: "",
            eligible: false,
          }).pipe(Effect.provide(authority));
          if (baseline === undefined) expect(yield* fs.exists(file)).toBe(false);
          else expect(yield* fs.readFileString(file)).toBe(baseline);
          expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(false);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("preserves an advisory region whose source owner is no longer accepted", () =>
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
        owner: "@agentxm/hooks/fallbacks",
        region: "hook-fallbacks" as const,
        generation: "a".repeat(64),
        contributors: [owner],
        ownership: [owner],
        configuredAgentIds: ["windsurf"],
        eligible: false,
      };
      yield* reconcileNativeManagedRegion({ ...args, rendered: "Existing advisory Hook" }).pipe(
        Effect.provide(authority.layer),
      );
      const before = yield* fs.readFileString(file);
      const other = { ...owner, ref: "@unowned/hooks/audit" };
      const denied = yield* reconcileNativeManagedRegion({
        ...args,
        contributors: [other],
        ownership: [other],
        rendered: "Replacement",
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(denied._tag).toBe("Failure");
      yield* reconcileNativeManagedRegion({
        ...args,
        contributors: [],
        ownership: [],
        rendered: "",
      }).pipe(Effect.provide(authority.layer));
      expect(yield* fs.readFileString(file)).toBe(before);
      expect((yield* authority.observed).records).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
