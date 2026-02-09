import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import { detectFormatting, modifyJsonFile } from "./format-preserving-json.js";

// -----------------------------------------------------------------------------
// detectFormatting
// -----------------------------------------------------------------------------

describe("detectFormatting", () => {
  it("detects tab indentation", () => {
    const text = '{\n\t"key": "value"\n}';
    const result = detectFormatting(text);
    expect(result).toEqual({ tabSize: 1, insertSpaces: false, eol: "\n" });
  });

  it("detects 2-space indentation", () => {
    const text = '{\n  "key": "value"\n}';
    const result = detectFormatting(text);
    expect(result).toEqual({ tabSize: 2, insertSpaces: true, eol: "\n" });
  });

  it("detects 4-space indentation", () => {
    const text = '{\n    "key": "value"\n}';
    const result = detectFormatting(text);
    expect(result).toEqual({ tabSize: 4, insertSpaces: true, eol: "\n" });
  });

  it("detects CRLF line endings", () => {
    const text = '{\r\n  "key": "value"\r\n}';
    const result = detectFormatting(text);
    expect(result.eol).toBe("\r\n");
  });

  it("detects LF line endings", () => {
    const text = '{\n  "key": "value"\n}';
    const result = detectFormatting(text);
    expect(result.eol).toBe("\n");
  });

  it("falls back to defaults for empty string", () => {
    const result = detectFormatting("");
    expect(result).toEqual({ tabSize: 2, insertSpaces: true, eol: "\n" });
  });

  it("falls back to defaults for minimal file", () => {
    const result = detectFormatting("{}");
    expect(result).toEqual({ tabSize: 2, insertSpaces: true, eol: "\n" });
  });
});

// -----------------------------------------------------------------------------
// modifyJsonFile
// -----------------------------------------------------------------------------

describe("modifyJsonFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "format-preserving-json-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(NodeContext.layer));

  it.effect("edit property in tab-indented file preserves tabs", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "tabs.json");
        const original = '{\n\t"name": "old"\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["name"], value: "new" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).toBe('{\n\t"name": "new"\n}');
      }),
    ),
  );

  it.effect("edit property in 4-space-indented file preserves 4-space indent", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "four-space.json");
        const original = '{\n    "name": "old"\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["name"], value: "new" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).toBe('{\n    "name": "new"\n}');
      }),
    ),
  );

  it.effect("trailing newline preserved when present", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "trailing-newline.json");
        const original = '{\n  "name": "old"\n}\n';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["name"], value: "new" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result.endsWith("\n")).toBe(true);
        expect(result).toBe('{\n  "name": "new"\n}\n');
      }),
    ),
  );

  it.effect("no trailing newline preserved when absent", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "no-trailing.json");
        const original = '{\n  "name": "old"\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["name"], value: "new" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result.endsWith("}\n")).toBe(false);
        expect(result).toBe('{\n  "name": "new"\n}');
      }),
    ),
  );

  it.effect("insert matches existing style (tab indentation)", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "insert-tabs.json");
        const original = '{\n\t"existing": true\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["added"], value: "hello" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).toContain('\t"added": "hello"');
        // Should not contain space-based indentation for the new property
        expect(result).not.toMatch(/^ {2,}"added"/m);
      }),
    ),
  );

  it.effect("insert matches existing style (4-space indentation)", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "insert-four-space.json");
        const original = '{\n    "existing": true\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["added"], value: "hello" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).toContain('    "added": "hello"');
      }),
    ),
  );

  it.effect("insert matches existing style (CRLF line endings)", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "insert-crlf.json");
        const original = '{\r\n  "existing": true\r\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["added"], value: "hello" }]);

        const result = fs.readFileSync(filePath, "utf-8");
        // New content should use CRLF
        expect(result).toContain("\r\n");
        expect(result).toContain('"added": "hello"');
      }),
    ),
  );

  it.effect("multiple edits in single call", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "multi-edit.json");
        const original = '{\n  "a": 1,\n  "b": 2\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [
          { path: ["a"], value: 10 },
          { path: ["b"], value: 20 },
        ]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).toBe('{\n  "a": 10,\n  "b": 20\n}');
      }),
    ),
  );

  it.effect("remove property via undefined value", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "remove.json");
        const original = '{\n  "keep": true,\n  "remove": false\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["remove"], value: undefined }]);

        const result = fs.readFileSync(filePath, "utf-8");
        expect(result).not.toContain("remove");
        expect(result).toContain('"keep": true');
      }),
    ),
  );

  it.effect("remove last property from parent object", () =>
    withContext(
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "remove-last.json");
        const original = '{\n  "only": true\n}';
        fs.writeFileSync(filePath, original);

        yield* modifyJsonFile(filePath, [{ path: ["only"], value: undefined }]);

        const result = fs.readFileSync(filePath, "utf-8");
        // jsonc-parser preserves the newline between braces when removing the last property
        expect(result).toBe("{\n}");
      }),
    ),
  );
});
