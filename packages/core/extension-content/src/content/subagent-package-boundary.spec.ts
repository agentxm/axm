import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  loadSubagentPackage,
  readSubagentPackage,
  validateFilteredPackage,
  FilteredPackageError,
  SubagentContentError,
  type ZipEntry,
} from "../index.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "subagents/package-references-stay-contained-and-complete",
  title: "Every subagent implementation source remains inside its complete package",
  statement:
    "AXM shall validate every declared subagent source as a contained regular file, reject escaped and missing sources, and require all sources to survive publication filtering even when an implementation is not selected for the current workspace.",
  class: "quality",
  characteristic: "security",
  role: "interface",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Real filesystem resolution proves symlink containment and regular-file requirements; filtered archive entries prove publication completeness.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const identity = { owner: "@acme", type: "subagent", name: "review", version: "1.0.0" };
const portable = { ...identity, description: "Reviews", core: { instructions: "instructions.md" } };
const entry = (fileName: string): ZipEntry => ({
  fileName,
  compressedSize: 1,
  uncompressedSize: 1,
  compressionMethod: 0,
  externalAttributes: 0,
  localHeaderOffset: 0,
});

it.effect(
  "validates dormant native implementations and rejects a native file removed by publication filtering",
  () =>
    Effect.gen(function* () {
      const manifest = {
        ...portable,
        implementations: { codex: { kind: "native", source: "native/codex.toml" } },
      };
      const error = yield* validateFilteredPackage({
        type: "subagent",
        entries: [entry("subagent.json"), entry("instructions.md")],
        manifest: {
          identity: {
            owner: handle("@acme"),
            type: "subagent",
            name: extensionName("review"),
            version: exactVersion("1.0.0"),
          },
          raw: manifest,
          fileName: "subagent.json",
        },
        readEntry: (source) =>
          source === "instructions.md"
            ? Effect.succeed(new TextEncoder().encode("Review."))
            : Effect.fail(
                new FilteredPackageError({
                  code: "required_file_missing",
                  detail: "Missing source",
                  path: source,
                }),
              ),
      }).pipe(Effect.flip);
      expect(error.code).toBe("required_file_missing");
      expect(error.path).toBe("native/codex.toml");
    }),
);

it.effect("rejects malformed unselected native content and obsolete nested overrides", () =>
  Effect.gen(function* () {
    const error = yield* readSubagentPackage({
      manifest: {
        ...portable,
        implementations: { codex: { kind: "native", source: "native/codex.toml" } },
      },
      readFile: (source) =>
        Effect.succeed(source === "instructions.md" ? "Review." : 'name = "unterminated'),
    }).pipe(Effect.flip);
    expect(error.reason).toBe("native-invalid");
    const unsafe = yield* readSubagentPackage({
      manifest: {
        ...portable,
        implementations: {
          codex: { kind: "customized", configuration: { vendor: { constructor: "unsafe" } } },
        },
      },
      readFile: () => Effect.succeed("Review."),
    }).pipe(Effect.flip);
    expect(unsafe.reason).toBe("manifest-invalid");
  }),
);

layer(NodeServices.layer, { excludeTestServices: true })("subagent source containment", (it) => {
  it.effect("loads a complete package with sources outside src", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "subagent.json"), JSON.stringify(portable));
      yield* fs.writeFileString(path.join(root, "instructions.md"), "Review.");
      const pkg = yield* loadSubagentPackage(root);
      expect(pkg.core?.instructions).toBe("Review.");
    }).pipe(Effect.scoped),
  );

  it.effect("refuses missing files, directories, and symlinks to files outside the package", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "subagent.json"), JSON.stringify(portable));
      const missing = yield* loadSubagentPackage(root).pipe(Effect.flip);
      expect(missing).toBeInstanceOf(SubagentContentError);
      expect(missing.reason).toBe("reference-invalid");
      yield* fs.makeDirectory(path.join(root, "instructions.md"));
      const directory = yield* loadSubagentPackage(root).pipe(Effect.flip);
      expect(directory.detail).toContain("regular file");
      yield* fs.remove(path.join(root, "instructions.md"), { recursive: true });
      yield* fs.writeFileString(path.join(outside, "external.md"), "External content.");
      yield* fs.symlink(path.join(outside, "external.md"), path.join(root, "instructions.md"));
      const escaped = yield* loadSubagentPackage(root).pipe(Effect.flip);
      expect(escaped.detail).toContain("escapes its package");
    }).pipe(Effect.scoped),
  );
});
