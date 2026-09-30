import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { NativeLocationOutcome } from "../locations/index.js";
import {
  captureNativeRetentionWitnesses,
  validateNativeRetentionWitnesses,
} from "./native-retention.js";

const location = (address: NativeLocationOutcome["address"]): NativeLocationOutcome => ({
  scope: "project",
  address,
  aliases: [address.path],
  configuredConsumers: ["claude-code"],
  potentialReaders: [],
  policyReasons: [],
  ownership: "owned",
  state: "unchanged",
  availability: [],
});

describe("retained native content", () => {
  it.effect(
    "accepts existing opaque body changes but rejects a later change to the retained file",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "reviewer.md");
        const context = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        };
        yield* fs.writeFileString(file, "A body already rewritten before the operation.\n");
        const before = yield* captureNativeRetentionWitnesses(
          [location({ kind: "file", path: file })],
          context,
        );
        yield* validateNativeRetentionWitnesses(before, context);
        yield* fs.writeFileString(file, "Changed during the operation.\n");
        expect(
          (yield* validateNativeRetentionWitnesses(before, context).pipe(Effect.result))._tag,
        ).toBe("Failure");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("compares the selected managed region while another region changes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, "AGENTS.md");
      const context = {
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      };
      const original =
        "<!-- axm:start v=1 region=rules -->\r\nFormatted retained rules.\r\n<!-- axm:end v=1 region=rules -->\r\n<!-- axm:start v=1 region=knowledge -->\nOld knowledge.\n<!-- axm:end v=1 region=knowledge -->\n";
      yield* fs.writeFileString(file, original);
      const before = yield* captureNativeRetentionWitnesses(
        [location({ kind: "region", path: file, region: "rules" })],
        context,
      );
      yield* fs.writeFileString(file, original.replace("Old knowledge.", "Updated knowledge."));
      yield* validateNativeRetentionWitnesses(before, context);
      yield* fs.writeFileString(
        file,
        original.replace("Formatted retained rules.", "Unexpected rule change."),
      );
      expect(
        (yield* validateNativeRetentionWitnesses(before, context).pipe(Effect.result))._tag,
      ).toBe("Failure");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "compares only the selected decoded MCP entry while a sibling and serialization change",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".mcp.json");
        const context = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        };
        yield* fs.writeFileString(
          file,
          '{"mcpServers":{"kept":{"command":"node","args":["kept.js"]},"other":{"command":"old"}}}\n',
        );
        const before = yield* captureNativeRetentionWitnesses(
          [location({ kind: "key-path", path: file, keys: ["mcpServers", "kept"] })],
          context,
        );
        yield* fs.writeFileString(
          file,
          JSON.stringify(
            {
              mcpServers: {
                other: { command: "new" },
                kept: { args: ["kept.js"], command: "node" },
              },
            },
            null,
            2,
          ),
        );
        yield* validateNativeRetentionWitnesses(before, context);
        yield* fs.writeFileString(
          file,
          JSON.stringify({ mcpServers: { kept: { command: "unwanted" } } }),
        );
        expect(
          (yield* validateNativeRetentionWitnesses(before, context).pipe(Effect.result))._tag,
        ).toBe("Failure");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("retains instruction routes while their region owners change content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "AGENTS.md");
      const alias = path.join(root, "CLAUDE.md");
      const other = path.join(root, "other.md");
      const context = {
        workspaceRoot: root,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      };
      yield* fs.writeFileString(source, "Original managed region.\n");
      yield* fs.symlink("AGENTS.md", alias);
      const before = yield* captureNativeRetentionWitnesses(
        [
          {
            ...location({ kind: "file", path: source }),
            policyReasons: ["instruction-propagation"],
            proof: "canonical-source-coincidence",
          },
          {
            ...location({ kind: "entry", path: alias }),
            policyReasons: ["instruction-propagation"],
            proof: "exact-canonical-source-link",
          },
        ],
        context,
      );
      yield* fs.writeFileString(source, "Updated managed region.\n");
      yield* validateNativeRetentionWitnesses(before, context);
      yield* fs.writeFileString(other, "Updated managed region.\n");
      yield* fs.remove(alias);
      yield* fs.symlink("other.md", alias);
      expect(
        (yield* validateNativeRetentionWitnesses(before, context).pipe(Effect.result))._tag,
      ).toBe("Failure");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rechecks alias routes instead of accepting identical bytes at a replacement target",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const first = path.join(root, "first.md");
        const second = path.join(root, "second.md");
        const alias = path.join(root, "alias.md");
        const context = {
          workspaceRoot: root,
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        };
        yield* fs.writeFileString(first, "Same body.\n");
        yield* fs.writeFileString(second, "Same body.\n");
        yield* fs.symlink("first.md", alias);
        const before = yield* captureNativeRetentionWitnesses(
          [{ ...location({ kind: "file", path: first }), aliases: [first, alias] }],
          context,
        );
        yield* fs.remove(alias);
        yield* fs.symlink("second.md", alias);
        expect(
          (yield* validateNativeRetentionWitnesses(before, context).pipe(Effect.result))._tag,
        ).toBe("Failure");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
