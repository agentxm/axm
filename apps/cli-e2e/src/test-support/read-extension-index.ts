/**
 * The published extension index a `view` example reads back.
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
  publisher_binding_id: "hbnd_read_fixture",
  visibility: "public",
  deprecation: null,
  versions: [
    { version: "1.1.0", published: "2026-02-01T00:00:00.000Z", integrity: "sha512-BBBB==" },
    { version: "1.0.0", published: "2026-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
  ],
};
