import * as Schema from "effect/Schema";

import {
  decideReleaseVerdict,
  ReleaseVerificationDocumentSchema,
  type ReleaseVerificationDocument,
} from "@agentxm/workspace-features/publishing";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { releaseVerificationDoc } from "./view.js";

const recorded =
  "sha512-AayA7dZvjjWgu8W0ypIl6/MwRxMSqy0+JhStKyKL5L+5snqgRxPqmQ2grXeWGnNm8x2xeMIIQevwE3PAU0BgxA==";
const satisfied = { coverage: { state: "complete" }, conclusion: "satisfied" } as const;
const noExpectation = {
  coverage: { state: "not-applicable", reason: "No expected integrity was supplied." },
  conclusion: "not-applicable",
} as const;
const observed = {
  integrity: recorded,
  publisherBindingId: "hbnd_gallery",
  published: "2026-11-14T10:02:11Z",
  yanked: false,
};

const release = (name: string, fields: Readonly<Record<string, unknown>> = {}) => ({
  id: `@acme/skills/${name}@1.0.0`,
  owner: "@acme",
  type: "skill",
  name,
  version: "1.0.0",
  requestRefs: ["request-1"],
  presence: satisfied,
  identity: noExpectation,
  archive: satisfied,
  observed,
  ...fields,
});

const documentOf = (
  releases: ReadonlyArray<Readonly<Record<string, unknown>>>,
): ReleaseVerificationDocument => {
  const decoded = Schema.decodeUnknownSync(ReleaseVerificationDocumentSchema)({
    contract: "release-verification-v1",
    registry: { name: "agentxm", endpoint: "https://registry.agentxm.ai", selectedBy: "flag" },
    selection: {
      mode: "references",
      requests: releases.map((_, index) => ({
        id: `request-${String(index + 1)}`,
        input: "@acme/skills/x@1.0.0",
      })),
    },
    releases,
    verdict: { ok: true, reasons: [] },
  });
  return { ...decoded, verdict: decideReleaseVerdict(decoded.releases) };
};

/**
 * Release verification as a result: the registry on the title line, one row
 * per release, what the registry reported as one condition, and the verdict
 * last. A missing version is the row that needs attention.
 */
export default galleryModule(
  {
    _tag: "document",
    name: "ref-verify--verified",
    doc: releaseVerificationDoc(documentOf([release("review"), release("triage")])),
  },
  {
    _tag: "document",
    name: "ref-verify--attention",
    doc: releaseVerificationDoc(
      documentOf([
        release("review"),
        release("standup", {
          presence: {
            coverage: { state: "complete" },
            conclusion: "attention-required",
            finding: "version-missing",
          },
          archive: {
            coverage: { state: "not-applicable", reason: "The version is not listed." },
            conclusion: "not-applicable",
          },
        }),
      ]),
      [{ description: "Publish the missing version", cmd: "axm publish @acme/skills/standup" }],
    ),
  },
);
