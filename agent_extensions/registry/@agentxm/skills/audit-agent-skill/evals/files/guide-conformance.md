# Synthetic skill package for conformity audit

Identity: `workspace:@example/skills/release-helper`, revision `sample-c4`.

Package contents:

- `SKILL.md` description: “Helps with releases.”
- The body reformats a supplied release-note file but does not define behavior
  when the file is absent.
- `references/legacy-format.md` exists but no workflow step routes to it.
- Registry metadata claims compatibility with every Agent Skills host, but the
  instructions require a host-specific `ReleaseNotes` tool and name no
  supported host.
- The package has no executable scripts and requests no network or credential
  access.

Audit against the locally available current skill-engineering bundle. No host
runtime is available for behavioral trials.
