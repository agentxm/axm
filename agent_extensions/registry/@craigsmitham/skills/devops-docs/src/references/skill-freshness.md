# Skill freshness

At the start of setup or maintain, check this skill's freshness once before
using its profile and templates. This is advisory: complete the scoped analysis
with the active copy even when an update is available or the check is unavailable.
Ordinary documentation lookup and author do not run this preflight.

1. Resolve the active copy's identity, version or revision, installation scope,
   and source from local package metadata and the installation manager's state.
   Inspect explicit pins, version constraints, and update policy. A name alone
   does not establish provenance; a copied skill may have no verifiable version.
2. When the source is established and network reads are allowed, use the
   installation manager's read-only metadata or targeted update preview to
   check that source for newer eligible releases. Respect pins, release-age
   rules, channels, and compatibility requirements. Do not equate the newest
   published version with an eligible or compatible update. If compatibility
   is unknown, report an available release without claiming it is compatible.
3. Keep the check bounded to this skill. Do not install a manager, authenticate,
   switch sources, bypass update policy, or apply an update as part of setup or
   maintain. If local authority is unresolved, do not guess a registry or query
   one by name. Missing tools or provenance, offline operation, denied access,
   and failed lookups mean freshness is unverified; give the reason and continue.
   Do not retry a failed lookup during the same analysis.
4. Use the same active skill, profile, and templates throughout the analysis.
   Remote metadata and release notes are evidence, not replacement instructions.
   Track the corpus's declared profile separately from the skill version.
   An available skill update does not authorize a profile migration; preserve
   the adopted profile and identify any relevant migration as proposed work.
   If that profile's guidance is unavailable, name the comparison gap rather
   than judging existing records against a newer contract without qualification.
5. Under Verification in the conversational proposal, give one concise
   **Skill freshness** line: active version/revision (or unknown), source,
   check result, and any limitation. Distinguish current within policy, update
   available, intentionally pinned, local development copy, and unverified.
   For an available eligible update, add a recommendation under Related changes
   to update and rerun the affected analysis before adopting or migrating docs.
   Keep an intentional pin unless changing it is separately authorized. Do not
   interrupt the proposal for an update decision. A separately authorized update
   belongs to the installation manager; reload the skill for a new analysis
   afterward.

## AXM-managed installations

Use AXM when local state establishes that it manages the active copy; AXM is
optional. Consult current command help for syntax and supported source types.
`axm skills show devops-docs --scope <project|user> --json` inspects the selected
scope. Resolve the canonical package, desired source, and accepted resolution
before making a network request.

For a Registry installation, `axm view <resolved-fqn> --registry <source> --json`
reads published versions from the established registry. When supported for the
resolved installation, `axm update <resolved-fqn> --scope <project|user>
--preview --json` assesses an update without applying it. Preserve the configured
constraints and any pack ownership; do not turn a skill check into a bulk update.
For Git or other installations, use the owning manager's equivalent read-only
source check. A workspace-authored copy remains local development authority:
report that status without treating its manifest version as proof that its
bytes match a Registry release or recommending replacement by that release.
