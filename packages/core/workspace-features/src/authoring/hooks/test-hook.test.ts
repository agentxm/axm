import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { FileSystemRecorder } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { computePackageContentHash } from "@agentxm/workspace-kernel/workspace-state";
import { makeAuthoringWorkspace } from "../test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { collectBounded, HOOK_TEST_MAX_BYTES, TestHook } from "./test-hook.js";

describe("hook fixture output collection", () => {
  it.effect("preserves UTF-8 characters split across process chunks", () =>
    Effect.gen(function* () {
      const bytes = new TextEncoder().encode("before 😀 é after");
      const output = yield* collectBounded(
        Stream.fromIterable(Array.from(bytes, (byte) => Uint8Array.of(byte))),
      );
      expect(output).toBe("before 😀 é after");
    }),
  );

  it.effect("enforces the raw byte limit across chunks", () =>
    Effect.gen(function* () {
      const failure = yield* collectBounded(
        Stream.make(new Uint8Array(HOOK_TEST_MAX_BYTES), Uint8Array.of(0)),
      ).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "OperationRefused",
        diagnostic: { kind: "authoring-failed" },
        detail: "Hook output exceeded the 1 MiB limit",
      });
    }),
  );

  it.effect("gives each execution an independent decoder and byte budget", () =>
    Effect.gen(function* () {
      const execution = collectBounded(Stream.make(new TextEncoder().encode("é")));
      expect(yield* execution).toBe("é");
      expect(yield* execution).toBe("é");
    }),
  );
});

// Real child processes and a real package directory: the claims concern which
// package files one fixture run reads, and that the receipt's content hash is
// the package's own hash whatever bytes its files hold.
describe("hook fixture execution reads", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Echo stdin to stdout, so a passing fixture proves the input it was fed. */
  const ECHO = "process.stdin.pipe(process.stdout);";
  const INPUT = '{"hook_event_name":"PreToolUse"}';

  const fixture = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    implementation: "claude",
    binding: "audit",
    input: "fixtures/input.json",
    expect: { exitCode: 0, stdout: "fixtures/stdout.txt" },
    ...overrides,
  });

  const manifest = (
    fixtures: ReadonlyArray<Record<string, unknown>>,
    extra: Record<string, unknown> = {},
  ) => ({
    owner: "@acme",
    type: "hook",
    name: "audit",
    version: "1.0.0",
    ...extra,
    implementations: [
      {
        id: "claude",
        protocol: "claude-code",
        bindings: [
          {
            id: "audit",
            event: "PreToolUse",
            handler: { type: "command", runtime: "node", entrypoint: "src/hook.cjs" },
          },
        ],
      },
    ],
    fixtures,
  });

  /** A workspace holding one Hook package at `hooks/audit` whose manifest bytes are `manifestBytes`. */
  const arrange = (options: {
    readonly manifestBytes?: Uint8Array;
    readonly fixtures?: ReadonlyArray<Record<string, unknown>>;
    readonly script?: string;
  }) => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(workspace.cleanup);
    const root = nodePath.join(workspace.root, "hooks/audit");
    workspace.write("hooks/audit/src/hook.cjs", options.script ?? ECHO);
    workspace.write("hooks/audit/fixtures/input.json", INPUT);
    workspace.write("hooks/audit/fixtures/stdout.txt", INPUT);
    nodeFs.writeFileSync(
      nodePath.join(root, "hook.json"),
      options.manifestBytes ??
        new TextEncoder().encode(JSON.stringify(manifest(options.fixtures ?? [fixture("one")]))),
    );
    return { workspace, root };
  };

  /** Run the package's fixtures, measuring the run alone. */
  const run = (
    arranged: ReturnType<typeof arrange>,
    request: { readonly fixtures?: ReadonlyArray<string> } = {},
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const result = yield* work.provide(
        TestHook.run({ directory: "hooks/audit", ...request }).pipe(Effect.result),
      );
      const calls = recording.calls();
      const count = (relative: string, method: "readFile" | "realPath" | "stat") =>
        calls.filter(
          (call) => call.method === method && call.path === nodePath.join(arranged.root, relative),
        ).length;
      return {
        result,
        count,
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
        // Hashed after the run, from the files as they now stand.
        freshHash: yield* computePackageContentHash(arranged.root),
      };
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(arranged.workspace)));

  const succeeded = <A, E>(
    result:
      | { readonly _tag: "Success"; readonly success: A }
      | { readonly _tag: "Failure"; readonly failure: E },
  ) => {
    if (result._tag !== "Success")
      throw new Error(`Expected the run to succeed: ${String(result.failure)}`);
    return result.success;
  };

  it.live("reads the manifest and the first fixture's files once before the after-run hash", () =>
    Effect.gen(function* () {
      const arranged = arrange({});
      const { result, count, hashes, freshHash } = yield* run(arranged);

      const receipt = succeeded(result);
      expect(receipt.passed).toBe(true);
      expect(receipt.contentHash).toBe(freshHash);
      expect(hashes).toBe(2);
      // One read before execution and one by the after-run hash, which reads live.
      expect({
        manifest: count("hook.json", "readFile"),
        input: count("fixtures/input.json", "readFile"),
        stdout: count("fixtures/stdout.txt", "readFile"),
        entrypoint: count("src/hook.cjs", "readFile"),
      }).toEqual({ manifest: 2, input: 2, stdout: 2, entrypoint: 2 });
      expect({
        inputRealPath: count("fixtures/input.json", "realPath"),
        inputStat: count("fixtures/input.json", "stat"),
        stdoutRealPath: count("fixtures/stdout.txt", "realPath"),
        stdoutStat: count("fixtures/stdout.txt", "stat"),
      }).toEqual({ inputRealPath: 1, inputStat: 1, stdoutRealPath: 1, stdoutStat: 1 });
    }),
  );

  it.live("reads a later fixture's files live after the first fixture executes", () =>
    Effect.gen(function* () {
      const arranged = arrange({ fixtures: [fixture("one"), fixture("two")] });
      const { result, count } = yield* run(arranged);

      expect(succeeded(result).fixtures.map((entry) => entry.outcome)).toEqual([
        "passed",
        "passed",
      ]);
      // The content hash, each fixture's own read after the first, and the after-run hash.
      expect({
        input: count("fixtures/input.json", "readFile"),
        inputRealPath: count("fixtures/input.json", "realPath"),
        entrypointRealPath: count("src/hook.cjs", "realPath"),
      }).toEqual({ input: 3, inputRealPath: 2, entrypointRealPath: 2 });
    }),
  );

  const receiptHashCases = [
    {
      name: "a manifest that starts with a byte-order mark",
      manifestBytes: new Uint8Array([
        0xef,
        0xbb,
        0xbf,
        ...new TextEncoder().encode(JSON.stringify(manifest([fixture("one")]))),
      ]),
    },
    {
      name: "a manifest holding bytes that are not UTF-8",
      manifestBytes: (() => {
        const text = JSON.stringify(manifest([fixture("one")], { description: "marker" }));
        const bytes = new TextEncoder().encode(text);
        const at = text.indexOf("marker");
        bytes[at] = 0xff;
        return bytes;
      })(),
    },
  ];
  for (const row of receiptHashCases) {
    it.live(`records the package's own content hash for ${row.name}`, () =>
      Effect.gen(function* () {
        const arranged = arrange({ manifestBytes: row.manifestBytes });
        const { result, freshHash } = yield* run(arranged);
        const receipt = succeeded(result);
        expect(receipt.passed).toBe(true);
        expect(receipt.contentHash).toBe(freshHash);
      }),
    );
  }

  it.live("hashes a symlinked manifest as its link and feeds a symlinked input through it", () =>
    Effect.gen(function* () {
      const arranged = arrange({});
      nodeFs.mkdirSync(nodePath.join(arranged.root, "meta"));
      nodeFs.renameSync(
        nodePath.join(arranged.root, "hook.json"),
        nodePath.join(arranged.root, "meta/hook.json"),
      );
      nodeFs.symlinkSync("meta/hook.json", nodePath.join(arranged.root, "hook.json"));
      nodeFs.renameSync(
        nodePath.join(arranged.root, "fixtures/input.json"),
        nodePath.join(arranged.root, "fixtures/real-input.json"),
      );
      nodeFs.symlinkSync("real-input.json", nodePath.join(arranged.root, "fixtures/input.json"));

      const { result, freshHash, count } = yield* run(arranged);

      const receipt = succeeded(result);
      expect(receipt.passed).toBe(true);
      expect(receipt.contentHash).toBe(freshHash);
      // The undeclared link target is read for the fixture itself.
      expect(count("fixtures/real-input.json", "readFile")).toBe(3);
    }),
  );

  it.live("refuses unmatched fixture selection before hashing the package", () =>
    Effect.gen(function* () {
      const arranged = arrange({ fixtures: [] });
      const { result, count, hashes } = yield* run(arranged);

      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          detail: "No matching fixtures; declare fixtures in hook.json before running hooks test",
        },
      });
      expect(hashes).toBe(0);
      expect(count("hook.json", "readFile")).toBe(1);
      expect(count("fixtures/input.json", "readFile")).toBe(0);
    }),
  );

  it.live("refuses a manifest whose fixture names a missing binding before hashing", () =>
    Effect.gen(function* () {
      const arranged = arrange({ fixtures: [fixture("one", { binding: "absent" })] });
      const { result, count, hashes } = yield* run(arranged);

      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "ManifestError",
          code: "manifest_schema_invalid",
          detail: 'Manifest file "hook.json" does not conform to the hook manifest schema.',
        },
      });
      expect(hashes).toBe(0);
      expect(count("hook.json", "readFile")).toBe(1);
      expect(count("fixtures/input.json", "readFile")).toBe(0);
    }),
  );

  it.live("refuses a run whose hook rewrites its manifest", () =>
    Effect.gen(function* () {
      const arranged = arrange({
        script:
          'const fs = require("node:fs"); fs.appendFileSync("hook.json", " "); process.stdin.pipe(process.stdout);',
      });
      const { result } = yield* run(arranged);

      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          detail: "Hook execution changed package content; no current-content receipt was written",
        },
      });
    }),
  );
});
