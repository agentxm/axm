import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { ExportHook } from "./export-hook.js";
import { prepareNativeHookImport } from "./interchange.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/export/creates-safe-native-bundle",
  title:
    "Native Hook export preserves a self-contained implementation without private configuration",
  statement:
    "Export shall create a new native bundle using the projection serializer for an explicitly selected implementation, preserve declared runtime resources and package provenance, and omit AXM ownership and consumer state. It shall refuse configuration-dependent commands, absolute workstation arguments, unsafe or occupied destinations, and content changed after preparation.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "The production exporter and native importer run on an isolated filesystem, observing source bytes, exported protocol fields, destination collisions and unchanged preview state.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The exported commands run with the bundle root as their working directory; export does not activate them in a native host.",
  ],
  openQuestions: [],
});

describe("Native Hook export", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (handler: Readonly<Record<string, unknown>> = {}, configuration?: unknown) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.write(
      "hooks/audit/hook.json",
      JSON.stringify({
        owner: "@acme",
        type: "hook",
        name: "audit",
        version: "1.0.0",
        assets: ["data/shared.txt"],
        ...(configuration === undefined ? {} : { configuration }),
        implementations: [
          {
            id: "claude",
            protocol: "claude-code",
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                matcher: "Bash",
                handler: {
                  type: "command",
                  runtime: "bash",
                  entrypoint: "src/audit.sh",
                  timeoutMs: 5000,
                  ...handler,
                },
              },
            ],
          },
        ],
      }),
    );
    created.write("hooks/audit/src/audit.sh", "#!/bin/bash\ntouch executed-sentinel\n");
    created.write("hooks/audit/data/shared.txt", "shared\n");
    return created;
  };
  const request = {
    directory: "hooks/audit",
    implementation: "claude",
    destination: "native-export",
  };

  it.effect("writes a round-trippable bundle without execution", () =>
    Effect.gen(function* () {
      const created = workspace();
      const sourceBefore = created.snapshot("hooks/audit");
      const resolution = yield* Effect.gen(function* () {
        const candidate = yield* ExportHook.prepare(request);
        return yield* ExportHook.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      expect(deriveOperationOutcome(resolution), JSON.stringify(resolution)).toBe("applied");
      expect(created.snapshot("hooks/audit")).toEqual(sourceBefore);
      expect(created.exists("executed-sentinel")).toBe(false);

      const native = created.read("native-export/hooks.json") ?? "";
      expect(JSON.parse(native)).toEqual({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "bash src/audit.sh", timeout: 5 }],
            },
          ],
        },
      });
      expect(native).not.toContain("_axm");
      expect(native).not.toContain(created.root);
      expect(created.read("native-export/data/shared.txt")).toBe("shared\n");
      const imported = yield* prepareNativeHookImport({
        source: nodePath.join(created.root, "native-export"),
        protocol: "claude-code",
        target: {
          owner: decodeHandleSync("@acme"),
          type: "hook",
          name: decodeExtensionNameSync("copy"),
        },
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));
      expect(imported.manifest.implementations[0]?.bindings[0]?.handler).toMatchObject({
        runtime: "bash",
        entrypoint: "src/audit.sh",
        timeoutMs: 5000,
      });
      expect(imported.files.map((file) => file.path).sort()).toEqual([
        "data/shared.txt",
        "src/audit.sh",
      ]);
      expect(imported.manifest.metadata).toMatchObject({
        nativeImport: {
          source: { fqn: "@acme/hooks/audit", version: "1.0.0", implementation: "claude" },
          originalRegistrationsPreserved: true,
        },
      });
    }),
  );

  for (const occupied of [
    "native-export/foreign.txt",
    "native-export.axm-staging/foreign.txt",
    "native-export.axm-backup/foreign.txt",
  ]) {
    it.effect(`preserves occupied ${occupied}`, () =>
      Effect.gen(function* () {
        const created = workspace();
        created.write(occupied, "foreign bytes");
        const before = created.snapshot();
        yield* ExportHook.prepare(request).pipe(
          Effect.flip,
          Effect.scoped,
          Effect.provide(authoringWorkspaceLayer(created)),
        );
        expect(created.snapshot()).toEqual(before);
      }),
    );
  }

  it.effect("refuses a dangling destination symlink", () =>
    Effect.gen(function* () {
      const created = workspace();
      nodeFs.symlinkSync("missing", nodePath.join(created.root, "native-export"));
      yield* ExportHook.prepare(request).pipe(
        Effect.flip,
        Effect.scoped,
        Effect.provide(authoringWorkspaceLayer(created)),
      );
      expect(nodeFs.readlinkSync(nodePath.join(created.root, "native-export"))).toBe("missing");
    }),
  );

  for (const handler of [
    { args: ["/home/private/input"] },
    { args: ["--file=C:\\private\\input"] },
    { env: { TOKEN: { env: "PRIVATE_TOKEN" } } },
  ]) {
    it.effect(`refuses private command inputs ${JSON.stringify(handler)}`, () =>
      Effect.gen(function* () {
        const created = workspace(handler);
        const before = created.snapshot();
        yield* ExportHook.prepare(request).pipe(
          Effect.flip,
          Effect.scoped,
          Effect.provide(authoringWorkspaceLayer(created)),
        );
        expect(created.snapshot()).toEqual(before);
      }),
    );
  }

  it.effect("refuses consumer configuration and changed source content", () =>
    Effect.gen(function* () {
      const configured = workspace({}, { label: { type: "string", default: "private" } });
      yield* ExportHook.prepare(request).pipe(
        Effect.flip,
        Effect.scoped,
        Effect.provide(authoringWorkspaceLayer(configured)),
      );
      const created = workspace();
      const resolution = yield* Effect.gen(function* () {
        const candidate = yield* ExportHook.prepare(request);
        created.write("hooks/audit/src/audit.sh", "changed\n");
        return yield* ExportHook.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      expect(deriveOperationOutcome(resolution)).toBe("failed");
      expect(created.exists("native-export")).toBe(false);
      expect(created.read("hooks/audit/src/audit.sh")).toBe("changed\n");
    }),
  );
});
