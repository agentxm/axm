import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as ServiceMap from "effect/Context";

import type { HelpDoc } from "effect/unstable/cli/HelpDoc";

import { ExitCode } from "@agentxm/client-core/unstable/app-error";
import {
  EXTENSION_ONLY_TYPES,
  WORKSPACE_CAPABILITY_EXTENSION_TYPES,
  extensionTypes,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";

import { run } from "./app.js";
import { captureHelpDoc, collectHelpFiles } from "./command-tree-test-helpers.js";
import { LearnMore } from "./formatter.js";
import {
  INSTALLED_STATE_SCOPE_COMMANDS,
  PROJECT_ONLY_AUTHORING_COMMANDS,
} from "./root/scope-contract.js";

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

class UnexpectedCliRunFailure extends Data.TaggedError("UnexpectedCliRunFailure")<{
  readonly cause: unknown;
}> {}

describe("root command help", () => {
  it.effect("exposes only the root version command and intention-revealing override flags", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const versionCommands = Array.from(files.keys()).filter((command) =>
        command.endsWith(" version"),
      );
      expect(versionCommands).toEqual(["axm version"]);

      for (const [command, doc] of files) {
        const flags = doc.flags.map((flag) => flag.name);
        expect(flags, command).not.toContain("force");
        expect(flags, command).not.toContain("wizard");
      }

      const expectedFlags: ReadonlyArray<readonly [string, string]> = [
        ["axm install", "reinstall"],
        ["axm skills install", "reinstall"],
        ["axm mcps install", "reinstall"],
        ["axm subagents install", "reinstall"],
        ["axm hooks install", "reinstall"],
        ["axm packs install", "reinstall"],
        ["axm rules install", "reinstall"],
        ["axm update", "refresh"],
        ["axm mcps update", "refresh"],
        ["axm skills update", "ignore-version-constraints"],
        ["axm subagents update", "ignore-version-constraints"],
        ["axm agents add", "accept-warnings"],
        ["axm agents remove", "accept-warnings"],
        ["axm mcps add", "accept-warnings"],
      ];

      for (const [command, expectedFlag] of expectedFlags) {
        const doc = files.get(command);
        expect(doc, `missing help for ${command}`).toBeDefined();
        expect(
          doc?.flags.map((flag) => flag.name),
          command,
        ).toContain(expectedFlag);
      }
    }),
  );

  it.effect("keeps every create surface create-only", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const createCommands = [
        "skills",
        "mcps",
        "subagents",
        "packs",
        "rules",
        "hooks",
        "knowledge",
      ].map((type) => `axm ${type} new`);

      for (const command of createCommands) {
        const doc = files.get(command);
        expect(doc, `missing help for ${command}`).toBeDefined();
        expect(
          doc?.flags.map((flag) => flag.name),
          command,
        ).not.toContain("force");
        expect(doc?.usage, command).not.toContain("--force");
      }
    }),
  );

  it.effect("keeps activation previewable without a generic force bypass", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const type of extensionTypes) {
        for (const verb of ["enable", "disable"] as const) {
          const command = `axm ${toExtensionTypePlural(type)} ${verb}`;
          const doc = files.get(command);
          expect(doc, `missing help for ${command}`).toBeDefined();
          const flags = doc?.flags.map((flag) => flag.name) ?? [];
          expect(flags, command).toContain("preview");
          expect(flags, command).not.toContain("force");
        }
      }
    }),
  );

  it.effect("keeps hook inspection on show without a global portability command", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(files.has("axm hooks show")).toBe(true);
      expect(files.has("axm hooks info")).toBe(false);
    }),
  );

  it.effect("exposes native import only for skills and subagents", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(files.has("axm import")).toBe(false);
      expect(files.has("axm skills import")).toBe(true);
      expect(files.has("axm subagents import")).toBe(true);
      for (const group of ["rules", "knowledge", "hooks", "packs"] as const) {
        expect(files.has(`axm ${group} import`), group).toBe(false);
      }
    }),
  );

  it.effect("exposes authentication only through root commands", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      expect(files.has("axm auth")).toBe(false);
      for (const command of ["login", "logout", "whoami", "token"] as const) {
        expect(files.has(`axm ${command}`), command).toBe(true);
        expect(files.has(`axm auth ${command}`), command).toBe(false);
      }
      for (const command of ["create", "list", "revoke"] as const) {
        expect(files.has(`axm token ${command}`), command).toBe(true);
        expect(files.has(`axm auth token ${command}`), command).toBe(false);
      }
    }),
  );

  it.effect("exposes only fail-closed publish controls", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const [command, doc] of files) {
        if (command !== "axm publish" && !command.endsWith(" publish")) continue;
        const flags = doc.flags.map((flag) => flag.name);
        expect(flags, command).toContain("backfill");
        if (command === "axm publish" || command === "axm packs publish") {
          expect(flags).toContain("include-dependencies");
          expect(flags).toContain("include-dependency");
        } else {
          expect(flags, command).not.toContain("include-dependencies");
          expect(flags, command).not.toContain("include-dependency");
        }
      }
    }),
  );

  it.effect("enforces installed-state and project-only authoring scope contracts", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();

      for (const command of INSTALLED_STATE_SCOPE_COMMANDS) {
        const doc = files.get(command);
        expect(doc, `missing help for ${command}`).toBeDefined();
        expect(
          doc?.flags.map((flag) => flag.name),
          command,
        ).toContain("scope");
      }

      for (const command of PROJECT_ONLY_AUTHORING_COMMANDS) {
        const doc = files.get(command);
        expect(doc, `missing help for ${command}`).toBeDefined();
        expect(
          doc?.flags.map((flag) => flag.name),
          command,
        ).not.toContain("scope");
        expect(doc?.description.toLowerCase(), command).toContain("project-workspace");
      }
    }),
  );

  it.effect("attaches a LEARN MORE footer pointing at entry-point help topics", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc([]);
      const learnMore = ServiceMap.get(doc.annotations, LearnMore);

      expect(learnMore).toContain("LEARN MORE");
      expect(learnMore).toContain("axm help getting-started");
      expect(learnMore).toContain("axm help basic-usage");
      expect(learnMore).toContain("axm help skills");
      expect(learnMore).toContain("axm help ");
      expect(learnMore).toContain("Browse all help topics");
    }),
  );

  it.effect("uses executable examples across the full command tree", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
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
    }),
  );

  it.effect(
    "opens the EXTENSIONS group with the catalog's extension-only types, in table order",
    () =>
      Effect.gen(function* () {
        const doc = yield* captureHelpDoc([]);
        const extensions = groupCommandNames(doc, "EXTENSIONS");
        const expected = EXTENSION_ONLY_TYPES.map(toExtensionTypePlural);

        expect(extensions.slice(0, expected.length)).toEqual(expected);
      }),
  );

  it.effect("lists workspace-capability types under WORKSPACE rather than EXTENSIONS", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc([]);
      const workspace = groupCommandNames(doc, "WORKSPACE");
      const extensions = groupCommandNames(doc, "EXTENSIONS");
      const expected = WORKSPACE_CAPABILITY_EXTENSION_TYPES.map(toExtensionTypePlural);

      expect(expected.filter((plural) => !workspace.includes(plural))).toEqual([]);
      expect(expected.filter((plural) => extensions.includes(plural))).toEqual([]);
    }),
  );
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
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((...args: Array<unknown>) => {
      stderrWrites.push(String(args[0]));
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
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

  it.effect("rejects an unknown flag with exit 2 across every registered command", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const unknownFlag = "--definitely-unknown";

      for (const command of files.keys()) {
        stdoutWrites.length = 0;
        stderrWrites.length = 0;
        consoleErrorWrites.length = 0;
        const commandArgs = command.split(" ").slice(1);

        const error = yield* Effect.tryPromise({
          try: () => run([...commandArgs, unknownFlag, "--non-interactive"]),
          catch: (cause) =>
            cause instanceof ExitCalled ? cause : new UnexpectedCliRunFailure({ cause }),
        }).pipe(Effect.flip);
        expect(error, command).toMatchObject({
          code: ExitCode.Usage,
        });
        expect(stdoutWrites, command).toEqual([]);
        expect([...stderrWrites, ...consoleErrorWrites].join("\n"), command).toContain(
          `Unrecognized flag: ${unknownFlag}`,
        );
      }
    }),
  );

  it("rejects user scope on project-only authoring commands during parsing", async () => {
    const invocations = [
      ["publish", "--scope", "user"],
      ["skills", "copy", "./source", "@acme/skills/copied", "--scope", "user"],
      ["adopt", "@acme/skills/review", "--scope", "user"],
      ["demote", "@acme/skills/review", "@acme/skills/review", "--scope", "user"],
      ["skills", "new", "review", "--scope", "user"],
      ["version", "@acme/skills/review", "patch", "--scope", "user"],
    ];

    for (const invocation of invocations) {
      stdoutWrites.length = 0;
      stderrWrites.length = 0;
      consoleErrorWrites.length = 0;
      await expect(run([...invocation, "--non-interactive"])).rejects.toMatchObject({
        code: ExitCode.Usage,
      });
      expect(stdoutWrites).toEqual([]);
      expect([...stderrWrites, ...consoleErrorWrites].join("\n")).toContain(
        "Unrecognized flag: --scope",
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

  it("keeps the host working directory unchanged across invocation paths", async () => {
    const originalCwd = process.cwd();
    const successDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-app-cwd-success-"));
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-app-cwd-failure-"));
    try {
      await run([
        "-C",
        successDir,
        "setup",
        "--yes",
        "--scope",
        "project",
        "--agent",
        "claude-code",
        "--non-interactive",
        "--json",
      ]);
      expect(process.cwd()).toBe(originalCwd);

      await expect(
        run(["-C", failureDir, "lint", "--non-interactive", "--json"]),
      ).rejects.toBeInstanceOf(ExitCalled);
      expect(process.cwd()).toBe(originalCwd);

      await run(["-C", successDir, "--help"]);
      expect(process.cwd()).toBe(originalCwd);
    } finally {
      fs.rmSync(successDir, { recursive: true, force: true });
      fs.rmSync(failureDir, { recursive: true, force: true });
    }
  });
});
