import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import type { SkillLockEntry } from "../lockfile/schema.js";
import { lockEntryToSourceParams, printSourceParams } from "./printer.js";
import type { SourceParams } from "./types.js";

const makeSourceParams = (source: SourceParams): SourceParams => source;

const baseLockFields = {
  agents: Array<string>(),
  installedAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

const makeLockEntry = (entry: SkillLockEntry): SkillLockEntry => entry;

describe("printSourceParams", () => {
  it("prints github source", () => {
    const source = makeSourceParams({
      type: "github",
      owner: "acme",
      repo: "widgets",
      ref: Option.some("main"),
      subPath: Option.some("skills/foo"),
    });
    expect(printSourceParams(source)).toBe("github:acme/widgets/skills/foo@main");
  });

  it("prints gitlab source", () => {
    const source = makeSourceParams({
      type: "gitlab",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.none(),
    });
    expect(printSourceParams(source)).toBe("gitlab:acme/widgets");
  });

  it("prints bitbucket source", () => {
    const source = makeSourceParams({
      type: "bitbucket",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.some("tools"),
    });
    expect(printSourceParams(source)).toBe("bitbucket:acme/widgets/tools");
  });

  it("prints azurerepos source", () => {
    const source = makeSourceParams({
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.some("v1"),
      subPath: Option.some("skills/bar"),
    });
    expect(printSourceParams(source)).toBe("azurerepos:org/proj/repo/skills/bar@v1");
  });

  it("prints git source", () => {
    const source = makeSourceParams({
      type: "git",
      url: new URL("https://example.com/repo.git"),
      ref: Option.none(),
    });
    expect(printSourceParams(source)).toBe("https://example.com/repo.git");
  });

  it("prints local source", () => {
    const source = makeSourceParams({
      type: "local",
      path: "./skills/my-skill",
    });
    expect(printSourceParams(source)).toBe("./skills/my-skill");
  });

  it("prints registry source", () => {
    const source = makeSourceParams({
      type: "registry",
      owner: Option.none(),
    });
    expect(printSourceParams(source)).toBe("registry");
  });

  it("prints builtin source", () => {
    const source = makeSourceParams({
      type: "builtin",
    });
    expect(printSourceParams(source)).toBe("builtin");
  });
});

describe("lockEntryToSourceParams", () => {
  it("maps github lock entry with/without optional fields", () => {
    const withOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "github",
        owner: "acme",
        repo: "widgets",
        ref: "main",
        path: "skills/foo",
        ...baseLockFields,
      }),
    );
    expect(withOptional).toEqual({
      type: "github",
      owner: "acme",
      repo: "widgets",
      ref: Option.some("main"),
      subPath: Option.some("skills/foo"),
    });

    const withoutOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "github",
        owner: "acme",
        repo: "widgets",
        ...baseLockFields,
      }),
    );
    expect(withoutOptional).toEqual({
      type: "github",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.none(),
    });
  });

  it("maps gitlab lock entry with/without optional fields", () => {
    const withOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "gitlab",
        owner: "acme",
        repo: "widgets",
        ref: "main",
        path: "skills/foo",
        ...baseLockFields,
      }),
    );
    expect(withOptional).toEqual({
      type: "gitlab",
      owner: "acme",
      repo: "widgets",
      ref: Option.some("main"),
      subPath: Option.some("skills/foo"),
    });

    const withoutOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "gitlab",
        owner: "acme",
        repo: "widgets",
        ...baseLockFields,
      }),
    );
    expect(withoutOptional).toEqual({
      type: "gitlab",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.none(),
    });
  });

  it("maps bitbucket lock entry with/without optional fields", () => {
    const withOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "bitbucket",
        owner: "acme",
        repo: "widgets",
        ref: "main",
        path: "skills/foo",
        ...baseLockFields,
      }),
    );
    expect(withOptional).toEqual({
      type: "bitbucket",
      owner: "acme",
      repo: "widgets",
      ref: Option.some("main"),
      subPath: Option.some("skills/foo"),
    });

    const withoutOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "bitbucket",
        owner: "acme",
        repo: "widgets",
        ...baseLockFields,
      }),
    );
    expect(withoutOptional).toEqual({
      type: "bitbucket",
      owner: "acme",
      repo: "widgets",
      ref: Option.none(),
      subPath: Option.none(),
    });
  });

  it("maps azurerepos lock entry with/without optional fields", () => {
    const withOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "azurerepos",
        organization: "org",
        project: "proj",
        repo: "repo",
        ref: "main",
        path: "skills/foo",
        ...baseLockFields,
      }),
    );
    expect(withOptional).toEqual({
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.some("main"),
      subPath: Option.some("skills/foo"),
    });

    const withoutOptional = lockEntryToSourceParams(
      makeLockEntry({
        type: "azurerepos",
        organization: "org",
        project: "proj",
        repo: "repo",
        ...baseLockFields,
      }),
    );
    expect(withoutOptional).toEqual({
      type: "azurerepos",
      organization: "org",
      project: "proj",
      repo: "repo",
      ref: Option.none(),
      subPath: Option.none(),
    });
  });

  it("maps git lock entry and reconstructs URL", () => {
    const withRef = lockEntryToSourceParams(
      makeLockEntry({
        type: "git",
        url: "https://example.com/repo.git",
        ref: "main",
        ...baseLockFields,
      }),
    );
    expect(withRef).toEqual({
      type: "git",
      url: new URL("https://example.com/repo.git"),
      ref: Option.some("main"),
    });

    const withoutRef = lockEntryToSourceParams(
      makeLockEntry({
        type: "git",
        url: "https://example.com/repo.git",
        ...baseLockFields,
      }),
    );
    expect(withoutRef).toEqual({
      type: "git",
      url: new URL("https://example.com/repo.git"),
      ref: Option.none(),
    });
  });

  it("maps local lock entry", () => {
    const source = lockEntryToSourceParams(
      makeLockEntry({
        type: "local",
        path: "/tmp/skills/my-skill",
        ...baseLockFields,
      }),
    );
    expect(source).toEqual({
      type: "local",
      path: "/tmp/skills/my-skill",
    });
  });

  it("maps registry lock entry", () => {
    const source = lockEntryToSourceParams(
      makeLockEntry({
        type: "registry",
        owner: "@acme",
        name: "widgets",
        resolvedVersion: "1.0.0",
        integrity: "sha512-abc",
        sourceName: "default",
        ...baseLockFields,
      }),
    );
    expect(source).toEqual({
      type: "registry",
      owner: Option.none(),
    });
  });

  it("maps builtin lock entry", () => {
    const source = lockEntryToSourceParams(
      makeLockEntry({
        type: "builtin",
        ...baseLockFields,
      }),
    );
    expect(source).toEqual({
      type: "builtin",
    });
  });
});
