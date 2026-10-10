import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { validateFilteredPackage } from "../index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "extensions/hooks/distribution-preserves-runtime-resources",
  title: "Distributed Hook extensions preserve all runtime resources",
  statement:
    "Filtering a Hook archive shall preserve every declared implementation entrypoint and shared asset, including unselected variants. Author-only fixture inputs and expectations may be omitted without preventing installation or native activation.",
  class: "functional",
  role: "interface",
  goals: ["trustworthy-distribution", "agent-interoperability"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const manifest = {
  identity: {
    type: "hook" as const,
    owner: handle("@acme"),
    name: extensionName("audit"),
    version: exactVersion("1.0.0"),
  },
  fileName: "hook.json",
  raw: {
    type: "hook",
    owner: "@acme",
    name: "audit",
    version: "1.0.0",
    implementations: [
      {
        id: "claude",
        protocol: "claude-code",
        bindings: [
          {
            id: "audit",
            event: "PostToolUse",
            handler: { type: "command", runtime: "node", entrypoint: "src/claude.mjs" },
          },
        ],
      },
      {
        id: "codex",
        protocol: "codex",
        bindings: [
          {
            id: "audit",
            event: "PostToolUse",
            handler: { type: "command", runtime: "node", entrypoint: "src/codex.mjs" },
          },
        ],
      },
    ],
    assets: ["src/shared.mjs"],
    fixtures: [
      {
        id: "audit",
        implementation: "claude",
        binding: "audit",
        input: "fixtures/input.json",
        expect: { exitCode: 0, stdout: "fixtures/stdout.json", stderr: "fixtures/stderr.txt" },
      },
    ],
  },
};
const files = [
  "hook.json",
  "src/claude.mjs",
  "src/codex.mjs",
  "src/shared.mjs",
  "fixtures/input.json",
  "fixtures/stdout.json",
  "fixtures/stderr.txt",
];
const validate = (names: ReadonlyArray<string>) =>
  validateFilteredPackage({
    type: "hook",
    manifest,
    entries: names.map((fileName) => ({
      fileName,
      compressedSize: 1,
      uncompressedSize: 1,
      compressionMethod: 0,
      externalAttributes: 0,
      localHeaderOffset: 0,
    })),
    readEntry: () => Effect.die("Hook closure validation must never read or execute bodies"),
  });

describe("Filtered Hook extension closure", () => {
  it.effect("accepts every referenced native implementation and asset without executing code", () =>
    validate(files),
  );
  it.effect("accepts intentionally omitted fixture resources", () =>
    validate(files.filter((file) => !file.startsWith("fixtures/"))),
  );
  it.effect.each(files.filter((file) => file.startsWith("src/")))(
    "rejects publish filtering that removes %s",
    (missing) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(validate(files.filter((file) => file !== missing)));
        expect(error.code).toBe("required_file_missing");
        expect(error.path).toBe(missing);
      }),
  );
});
