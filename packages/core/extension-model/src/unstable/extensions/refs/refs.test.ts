/**
 * Tests for extension ref types.
 *
 * Verifies discriminator-based narrowing and type contracts for ref detail
 * interfaces and the per-type extension refs.
 */

import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { GitHostedRefDetails, LocalRefDetails, RegistryRefDetails } from "./ref-base.js";
import type { ExtensionRef } from "./extension-ref.js";
import type { SkillExtensionRef } from "./skill.js";
import type { McpServerExtensionRef } from "./mcp-server.js";
import type { PackRef } from "./pack.js";
import { extensionName, exactVersion, handle } from "../../test-helpers.js";

// -----------------------------------------------------------------------------
// Ref detail interfaces
// -----------------------------------------------------------------------------

describe("ref detail interfaces", () => {
  it("GitHostedRefDetails has location and gitTreeSha", () => {
    const details: GitHostedRefDetails = {
      owner: handle("@acme"),
      name: extensionName("test"),
      location: "file:///tmp/clone",
      gitTreeSha: "abc123",
      gitCommitSha: "commit123",
    };
    expect(details.location).toBe("file:///tmp/clone");
    expect(details.gitTreeSha).toBe("abc123");
  });

  it("RegistryRefDetails has owner, name, version, and integrity", () => {
    const details: RegistryRefDetails = {
      owner: handle("@acme"),
      publisherBindingId: "hbnd_test",
      name: extensionName("my-skill"),
      version: exactVersion("1.2.3"),
      integrity: Option.some("sha512-abc=="),
      packages: [],
    };
    expect(details.owner).toBe("@acme");
    expect(details.name).toBe("my-skill");
    expect(details.version).toBe("1.2.3");
    expect(details.integrity).toEqual(Option.some("sha512-abc=="));
  });

  it("LocalRefDetails has location", () => {
    const details: LocalRefDetails = {
      owner: handle("@acme"),
      name: extensionName("test"),
      location: "file:///home/user/skill",
    };
    expect(details.location).toBe("file:///home/user/skill");
  });
});

// -----------------------------------------------------------------------------
// SkillExtensionRef
// -----------------------------------------------------------------------------

describe("SkillExtensionRef", () => {
  it("GitHostedSkillRef narrows via refType", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "git-hosted",
      owner: handle("@acme"),
      name: extensionName("test"),
      skill: {
        name: extensionName("test"),
        description: Option.some("desc"),
        metadata: Option.none(),
      },
      source: {
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "o",
        repo: "r",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: "sha1",
      gitCommitSha: "commit1",
    };
    if (ref.refType === "git-hosted") {
      expect(ref.location).toBe("file:///tmp/clone");
      expect(ref.gitTreeSha).toBe("sha1");
      if (ref.source.type === "github") {
        expect(ref.source.owner).toBe("o");
      }
    }
  });

  it("RegistrySkillRef carries version and integrity via refType narrowing", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      skill: { name: extensionName("test"), description: Option.none(), metadata: Option.none() },
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///reg"),
        owner: Option.none(),
      },
      owner: handle("@acme"),
      name: extensionName("test-pkg"),
      version: exactVersion("1.0.0"),
      integrity: Option.some("sha512-abc"),
      packages: [],
    };
    if (ref.refType === "registry") {
      expect(ref.version).toBe("1.0.0");
      expect(ref.integrity).toEqual(Option.some("sha512-abc"));
      expect(ref.name).toBe("test-pkg");
      expect(ref.owner).toBe("@acme");
    }
  });

  it("LocalSkillRef carries location via refType narrowing", () => {
    const ref: SkillExtensionRef = {
      type: "skill",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("test"),
      skill: {
        name: extensionName("test"),
        description: Option.some("desc"),
        metadata: Option.none(),
      },
      source: { type: "local", path: "/home/user/skill" },
      location: "file:///home/user/skill",
    };
    if (ref.refType === "local") {
      expect(ref.location).toBe("file:///home/user/skill");
    }
  });

  it("skill.description is Option<string>", () => {
    const withDesc: SkillExtensionRef = {
      type: "skill",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("s"),
      skill: {
        name: extensionName("s"),
        description: Option.some("hello"),
        metadata: Option.none(),
      },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    const withoutDesc: SkillExtensionRef = {
      type: "skill",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("s"),
      skill: { name: extensionName("s"), description: Option.none(), metadata: Option.none() },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    expect(Option.getOrNull(withDesc.skill.description)).toBe("hello");
    expect(Option.getOrNull(withoutDesc.skill.description)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// McpServerExtensionRef
// -----------------------------------------------------------------------------

describe("McpServerExtensionRef", () => {
  it("GitHostedMcpServerRef narrows via refType", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      refType: "git-hosted",
      owner: handle("@acme"),
      name: extensionName("my-server"),
      server: { name: extensionName("my-server") },
      source: {
        type: "github",
        name: "github",
        url: new URL("https://github.com"),
        owner: "o",
        repo: "r",
        ref: Option.none(),
        subPath: Option.none(),
      },
      location: "file:///tmp/clone",
      gitTreeSha: "tree1",
      gitCommitSha: "commit1",
    };
    if (ref.refType === "git-hosted") {
      expect(ref.location).toBe("file:///tmp/clone");
    }
  });

  it("RegistryMcpServerRef carries version and integrity via refType narrowing", () => {
    const ref: McpServerExtensionRef = {
      type: "mcp-server",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      server: { name: extensionName("my-server") },
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///reg"),
        owner: Option.none(),
      },
      owner: handle("@acme"),
      name: extensionName("server-pkg"),
      version: exactVersion("2.0.0"),
      integrity: Option.some("sha512-def"),
      packages: [],
    };
    if (ref.refType === "registry") {
      expect(ref.version).toBe("2.0.0");
      expect(ref.name).toBe("server-pkg");
    }
  });
});

// -----------------------------------------------------------------------------
// PackRef
// -----------------------------------------------------------------------------

describe("PackRef", () => {
  it("RegistryPackRef carries version and integrity via refType narrowing", () => {
    const ref: PackRef = {
      type: "pack",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      pack: {
        name: extensionName("my-pack"),
        dependencies: {},
      },
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///reg"),
        owner: Option.none(),
      },
      owner: handle("@acme"),
      name: extensionName("pack-pkg"),
      version: exactVersion("1.0.0"),
      integrity: Option.some("sha512-ghi"),
      packages: [],
    };
    if (ref.refType === "registry") {
      expect(ref.version).toBe("1.0.0");
      expect(ref.name).toBe("pack-pkg");
    }
  });
});

// -----------------------------------------------------------------------------
// ExtensionRef union
// -----------------------------------------------------------------------------

describe("ExtensionRef", () => {
  it("narrows to SkillExtensionRef via type", () => {
    const ref: ExtensionRef = {
      type: "skill",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("test"),
      skill: {
        name: extensionName("test"),
        description: Option.some("desc"),
        metadata: Option.none(),
      },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    if (ref.type === "skill") {
      expect(ref.skill.name).toBe("test");
    }
  });

  it("narrows to McpServerExtensionRef via type", () => {
    const ref: ExtensionRef = {
      type: "mcp-server",
      refType: "local",
      owner: handle("@acme"),
      name: extensionName("srv"),
      server: { name: extensionName("srv") },
      source: { type: "local", path: "/test" },
      location: "file:///test",
    };
    if (ref.type === "mcp-server") {
      expect(ref.server.name).toBe("srv");
    }
  });

  it("narrows to PackRef via type", () => {
    const ref: ExtensionRef = {
      type: "pack",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      owner: handle("@axm"),
      pack: { name: extensionName("p"), dependencies: {} },
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///reg"),
        owner: Option.none(),
      },
      name: extensionName("p"),
      version: exactVersion("1.0.0"),
      integrity: Option.none(),
      packages: [],
    };
    if (ref.type === "pack") {
      expect(ref.pack.name).toBe("p");
    }
  });

  it("narrows on refType to access ref details", () => {
    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",

      publisherBindingId: "hbnd_test",
      skill: { name: extensionName("s"), description: Option.none(), metadata: Option.none() },
      source: {
        type: "registry",
        name: "agentxm",
        location: new URL("file:///reg"),
        owner: Option.none(),
      },
      owner: handle("@acme"),
      name: extensionName("pkg"),
      version: exactVersion("1.0.0"),
      integrity: Option.some("sha512-abc"),
      packages: [],
    };
    if (ref.refType === "registry") {
      expect(ref.owner).toBe("@acme");
      expect(ref.version).toBe("1.0.0");
    }
  });
});
