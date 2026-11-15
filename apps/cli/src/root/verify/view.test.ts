import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import {
  decideReleaseVerdict,
  ReleaseVerificationDocumentSchema,
  type ReleaseVerificationDocument,
} from "@agentxm/workspace-features/publishing";

import { paintText } from "../../screen/index.js";
import { releaseVerificationDoc } from "./view.js";

const recorded =
  "sha512-AayA7dZvjjWgu8W0ypIl6/MwRxMSqy0+JhStKyKL5L+5snqgRxPqmQ2grXeWGnNm8x2xeMIIQevwE3PAU0BgxA==";
const expected =
  "sha512-oZPmBsKw4V9MmWEKXqWEicPWv2+uPp/vwK7PoVdrq0iQ2XzkkpSMgnhftoI6Kp2WYonyyTJ4xp5WMU79ISoiiA==";

const satisfied = { coverage: { state: "complete" }, conclusion: "satisfied" } as const;
const noExpectation = {
  coverage: { state: "not-applicable", reason: "No expected integrity was supplied." },
  conclusion: "not-applicable",
} as const;
const observed = {
  integrity: recorded,
  publisherBindingId: "hbnd_test",
  published: "2026-11-14T10:02:11Z",
  yanked: false,
};

const release = (name: string, fields: Readonly<Record<string, unknown>>) => ({
  id: `@acme/skills/${name}@1.0.0`,
  owner: "@acme",
  type: "skill",
  name,
  version: "1.0.0",
  requestRefs: ["request-1"],
  presence: satisfied,
  identity: noExpectation,
  archive: satisfied,
  ...fields,
});

/** An archive read that failed with this Registry client failure. */
const lost = (category: string, message: string) => ({
  observed,
  archive: {
    coverage: {
      state: "incomplete",
      reasons: [
        "No archive matching the recorded integrity was obtained through an admitted read.",
      ],
    },
    conclusion: "unknown",
    failure: { category, message },
  },
});

const documentOf = (
  releases: ReadonlyArray<Readonly<Record<string, unknown>>>,
  selectedBy: "flag" | "publish-result" | "default" = "default",
  requestCount = releases.length,
): ReleaseVerificationDocument => {
  const decoded = Schema.decodeUnknownSync(ReleaseVerificationDocumentSchema)({
    contract: "release-verification-v1",
    registry: { name: "agentxm", endpoint: "https://registry.agentxm.ai", selectedBy },
    selection: {
      mode: "references",
      requests: Array.from({ length: requestCount }, (_, index) => ({
        id: `request-${String(index + 1)}`,
        input: "@acme/skills/x@1.0.0",
      })),
    },
    releases,
    verdict: { ok: true, reasons: [] },
  });
  return { ...decoded, verdict: decideReleaseVerdict(decoded.releases) };
};

const painted = (document: ReleaseVerificationDocument) =>
  paintText(releaseVerificationDoc(document), {
    width: "unbounded",
    colors: false,
  }).join("\n");

describe("release verification human document", () => {
  it("answers directly for a verified release, naming the Registry and what was not assessed", () => {
    const text = painted(documentOf([release("review", { observed })], "flag"));
    expect(text).toContain("Verified the selected release");
    expect(text).toContain(
      "Registry agentxm (https://registry.agentxm.ai), selected by --registry",
    );
    expect(text).toContain("no changes applied");
    expect(text).toMatch(/@acme\/skills\/review@1\.0\.0\s+satisfied\s+not assessed\s+satisfied/u);
    expect(text).toContain(
      "@acme/skills/review@1.0.0: identity not assessed. No expected integrity was supplied.",
    );
  });

  it("keeps each attention and incomplete state distinct, with the facts that decided it", () => {
    const text = painted(
      documentOf([
        release("mismatch", {
          observed,
          expectation: { integrity: expected, source: "flag" },
          identity: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "integrity-mismatch",
          },
        }),
        release("absent", {
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "extension-unavailable",
          },
          archive: {
            coverage: {
              state: "incomplete",
              reasons: ["No archive was read because the Registry returned no extension metadata."],
            },
            conclusion: "unknown",
          },
        }),
        release("missing", {
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "version-missing",
          },
          archive: {
            coverage: {
              state: "incomplete",
              reasons: ["No archive was read because the selected version is not listed."],
            },
            conclusion: "unknown",
          },
        }),
        release("held", {
          observed,
          archive: {
            coverage: {
              state: "incomplete",
              reasons: [
                "No archive matching the recorded integrity was obtained through an admitted read.",
              ],
            },
            conclusion: "unknown",
            failure: { category: "forbidden", message: "Held by the Registry." },
          },
        }),
        release("unobserved", {
          presence: {
            coverage: {
              state: "incomplete",
              reasons: ["The Registry did not return selection metadata."],
            },
            conclusion: "unknown",
            failure: { category: "network", message: "Registry unreachable." },
          },
          archive: {
            coverage: {
              state: "incomplete",
              reasons: ["No archive was read because Registry selection metadata is unavailable."],
            },
            conclusion: "unknown",
          },
        }),
      ]),
    );
    expect(text).toContain("The selected 5 releases did not verify");
    expect(text).toContain(`the Registry records integrity ${recorded}`);
    expect(text).toContain(`--integrity expects ${expected}`);
    expect(text).toContain(
      "@acme/skills/absent@1.0.0: the Registry returned no metadata for this extension; it is absent or not visible to this caller",
    );
    expect(text).toContain(
      "@acme/skills/missing@1.0.0: the extension is visible, but the Registry does not list version 1.0.0.",
    );
    expect(text).toContain("@acme/skills/held@1.0.0: archive not established.");
    expect(text).toContain("forbidden: Held by the Registry.");
    expect(text).toContain("@acme/skills/unobserved@1.0.0: presence not established.");
    expect(text).toContain("network: Registry unreachable.");
    expect(text).toMatch(/@acme\/skills\/missing@1\.0\.0\s+attention: version-missing/u);
  });

  it("states incomplete evidence without claiming a negative finding", () => {
    const text = painted(
      documentOf([
        release("held", {
          observed,
          archive: {
            coverage: { state: "incomplete", reasons: ["Not read."] },
            conclusion: "unknown",
            failure: { category: "forbidden", message: "Held." },
          },
        }),
      ]),
    );
    expect(text).toContain("Verification of the selected release is incomplete");
  });

  it("reports yank facts for a present release without failing it", () => {
    const text = painted(
      documentOf([
        release("withdrawn", {
          observed: {
            ...observed,
            yanked: true,
            yankedAt: "2026-11-14T11:00:00Z",
            yankCategory: "other",
            yankMessage: "Withdrawn.",
          },
        }),
      ]),
    );
    expect(text).toContain("Verified the selected release");
    expect(text).toContain(
      "@acme/skills/withdrawn@1.0.0: yanked at 2026-11-14T11:00:00.000Z as other (Withdrawn.); a yanked version is still present.",
    );
  });

  it("shows a release named by several requests once, counting both", () => {
    const text = painted(
      documentOf(
        [release("review", { observed, requestRefs: ["request-1", "request-2"] })],
        "flag",
        2,
      ),
    );
    expect(text).toContain("2 requested, 1 distinct");
    expect(text.match(/@acme\/skills\/review@1\.0\.0\s+satisfied/gu)).toHaveLength(1);
  });

  it("states a coverage fact shared by many releases once, keeping per-release findings", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const text = painted(
      documentOf([
        ...names.map((name) => release(name, { observed })),
        release("missing", {
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "version-missing",
          },
          archive: {
            coverage: {
              state: "incomplete",
              reasons: ["No archive was read because the selected version is not listed."],
            },
            conclusion: "unknown",
          },
        }),
      ]),
    );
    expect(text.match(/No expected integrity was supplied\./gu)).toHaveLength(1);
    expect(text).toContain(
      "Identity not assessed for 8 releases. No expected integrity was supplied.",
    );
    expect(text).toContain(
      "@acme/skills/missing@1.0.0: the extension is visible, but the Registry does not list version 1.0.0.",
    );
    expect(text).toContain("@acme/skills/missing@1.0.0: archive not established.");
  });

  it("names the releases that share a coverage fact when they are few", () => {
    const text = painted(documentOf([release("a", { observed }), release("b", { observed })]));
    expect(text).toContain(
      "Identity not assessed for @acme/skills/a@1.0.0, @acme/skills/b@1.0.0. No expected integrity was supplied.",
    );
  });

  it("keeps each row distinct when one check loses its evidence in different ways", () => {
    const unreachable = ["n1", "n2", "n3", "n4", "n5", "n6"];
    const held = ["h1", "h2", "h3", "h4", "h5", "h6"];
    const text = painted(
      documentOf([
        ...unreachable.map((name) => release(name, lost("network", "Registry unreachable."))),
        ...held.map((name) => release(name, lost("forbidden", "Held by the Registry."))),
      ]),
    );
    expect(text).toContain(
      "Archive not established for 6 releases. No archive matching the recorded integrity was obtained through an admitted read. network: Registry unreachable.",
    );
    expect(text).toContain(
      "Archive not established for 6 releases. No archive matching the recorded integrity was obtained through an admitted read. forbidden: Held by the Registry.",
    );
    for (const name of unreachable)
      expect(text).toMatch(
        new RegExp(
          `@acme/skills/${name}@1\\.0\\.0\\s+satisfied\\s+not assessed\\s+unknown \\(network\\)`,
          "u",
        ),
      );
    for (const name of held)
      expect(text).toMatch(
        new RegExp(
          `@acme/skills/${name}@1\\.0\\.0\\s+satisfied\\s+not assessed\\s+unknown \\(forbidden\\)`,
          "u",
        ),
      );
  });

  it("names the releases of each note when rows cannot tell the notes apart", () => {
    const denied = ["d1", "d2", "d3", "d4", "d5", "d6"];
    const held = ["h1", "h2", "h3", "h4", "h5", "h6"];
    const ids = (names: ReadonlyArray<string>) =>
      names.map((name) => `@acme/skills/${name}@1.0.0`).join(", ");
    const text = painted(
      documentOf([
        ...denied.map((name) => release(name, lost("forbidden", "Access denied."))),
        ...held.map((name) => release(name, lost("forbidden", "Held by the Registry."))),
      ]),
    );
    expect(text).toContain(
      `Archive not established for ${ids(denied)}. No archive matching the recorded integrity was obtained through an admitted read. forbidden: Access denied.`,
    );
    expect(text).toContain(
      `Archive not established for ${ids(held)}. No archive matching the recorded integrity was obtained through an admitted read. forbidden: Held by the Registry.`,
    );
    expect(text).not.toContain("6 releases");
  });

  it("counts each note's releases when the rows differ in another column", () => {
    const presenceFinding = (finding: string, reason: string) => ({
      presence: { coverage: { state: "complete" }, conclusion: "attention-required", finding },
      archive: { coverage: { state: "incomplete", reasons: [reason] }, conclusion: "unknown" },
    });
    const unlisted = "No archive was read because the selected version is not listed.";
    const noMetadata = "No archive was read because the Registry returned no extension metadata.";
    const text = painted(
      documentOf([
        ...["u1", "u2", "u3", "u4", "u5", "u6"].map((name) =>
          release(name, presenceFinding("extension-unavailable", noMetadata)),
        ),
        ...["m1", "m2", "m3", "m4", "m5", "m6"].map((name) =>
          release(name, presenceFinding("version-missing", unlisted)),
        ),
      ]),
    );
    expect(text).toContain(`Archive not established for 6 releases. ${noMetadata}`);
    expect(text).toContain(`Archive not established for 6 releases. ${unlisted}`);
    expect(text).not.toContain("@acme/skills/u1@1.0.0, @acme/skills/u2@1.0.0");
  });

  it("sets the headline tone by the verdict and marks only the rows that need attention", () => {
    const blocks = (document: ReleaseVerificationDocument) => releaseVerificationDoc(document);
    const headlineTone = (document: ReleaseVerificationDocument) =>
      blocks(document).flatMap((block) => (block._tag === "headline" ? [block.tone] : []));
    const rowMarks = (document: ReleaseVerificationDocument) =>
      blocks(document).flatMap((block) =>
        block._tag === "table" ? block.rows.map((row) => row.mark) : [],
      );

    const verified = documentOf([release("review", { observed })]);
    expect(headlineTone(verified)).toEqual(["ok"]);
    expect(rowMarks(verified)).toEqual([undefined]);

    const mixed = documentOf([
      release("review", { observed }),
      release("missing", {
        presence: {
          coverage: { state: "complete" },
          conclusion: "attention-required",
          finding: "version-missing",
        },
        archive: {
          coverage: {
            state: "incomplete",
            reasons: ["No archive was read because the selected version is not listed."],
          },
          conclusion: "unknown",
        },
      }),
    ]);
    expect(headlineTone(mixed)).toEqual(["warn"]);
    expect(rowMarks(mixed)).toEqual([undefined, "warn"]);

    const incomplete = documentOf([
      release("held", {
        observed,
        archive: {
          coverage: { state: "incomplete", reasons: ["Not read."] },
          conclusion: "unknown",
          failure: { category: "forbidden", message: "Held." },
        },
      }),
    ]);
    expect(headlineTone(incomplete)).toEqual(["warn"]);
    expect(rowMarks(incomplete)).toEqual(["warn"]);
  });

  it("shows the recovery the command was given", () => {
    const text = paintText(
      releaseVerificationDoc(documentOf([release("review", { observed })]), [
        { description: "Sign in if this extension is private.", cmd: "axm login" },
      ]),
      { width: "unbounded", colors: false },
    ).join("\n");
    expect(text).toContain("axm login");
  });
});
