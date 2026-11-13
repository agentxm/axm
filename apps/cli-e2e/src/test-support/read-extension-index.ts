/**
 * Published metadata used by built-CLI `view` examples.
 *
 * Declared here rather than imported: an end-to-end project observes only
 * shipped artifacts, so the fixture the stub Registry serves is written out
 * in full.
 */
export const readExtensionIndex = {
  owner: "@acme",
  type: "skill",
  name: "review",
  description: "Review guidance",
  publisherBindingId: "hbnd_read_fixture",
  visibility: "public",
  archival: null,
  deprecation: null,
  versions: [
    { version: "1.1.0", published: "2026-02-01T00:00:00.000Z", integrity: "sha512-BBBB==" },
    { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
  ],
};

/** Single-identity selection response, correlated to the first caller key. */
export const readExtensionSelection = (description = readExtensionIndex.description) => {
  const observedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    purpose: "select",
    selectionPolicyVersion: "1",
    observedAt,
    results: [
      {
        key: "0",
        outcome: "metadata",
        page: {
          ...readExtensionIndex,
          description,
          revision: "fixture-selection-1",
          observedAt,
          validUntil: new Date(Date.parse(observedAt) + 30_000).toISOString(),
          continuation: null,
        },
      },
    ],
  };
};
