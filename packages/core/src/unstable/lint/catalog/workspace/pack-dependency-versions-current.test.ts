import { describe, expect, it } from "@effect/vitest";
import { packDependencyVersionFindings } from "./pack-dependency-versions-current.js";

const base = {
  packFqn: "@acme/packs/workflow",
  manifestPath: ".axm/extensions/@acme/packs/workflow/pack.json",
  memberFqn: "@acme/skills/review",
  constraint: "^0.0.4",
  memberVersion: "0.0.5",
  classification: "excluded",
} as const;

describe("workspace/pack-dependency-versions-current", () => {
  it("reports every actionable local exclusion with an authority-correct action", () => {
    const findings = packDependencyVersionFindings([
      { ...base, packAuthority: "workspace", memberAuthority: "workspace" },
      { ...base, packAuthority: "workspace", memberAuthority: "registry" },
      { ...base, packAuthority: "registry", memberAuthority: "workspace" },
    ]);

    expect(findings).toHaveLength(3);
    expect(findings[0]).toMatchObject({
      severity: "error",
      suggestions: [
        { cmd: "axm packs add @acme/packs/workflow @acme/skills/review --replace-existing" },
      ],
    });
    expect(findings[2]?.suggestions).toEqual([
      {
        description:
          "Update the pack if its owner has published a constraint that includes the workspace version",
        cmd: "axm packs update @acme/packs/workflow",
      },
      { description: "Otherwise stop workspace authority from shadowing @acme/skills/review" },
    ]);
  });

  it("does not duplicate missing, satisfying, or Registry-only currency diagnostics", () => {
    const findings = packDependencyVersionFindings([
      {
        ...base,
        packAuthority: "workspace",
        memberAuthority: "workspace",
        classification: "satisfying",
      },
      {
        packFqn: base.packFqn,
        manifestPath: base.manifestPath,
        memberFqn: base.memberFqn,
        constraint: base.constraint,
        packAuthority: "workspace",
        classification: "missing",
      },
      { ...base, packAuthority: "registry", memberAuthority: "registry" },
    ]);
    expect(findings).toEqual([]);
  });
});
