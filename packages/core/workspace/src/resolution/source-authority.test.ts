import { describe, expect, it } from "vitest";
import { evaluateSourceAuthority, type SourceAuthorityInput } from "./source-authority.js";

const rootInput = (overrides: Partial<SourceAuthorityInput> = {}): SourceAuthorityInput => ({
  target: { type: "pack", name: "toolkit", identity: "@test/packs/toolkit" },
  relationship: { kind: "root" },
  requested: { identity: "registry:@test/packs/toolkit@1.0.0", workspace: false },
  configured: {
    identity: "workspace:@test/packs/toolkit",
    workspace: true,
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
          requested: { identity: "workspace:@test/packs/toolkit", workspace: true },
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
          configured: { identity: "registry:@test/packs/toolkit", workspace: false },
        }),
      ),
    ).toEqual({ kind: "allow-requested" });
  });

  it("uses a compatible usable workspace member without replacement", () => {
    expect(
      evaluateSourceAuthority({
        ...rootInput({
          configured: {
            identity: "workspace:@test/skills/guide",
            workspace: true,
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
            identity: "workspace:@other/skills/guide",
            workspace: true,
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
            identity: "workspace:@test/skills/guide",
            workspace: true,
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
