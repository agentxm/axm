import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as ServiceMap from "effect/Context";

import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { ExitCode } from "@agentxm/client-core/unstable/app-error";
import {
  EXTENSION_ONLY_TYPES,
  WORKSPACE_CAPABILITY_EXTENSION_TYPES,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";

import { run } from "./app.js";
import { captureHelpDoc, collectHelpFiles } from "./command-tree-test-helpers.js";
import { LearnMore } from "./formatter.js";

const groupCommandNames = (doc: HelpDoc, group: string): ReadonlyArray<string> =>
  (doc.subcommands ?? [])
    .filter((entry) => entry.group === group)
    .flatMap((entry) => entry.commands.map((command) => command.name));

class ExitCalled extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

describe("root command help", () => {
  it("keeps every create and skill-copy surface create-only", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const createCommands = [
      "skills",
      "commands",
      "mcps",
      "subagents",
      "packs",
      "files",
      "rules",
      "hooks",
      "knowledge",
    ].map((type) => `axm ${type} new`);

    for (const command of [...createCommands, "axm skills copy"]) {
      const doc = files.get(command);
      expect(doc, `missing help for ${command}`).toBeDefined();
      expect(
        doc?.flags.map((flag) => flag.name),
        command,
      ).not.toContain("force");
      expect(doc?.usage, command).not.toContain("--force");
    }
  });

  it("attaches a LEARN MORE footer pointing at entry-point help topics", async () => {
    const doc = await Effect.runPromise(captureHelpDoc([]));
    const learnMore = ServiceMap.getReferenceUnsafe(doc.annotations, LearnMore);

    expect(learnMore).toContain("LEARN MORE");
    expect(learnMore).toContain("axm help getting-started");
    expect(learnMore).toContain("axm help basic-usage");
    expect(learnMore).toContain("axm help skills");
    expect(learnMore).toContain("axm help ");
    expect(learnMore).toContain("Browse all help topics");
  });

  it("uses executable examples across the full command tree", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const entries = Array.from(files.entries());
    const missingExamples = entries
      .filter(([, doc]) => (doc.examples ?? []).length === 0)
      .map(([command]) => command);
    const invalidExamples = entries.flatMap(([command, doc]) =>
      (doc.examples ?? []).flatMap((example) => {
        const description = example.description ?? "";
        return example.command.trim().length === 0 || description.startsWith("See also:")
          ? [`${command}: ${description}`]
          : [];
      }),
    );

    expect(missingExamples).toEqual([]);
    expect(invalidExamples).toEqual([]);
  });

  it("opens the EXTENSIONS group with the catalog's extension-only types, in table order", async () => {
    const doc = await Effect.runPromise(captureHelpDoc([]));
    const extensions = groupCommandNames(doc, "EXTENSIONS");
    const expected = EXTENSION_ONLY_TYPES.map(toExtensionTypePlural);

    expect(extensions.slice(0, expected.length)).toEqual(expected);
  });

  it("lists workspace-capability types under WORKSPACE rather than EXTENSIONS", async () => {
    const doc = await Effect.runPromise(captureHelpDoc([]));
    const workspace = groupCommandNames(doc, "WORKSPACE");
    const extensions = groupCommandNames(doc, "EXTENSIONS");
    const expected = WORKSPACE_CAPABILITY_EXTENSION_TYPES.map(toExtensionTypePlural);

    expect(expected.filter((plural) => !workspace.includes(plural))).toEqual([]);
    expect(expected.filter((plural) => extensions.includes(plural))).toEqual([]);
  });

  it("does not expose the retired maintainer command", async () => {
    const files = await Effect.runPromise(collectHelpFiles());

    expect(files.has("axm maintainer")).toBe(false);
  });
});

describe("root command parser output", () => {
  let stdoutWrites: Array<string>;
  let stderrWrites: Array<string>;
  let consoleErrorWrites: Array<string>;

  beforeEach(() => {
    stdoutWrites = [];
    stderrWrites = [];
    consoleErrorWrites = [];
    vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
      stdoutWrites.push(String(args[0]));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((...args: Array<unknown>) => {
      stderrWrites.push(String(args[0]));
      return true;
    });
    vi.spyOn(console, "error").mockImplementation((...args: ReadonlyArray<unknown>) => {
      consoleErrorWrites.push(args.map(String).join(" "));
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitCalled(typeof code === "number" ? code : 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an unknown flag with exit 2 across every registered command", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const unknownFlag = "--definitely-unknown";

    for (const command of files.keys()) {
      stdoutWrites.length = 0;
      stderrWrites.length = 0;
      consoleErrorWrites.length = 0;
      const commandArgs = command.split(" ").slice(1);

      await expect(
        run([...commandArgs, unknownFlag, "--non-interactive"]),
        command,
      ).rejects.toMatchObject({
        code: ExitCode.Usage,
      });
      expect(stdoutWrites, command).toEqual([]);
      expect([...stderrWrites, ...consoleErrorWrites].join("\n"), command).toContain(
        `Unrecognized flag: ${unknownFlag}`,
      );
    }
  });

  it("emits one JSON usage envelope for missing required flags", async () => {
    await expect(run(["token", "create", "--json"])).rejects.toMatchObject({
      code: ExitCode.Usage,
    });

    expect(stdoutWrites).toHaveLength(1);
    const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
    expect(stdoutDoc).toMatchObject({
      ok: false,
      code: "usage",
      title: "Usage Error",
      detail: "Missing required flag: --name",
    });
    expect(stdoutWrites.join("")).not.toContain('"type":"help"');
  });
});
