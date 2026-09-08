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

## Step-up handoff contract

Unattended writes return an `auth_required` pending-human error at exit 13.
`--step-up-request URL` resumes that authenticated Registry request through the
same feature command and decoded inputs. `--wait-for-human SECONDS` requests a
positive bounded wait; timeout retains the request and returns exit 16. The
shared handoff action is defined by
`@agentxm/registry-protocol/unstable/human-handoff` and is embedded in the
existing machine envelope. Do not serialize executable commands or credentials
into a saved handoff, or silently replace expired or consumed requests.

Loopback callback receipt is not completion. Login signals browser completion
only after issuer validation, exchange, and credential persistence. Publish
signals capability acquisition separately from the eventual publication result.
The listener's scoped failure finalizer must close a received callback without
claiming success when its owner fails or is interrupted.

## Exact publish handoff

An unattended publish without existing publication authority returns an
`auth_required` pending-human error at exit 13 with `action.purpose: "publish"`.
It persists a private initiator proof locally before returning. Only the proof's
challenge is sent when creating the request; the public request URL cannot
exchange approval by itself.

Resume with the original publication inputs and `--authorization-request URL`,
using the returned `action.requestRef`. The rebuilt publication set, archives,
visibility inputs, Registry, and request must still match before polling or
exchange. `--wait-for-human SECONDS` selects a positive bounded wait and returns
the same handoff at exit 16 if the wait ends first. Ordinary interactive publish
continues to use exact browser consent and loopback delivery.

Polling exchanges only an approved request and does not retry a lost exchange
response. A later resume checks the retained request: prior exchange requires
publication-outcome verification before new consent. Denied and expired
requests are terminal. Never turn authorization resume into blind upload replay;
the publication result and its recovery instruction own upload settlement.
