import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  detectFormatting,
  ensureTopLevelProperty,
  modifyJsonFile,
} from "./format-preserving-json.js";

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
// ensureTopLevelProperty
// -----------------------------------------------------------------------------

describe("ensureTopLevelProperty", () => {
  const fmt2 = { tabSize: 2, insertSpaces: true, eol: "\n" } as const;
  const fmtTab = { tabSize: 1, insertSpaces: false, eol: "\n" } as const;

  it("inserts property without reformatting compact siblings", () => {
    const text = '{\n  "agents": ["antigravity", "claude-code", "codex", "cursor"]\n}\n';
    const result = ensureTopLevelProperty(text, "skills", {}, fmt2);
    expect(result).toBe(
      '{\n  "agents": ["antigravity", "claude-code", "codex", "cursor"],\n  "skills": {}\n}\n',
    );
  });

  it("no-op when property already exists", () => {
    const text = '{\n  "agents": ["a"],\n  "skills": {}\n}\n';
    const result = ensureTopLevelProperty(text, "skills", {}, fmt2);
    expect(result).toBe(text);
  });

  it("inserts into empty object", () => {
    const text = "{}\n";
    const result = ensureTopLevelProperty(text, "skills", {}, fmt2);
    expect(result).toBe('{\n  "skills": {}\n}\n');
  });

  it("uses tab indentation when detected", () => {
    const text = '{\n\t"agents": ["a"]\n}\n';
    const result = ensureTopLevelProperty(text, "skills", {}, fmtTab);
    expect(result).toBe('{\n\t"agents": ["a"],\n\t"skills": {}\n}\n');
  });

  it("preserves CRLF line endings", () => {
    const text = '{\r\n  "agents": ["a"]\r\n}\r\n';
    const fmtCrlf = { tabSize: 2, insertSpaces: true, eol: "\r\n" } as const;
    const result = ensureTopLevelProperty(text, "skills", {}, fmtCrlf);
    expect(result).toBe('{\r\n  "agents": ["a"],\r\n  "skills": {}\r\n}\r\n');
  });
});

// -----------------------------------------------------------------------------
// ensureTopLevelProperty with keyOrder
// -----------------------------------------------------------------------------

describe("ensureTopLevelProperty with keyOrder", () => {
  const fmt2 = { tabSize: 2, insertSpaces: true, eol: "\n" } as const;
  const order = ["scope", "sources", "agents", "skills", "commands", "packs", "mcp-servers"];

  it("inserts before the first property that comes later in key order", () => {
    // "agents" exists, inserting "skills" should go after "agents" (append)
    // but inserting "sources" should go before "agents"
    const text = '{\n  "agents": ["a"]\n}\n';
    const result = ensureTopLevelProperty(text, "sources", [], fmt2, order);
    expect(result).toBe('{\n  "sources": [],\n  "agents": ["a"]\n}\n');
  });

  it("appends at end when new key comes after all existing keys", () => {
    const text = '{\n  "scope": "@acme",\n  "agents": ["a"]\n}\n';
    const result = ensureTopLevelProperty(text, "skills", {}, fmt2, order);
    expect(result).toBe('{\n  "scope": "@acme",\n  "agents": ["a"],\n  "skills": {}\n}\n');
  });

  it("inserts in the middle between existing keys", () => {
    const text = '{\n  "scope": "@acme",\n  "skills": {}\n}\n';
    const result = ensureTopLevelProperty(text, "agents", [], fmt2, order);
    expect(result).toBe('{\n  "scope": "@acme",\n  "agents": [],\n  "skills": {}\n}\n');
  });

  it("falls back to append when keyOrder is not provided", () => {
    const text = '{\n  "agents": ["a"]\n}\n';
    const result = ensureTopLevelProperty(text, "skills", {}, fmt2);
    expect(result).toBe('{\n  "agents": ["a"],\n  "skills": {}\n}\n');
  });

  it("falls back to append when key is not in keyOrder", () => {
    const text = '{\n  "agents": ["a"]\n}\n';
    const result = ensureTopLevelProperty(text, "custom", "val", fmt2, order);
    expect(result).toBe('{\n  "agents": ["a"],\n  "custom": "val"\n}\n');
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
