import { describe, expect, it } from "vitest";
import { evaluateSourceAuthority, type SourceAuthorityInput } from "./source-authority.js";

const rootInput = (overrides: Partial<SourceAuthorityInput> = {}): SourceAuthorityInput => ({
  target: { type: "pack", name: "toolkit", identity: "@test/packs/toolkit" },
  relationship: { kind: "root" },
  requested: {
    authority: "registry",
    fqn: "@test/packs/toolkit",
    registry: { sourceName: undefined, endpoint: undefined },
  },
  configured: {
    identity: { authority: "workspace", fqn: "@test/packs/toolkit" },
    status: "usable",
  },
  ...overrides,
});

describe("evaluateSourceAuthority", () => {
  it("blocks a Registry request over workspace root authority", () => {
    expect(evaluateSourceAuthority(rootInput())).toMatchObject({
      kind: "blocked",
      fact: {
        cause: "workspace-source-replacement",
        target: { type: "pack", name: "toolkit" },
        relationship: { kind: "root" },
      },
    });
  });

  it("allows the requested workspace source", () => {
    expect(
      evaluateSourceAuthority(
        rootInput({
          requested: { authority: "workspace", fqn: "@test/packs/toolkit" },
        }),
      ),
    ).toEqual({ kind: "allow-requested" });
  });

  it("allows an explicit authority transition", () => {
    expect(evaluateSourceAuthority(rootInput({ allowWorkspaceReplacement: true }))).toEqual({
      kind: "allow-requested",
    });
  });

  it("allows a request when configured authority is not workspace-owned", () => {
    expect(
      evaluateSourceAuthority(
        rootInput({
          configured: {
            identity: {
              authority: "registry",
              fqn: "@test/packs/toolkit",
              registry: { sourceName: undefined, endpoint: undefined },
            },
          },
        }),
      ),
    ).toEqual({ kind: "allow-requested" });
  });

  it("uses a compatible usable workspace member without replacement", () => {
    expect(
      evaluateSourceAuthority({
        ...rootInput({
          configured: {
            identity: { authority: "workspace", fqn: "@test/skills/guide" },
            status: "usable",
          },
        }),
        target: { type: "skill", name: "guide", identity: "@test/skills/guide" },
        relationship: { kind: "member", root: "@test/packs/toolkit" },
      }),
    ).toMatchObject({ kind: "workspace-satisfied" });
  });

  it("blocks a workspace member owned by a different source identity", () => {
    expect(
      evaluateSourceAuthority({
        ...rootInput({
          configured: {
            identity: { authority: "workspace", fqn: "@other/skills/guide" },
            status: "usable",
          },
        }),
        target: { type: "skill", name: "guide", identity: "@test/skills/guide" },
        relationship: { kind: "member", root: "@test/packs/toolkit" },
      }),
    ).toMatchObject({
      kind: "blocked",
      fact: { cause: "workspace-identity-mismatch" },
    });
  });

  it("blocks unusable workspace member authority", () => {
    expect(
      evaluateSourceAuthority({
        ...rootInput({
          configured: {
            identity: { authority: "workspace", fqn: "@test/skills/guide" },
            status: "corrupt",
          },
        }),
        target: { type: "skill", name: "guide", identity: "@test/skills/guide" },
        relationship: { kind: "member", root: "@test/packs/toolkit" },
      }),
    ).toMatchObject({
      kind: "blocked",
      fact: { cause: "workspace-unusable", detail: expect.stringContaining("corrupt") },
    });
  });
});
