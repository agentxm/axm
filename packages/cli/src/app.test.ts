import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
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

describe("root command help", () => {
  it("exposes only the root version command and intention-revealing override flags", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
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
      ["axm uninstall", "break-dependencies"],
      ["axm skills uninstall", "break-dependencies"],
      ["axm mcps uninstall", "break-dependencies"],
      ["axm subagents uninstall", "break-dependencies"],
      ["axm hooks uninstall", "break-dependencies"],
      ["axm packs uninstall", "break-dependencies"],
      ["axm rules uninstall", "break-dependencies"],
      ["axm agents add", "accept-warnings"],
      ["axm agents remove", "accept-warnings"],
      ["axm mcps add", "accept-warnings"],
      ["axm packs add", "replace-existing"],
      ["axm packs remove", "allow-empty"],
    ];

    for (const [command, expectedFlag] of expectedFlags) {
      const doc = files.get(command);
      expect(doc, `missing help for ${command}`).toBeDefined();
      expect(
        doc?.flags.map((flag) => flag.name),
        command,
      ).toContain(expectedFlag);
    }
  });

  it("keeps every create and skill-copy surface create-only", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const createCommands = [
      "skills",
      "mcps",
      "subagents",
      "packs",
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

  it("keeps activation previewable without a generic force bypass", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
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
  });

  it("exposes only fail-closed publish controls", async () => {
    const files = await Effect.runPromise(collectHelpFiles());
    const retiredFlags = ["allow-older", "allow-unsafe-archive", "force", "skip-existing"];

    for (const [command, doc] of files) {
      if (command !== "axm publish" && !command.endsWith(" publish")) continue;
      const flags = doc.flags.map((flag) => flag.name);
      expect(flags, command).toContain("backfill");
      for (const retired of retiredFlags) {
        expect(flags, command).not.toContain(retired);
      }
      if (command === "axm packs publish") {
        expect(flags).toContain("include-dependencies");
        expect(flags).toContain("include-dependency");
      } else {
        expect(flags, command).not.toContain("include-dependencies");
        expect(flags, command).not.toContain("include-dependency");
      }
    }
  });

  it("enforces installed-state and project-only authoring scope contracts", async () => {
    const files = await Effect.runPromise(collectHelpFiles());

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
  });

  it("attaches a LEARN MORE footer pointing at entry-point help topics", async () => {
    const doc = await Effect.runPromise(captureHelpDoc([]));
    const learnMore = ServiceMap.get(doc.annotations, LearnMore);

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

  it("rejects retired publish bypasses and non-pack dependency flags during parsing", async () => {
    const invocations = [
      ["publish", "--allow-older"],
      ["publish", "--allow-unsafe-archive"],
      ["publish", "--force"],
      ["publish", "--skip-existing"],
      ["skills", "publish", "--include-dependencies"],
      ["skills", "publish", "--include-dependency", "@acme/skills/review"],
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
        `Unrecognized flag: ${invocation.at(-1)?.startsWith("--") === true ? invocation.at(-1) : invocation.at(-2)}`,
      );
    }

    await expect(
      run(["publish", "--on-existing", "skip", "--non-interactive"]),
    ).rejects.toMatchObject({ code: ExitCode.Usage });
  });

  it("rejects every retired global, version, and generic override spelling", async () => {
    const invocations: ReadonlyArray<{
      readonly args: ReadonlyArray<string>;
      readonly detail: string;
    }> = [
      { args: ["--wizard", "status"], detail: "Unrecognized flag: --wizard" },
      { args: ["-vv", "status"], detail: "Unrecognized flag: -vv" },
      { args: ["skills", "version"], detail: 'Unknown subcommand "version"' },
      { args: ["upgrade", "--force"], detail: "Unrecognized flag: --force" },
      { args: ["skills", "install", "--force"], detail: "Unrecognized flag: --force" },
    ];

    for (const invocation of invocations) {
      stdoutWrites.length = 0;
      stderrWrites.length = 0;
      consoleErrorWrites.length = 0;
      await expect(run([...invocation.args, "--non-interactive"])).rejects.toMatchObject({
        code: ExitCode.Usage,
      });
      expect(stdoutWrites).toEqual([]);
      expect([...stderrWrites, ...consoleErrorWrites].join("\n")).toContain(invocation.detail);
    }
  });

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
});
