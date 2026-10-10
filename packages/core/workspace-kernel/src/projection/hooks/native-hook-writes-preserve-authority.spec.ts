import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  reconcileNativeHookConfig,
  updateHooksJson,
  readDeclaredHookUnits,
  type HookNativeDeclaration,
} from "../../agent-adapters/index.js";
import { makeRecordingNativeWriteAuthority } from "../../agent-adapters/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/hooks/native-writes-preserve-scoped-authority",
  title: "Native Hook declarations select canonical script registrations",
  statement:
    "AXM shall replace only command registrations whose parsed runtime script belongs to the declared canonical Hook package in the selected scope, shall preserve unrelated registrations and their ordering and untouched bytes, and shall refuse escaping aliases, overlapping declarations, or a whole-file grammar conflict before writing native configuration.",
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

const declaration: HookNativeDeclaration = {
  name: "audit",
  ref: "@acme/hooks/audit",
  scope: "project",
  root: "/workspace/hooks/audit",
};
const command = "node '/workspace/hooks/audit/src/handler.js'";
const groups = (args = "--new") => ({
  PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: `${command} ${args}` }] }],
});

describe("native Hook declarations", () => {
  it.effect(
    "replaces unmarked registrations, deduplicates old execution, and preserves foreign bytes",
    () =>
      Effect.gen(function* () {
        const foreign =
          '"Stop": [\n // untouched comment\n {"hooks": []}, {"hooks": [{"type":"command", "command":"echo keep"}]}\n]';
        const old = {
          hooks: [
            { type: "command", command: `${command} --old`, "x-axm": { invalid: true } },
            { type: "command", command: `${command} --old` },
            { type: "command", command: "echo unrelated" },
          ],
        };
        const raw = `{ "hooks": {${foreign}, "PreToolUse": [${JSON.stringify(old)}]} }`;
        const next = yield* updateHooksJson(
          "native.jsonc",
          "hooks",
          raw,
          groups(),
          [declaration],
          "jsonc",
        );
        expect(next).toContain(foreign);
        expect(next).toContain("echo unrelated");
        expect(next).not.toContain("--old");
        expect(next).not.toContain("x-axm");
        expect(next.match(/--new/gu)).toHaveLength(1);
        expect(
          yield* updateHooksJson("native.jsonc", "hooks", next, groups(), [declaration], "jsonc"),
        ).toBe(next);
        expect(yield* readDeclaredHookUnits("native.jsonc", "hooks", next, [declaration])).toEqual([
          { name: "audit", command: `${command} --new` },
        ]);
      }),
  );

  it.effect(
    "absence retains registrations and explicit selection withdraws only that package",
    () =>
      Effect.gen(function* () {
        const raw = JSON.stringify({ hooks: groups() });
        expect(yield* updateHooksJson("native.json", "hooks", raw, {}, [], "json")).toBe(raw);
        const removed = yield* updateHooksJson(
          "native.json",
          "hooks",
          raw,
          {},
          [declaration],
          "json",
        );
        expect(removed).not.toContain("handler.js");
      }),
  );

  it.effect.each([
    "echo '/workspace/hooks/audit/src/handler.js'",
    "node '/workspace/hooks/auditor/src/handler.js'",
    "node '/workspace/hooks/audit/../foreign.js'",
    "node '/other/hooks/audit/src/handler.js'",
  ])("preserves a command outside the declared executable address: %s", (foreign) =>
    Effect.gen(function* () {
      const raw = JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: foreign }] }] },
      });
      const next = yield* updateHooksJson(
        "native.json",
        "hooks",
        raw,
        groups(),
        [declaration],
        "json",
      );
      expect(next).toContain(foreign);
    }),
  );

  it.effect(
    "handles quoted roots, secret references and matcher changes without duplicate execution",
    () =>
      Effect.gen(function* () {
        const owner = { ...declaration, root: "/space dir/audit" };
        const old = {
          PreToolUse: [
            {
              matcher: "Read",
              hooks: [
                {
                  type: "command",
                  command: `TOKEN="\${TOKEN:?Required}" node '/space dir/audit/old.js' --old`,
                },
              ],
            },
          ],
        };
        const desired = {
          PostToolUse: [
            {
              matcher: "Write",
              hooks: [
                {
                  type: "command",
                  command: `TOKEN="\${TOKEN:?Required}" node '/space dir/audit/new.js' --new`,
                },
              ],
            },
          ],
        };
        const next = yield* updateHooksJson(
          "native.json",
          "hooks",
          JSON.stringify({ hooks: old }),
          desired,
          [owner],
          "json",
        );
        expect(next).not.toContain("old.js");
        expect(next.match(/new.js/gu)).toHaveLength(1);
        expect(yield* updateHooksJson("native.json", "hooks", next, desired, [owner], "json")).toBe(
          next,
        );
      }),
  );

  it.effect("rejects overlapping declarations and strict-reader grammar conflicts", () =>
    Effect.gen(function* () {
      expect(
        (yield* updateHooksJson(
          "native.json",
          "hooks",
          "{}",
          groups(),
          [declaration, { ...declaration, name: "other" }],
          "json",
        ).pipe(Effect.result))._tag,
      ).toBe("Failure");
      expect(
        (yield* updateHooksJson(
          "native.json",
          "hooks",
          "{// comment\n}",
          groups(),
          [declaration],
          "json",
        ).pipe(Effect.result))._tag,
      ).toBe("Failure");
    }),
  );

  it.effect.each(["project", "user"] as const)(
    "previews without writes and writes one shared %s target without receipts",
    (scope) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "native.json");
        const alias = path.join(root, "alias.json");
        yield* fs.writeFileString(file, "{}\n");
        yield* fs.symlink("native.json", alias);
        const owner = { ...declaration, scope, root: path.join(root, "hooks/audit") };
        const rendered = {
          PreToolUse: [
            { hooks: [{ type: "command", command: `node '${owner.root}/src/handler.js'` }] },
          ],
        };
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          ownerRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
          scope,
          path: alias,
          aliases: [file, alias],
          consumers: ["claude-code"],
          settingsKey: "hooks",
          format: "json" as const,
          declarations: [owner],
          rendered,
        };
        const preview = yield* reconcileNativeHookConfig({ ...args, dryRun: true }).pipe(
          Effect.provide(authority.layer),
        );
        expect(preview.nativeLocation).toMatchObject({ ownership: "declared", state: "updated" });
        expect(yield* fs.readFileString(file)).toBe("{}\n");
        expect((yield* authority.observed).records).toHaveLength(0);
        yield* reconcileNativeHookConfig(args).pipe(Effect.provide(authority.layer));
        yield* reconcileNativeHookConfig(args).pipe(Effect.provide(authority.layer));
        expect((yield* authority.observed).records).toHaveLength(1);
        expect(yield* fs.readLink(alias)).toBe("native.json");
        expect(yield* fs.readFileString(file)).not.toContain("x-axm");
        expect(yield* fs.exists(path.join(root, ".axm/projection-containers.json"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses an escaping alias before protecting or writing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      const file = path.join(outside, "native.json");
      yield* fs.writeFileString(file, "{}\n");
      const alias = path.join(root, "alias.json");
      yield* fs.symlink(file, alias);
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* reconcileNativeHookConfig({
        workspaceRoot: root,
        ownerRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        scope: "project",
        path: alias,
        aliases: [alias],
        consumers: ["claude-code"],
        settingsKey: "hooks",
        format: "json",
        declarations: [declaration],
        rendered: groups(),
      }).pipe(Effect.provide(authority.layer), Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(file)).toBe("{}\n");
      expect((yield* authority.observed).records).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
