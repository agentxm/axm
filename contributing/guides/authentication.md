# Authentication

Use this guide when changing CLI login scopes or device authorization. The
ordinary login must remain useful without granting mutation authority, and the
machine-readable device flow must remain safely resumable.

## Command-to-scope matrix

OIDC scopes (`openid`, `profile`, `email`, and `offline_access`) establish
identity and refreshable session semantics. They are not Registry authority.

| CLI need                                                                    | Minimum Registry scope       | How authority is obtained                                   |
| --------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| Discover, view, install, update, and read public or permitted Registry data | `extensions:read`            | Ordinary login baseline                                     |
| Read the signed-in account                                                  | `account:read`               | Ordinary login baseline                                     |
| Publish a new extension                                                     | `extensions:publish:new`     | Exact publication authorization                             |
| Publish a new version                                                       | `extensions:publish:version` | Exact publication authorization                             |
| Yank a release                                                              | `extensions:yank`            | Explicit `axm login --scope extensions:yank` when required  |
| Administer extension visibility                                             | `extensions:admin`           | Explicit `axm login --scope extensions:admin` when required |
| Create, list, or revoke account tokens                                      | `account:write`              | Explicit scope plus step-up verification where required     |

Default login therefore requests only `extensions:read` and `account:read` in
addition to the OIDC session scopes. Do not add mutation or administrative
scope to the baseline. When adding a Registry command, identify its minimum
scope here and implement exact authorization or explicit scope recovery before
expanding login authority.

## Device-flow contract

Nonblocking device login emits a complete authorization URL, a clean fallback
URL, the code as a separate field, expiry, requested scopes, and a resume
command. Repeating initiation for the same Registry and normalized scope set
re-emits the unexpired request. A different Registry or scope set conflicts;
`--restart` is the explicit replacement operation.

Timeout remains retryable and preserves the pending request. Denial and expiry
are distinct terminal outcomes and clear it. These states are part of the JSON
contract, so update schemas, tests, help, and telemetry together.
