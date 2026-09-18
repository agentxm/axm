# Authentication

Use this guide when changing CLI sign-in or device authorization. Signing in is
not a moment for choosing authority: the session it produces is the person
themselves, bounded only by their permissions. The machine-readable device flow
must remain safely resumable.

## Command-to-exception matrix

Signing in has two states and no third. A signed-in user succeeds at every
command their account and organization permissions allow, on the first attempt,
without a browser step or a second sign-in. Sign-in requests only the OIDC
scopes (`openid`, `profile`, `email`, and `offline_access`), which establish
identity and refreshable session semantics and carry no Registry authority.

An exception is a command that may ask a signed-in user for more. There are
three, and each asks for recent authentication bound to that exact action:

| CLI command                     | What it asks for | Why                                     |
| ------------------------------- | ---------------- | --------------------------------------- |
| `axm token create`              | Step-up          | It creates a credential                 |
| Broadening extension visibility | Step-up          | It broadens who can reach the extension |
| Deleting an extension           | Step-up          | It destroys something unrecoverable     |

Every other refusal of a signed-in user is a defect. Do not answer one by
requesting more authority at sign-in: there is no scoped login, and the Registry
rejects a sign-in that asks for a Registry scope.

## Limited credentials

A personal access token is the one credential a person deliberately makes
narrower than themselves. It carries one permission level (`read`, `publish`, or
`admin`), an optional allowlist of owners and extensions, and an expiry — at most
90 days for a `publish` or `admin` token, and 365 days for a `read` token.

`axm token create` and `axm token list` speak only that vocabulary. The Registry
lowers it to internal scopes; no CLI surface asks for one or prints one.

A token refused for its own limits reports `insufficient_scope` or
`resource_restriction`, which names the level it would have needed. A session
reaching either is a defect, not a reason to mint a token.

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
