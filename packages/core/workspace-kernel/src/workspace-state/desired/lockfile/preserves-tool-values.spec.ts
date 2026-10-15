import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  commitLockfileSnapshotUpdateAtPath,
  commitLockfileUpdates,
  LockfileSchema,
  parseLockfileToml,
  writeLockfileAtPath,
} from "../../index.js";
import { WorkspaceFileWriteLocksLive } from "../../../settlement/live.js";

export const specification = defineSpecification({
  requirement: "workspace/lockfile/preserves-tool-values",
  title: "Lockfile writes preserve tool-owned TOML values and their kinds",
  statement:
    "Every successful AXM lockfile write shall preserve the latest tool namespaces, scalar kinds, signed 64-bit integer values, binary64 float values including negative zero, temporal kinds and fractional precision, keys, empty containers, and array order. Invalid or unrepresentable prior tool values shall fail before replacement, never authorize dropping tool data. Tool values shall not influence accepted resolution.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Actual locked filesystem writes establish preservation and refusal without replacement.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const platform = WorkspaceFileWriteLocksLive.pipe(Layer.provideMerge(NodeServices.layer));
const empty = Schema.decodeUnknownSync(LockfileSchema)({ version: 1 });
const next = Schema.decodeUnknownSync(LockfileSchema)({
  version: 1,
  package: [
    {
      id: "_local/project/review",
      source: { path: "review", format: "native" },
      tree: `sha256-tree-v2:${"0".repeat(64)}`,
    },
  ],
  skills: { review: { package: "_local/project/review", name: "review" } },
});
const expected = [
  "integer = 2",
  "whole = 2.0",
  "zero = -0.0",
  "fraction = 0.1",
  "minimum = -9223372036854775808",
  "maximum = 9223372036854775807",
  "hex = 9223372036854775807",
  "nothing = nan",
  "positive = inf",
  "negative = -inf",
  "day = 2026-10-15",
  "micro = 2026-10-15T06:30:00.123456Z",
  "nano = 2026-10-15T06:30:00.123456789+02:30",
  "beyond = 2026-10-15T06:30:00.123456789123456789+02:30",
  "local = 2026-10-15T06:30:00.123456",
  "clock = 06:30:00.123456789123456789",
  "leap = 2016-12-31T23:59:60Z",
  'text = "2026-10-15"',
  "flag = true",
  'tag = { _tag = "integer", value = "0" }',
  'mixed = [2, 2.0, -0.0, "two", true, []]',
  "empty = {}",
  "constructor = 7",
];
const prior = [
  "version = 1",
  "[tool.__proto__]",
  ...expected.map((line) => (line.startsWith("hex =") ? "hex = 0x7fff_ffff_ffff_ffff" : line)),
  "[tool.empty]",
  "[[tool.rows.items]]",
  'name = "first"',
  "[tool.rows.items.details]",
  "amount = 9223372036854775807",
  "[[tool.rows.items]]",
  'name = "second"',
  "",
].join("\n");

describe("tool-owned lockfile values", () => {
  it.effect("retains an explicitly empty tool root through replacement", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "axm.lock");
      yield* fs.writeFileString(target, "version = 1\n[tool]\n");
      yield* writeLockfileAtPath(target, next);
      expect(parseLockfileToml(yield* fs.readFileString(target)).tool).toEqual(new Map());
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  for (const mode of ["replacement", "delta", "snapshot", "projection"] as const) {
    it.effect(`preserves scalar fidelity and namespaces through a ${mode} write`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const target = path.join(root, "axm.lock");
        yield* fs.writeFileString(target, prior);
        if (mode === "replacement") yield* writeLockfileAtPath(target, next);
        else if (mode === "delta") yield* commitLockfileUpdates(root, empty, [() => next]);
        else if (mode === "snapshot")
          yield* commitLockfileSnapshotUpdateAtPath(target, empty, next);
        else {
          const projected = Schema.decodeUnknownSync(LockfileSchema)({
            version: 1,
            projections: {
              rules: {
                contract: 1,
                units: {
                  "AGENTS.md": { output: `sha256:${"a".repeat(64)}` },
                },
              },
            },
          });
          yield* commitLockfileSnapshotUpdateAtPath(target, empty, projected);
        }
        const written = yield* fs.readFileString(target);
        for (const line of expected) expect(written).toContain(`${line}\n`);
        expect(written).toContain("[tool.__proto__]\n");
        expect(written).toContain("[tool.empty]\n");
        const decoded = parseLockfileToml(written);
        expect(decoded.document).not.toHaveProperty("tool");
        expect(decoded.tool).toEqual(parseLockfileToml(prior).tool);
        const accepted = Schema.decodeUnknownSync(LockfileSchema)(decoded.document);
        yield* writeLockfileAtPath(target, accepted);
        expect(yield* fs.readFileString(target)).toBe(written);
      }).pipe(Effect.scoped, Effect.provide(platform)),
    );
  }

  it.effect.each([
    "value = 9223372036854775808",
    "value = -9223372036854775809",
    "value = 2026-02-30",
    "value = 24:00:00",
    "value = 1e999",
    "value = 1e-999",
    "value = [",
  ])("refuses an invalid prior tool value without overwriting it: %s", (value) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "axm.lock");
      const raw = `version = 1\n[tool.other]\n${value}\n`;
      yield* fs.writeFileString(target, raw);
      const failure = yield* writeLockfileAtPath(target, next).pipe(Effect.flip);
      expect(failure._tag).toBe("LockfileWriteError");
      expect(yield* fs.readFileString(target)).toBe(raw);
    }).pipe(Effect.scoped, Effect.provide(platform)),
  );

  it("resolves quoted/dotted names and array-table parents without collisions", () => {
    const parsed = parseLockfileToml(`version = 1
tool."a.b".nested = [{ date = 2026-10-15, x = 2.0 }, {}]
[[tool.other.rows]]
name = "first"
[tool.other.rows.details]
amount = 9223372036854775807
[[tool.other.rows]]
name = "second"
`);
    expect(parsed.tool?.get("a.b")?.entries.get("nested")).toMatchObject({
      kind: "array",
      values: [
        {
          kind: "table",
          entries: new Map<string, unknown>([
            ["date", { kind: "local-date", value: "2026-10-15" }],
            ["x", { kind: "float", value: "2.0" }],
          ]),
        },
        { kind: "table", entries: new Map<string, unknown>() },
      ],
    });
    expect(parsed.tool?.get("other")?.entries.get("rows")).toMatchObject({
      kind: "array",
      values: [
        {
          kind: "table",
          entries: new Map<string, unknown>([
            ["name", { kind: "string", value: "first" }],
            [
              "details",
              {
                kind: "table",
                entries: new Map<string, unknown>([
                  ["amount", { kind: "integer", value: "9223372036854775807" }],
                ]),
              },
            ],
          ]),
        },
        {
          kind: "table",
          entries: new Map<string, unknown>([["name", { kind: "string", value: "second" }]]),
        },
      ],
    });
  });

  it.each(["version = 1.0", "version = 9007199254740993", "tool = 3", "[tool]\nother = []"])(
    "refuses invalid owned values or namespace shape: %s",
    (raw) => {
      expect(() => parseLockfileToml(raw)).toThrow();
    },
  );
});
