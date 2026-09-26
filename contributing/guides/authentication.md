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

Revoking a token, yanking, and un-yanking take authority or reach away, so none
of them asks for more. Every other refusal of a signed-in user is a defect. Do not answer one by
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

## Keeping a session alive

One place renews a stored session: `SessionRefresher`, behind the auth
middleware. It runs before a request whose access token expires within five
minutes, and again once if the Registry rejects one. Nothing else spends a
refresh token, and no command decides for itself whether it is authenticated.

Refresh tokens rotate with reuse detection, so two processes that spend the
same one lose the whole family. Renewal therefore holds a cross-process lock on
`refresh.lock` in the credential home for the whole attempt — the re-read, the
token round trip, and the write — and re-reads the store past the per-session
memo before deciding. A process that finds a different token on disk adopts it
instead of spending its own. `axm logout` holds the same lock and re-reads
inside it, so a renewal in another process cannot write a session back after
the erase. Waiting for the lock stays interruptible, the write that follows a
granted refresh does not, and a lock that is compromised while held fails the
renewal instead of throwing from a timer.

Renewing and revoking travel the unauthenticated transport (`TokenExchange`).
Both endpoints authenticate the token in the request body, and either call sent
through the middleware would ask the middleware to renew the session first.

A failed renewal has distinct outcomes; never collapse one into another.

- The Registry itself refuses the grant — the 400 its contract declares, or a
  401 or 403 carrying its own error document. The session is over: it is erased
  under the lock, so no other process presents the refused token, and the
  request goes on to collect the Registry's rejection, which renders as signed
  out.
- Nothing that speaks for the grant answered: no connection, a timeout, a
  server error, a rate limit, or a refusal with no Registry error document,
  which is an intermediary's. The credential is kept and the request fails as a
  network failure. A network blip must not read as being signed out.
- The grant was accepted but the answer cannot be read, or the renewed session
  could not be written. The refresh token may be spent, so the attempt is
  remembered as the end of the session for this invocation, and the request
  fails with that reason.
- The lock or the credential store refused. The request fails with that reason.

Resolving the credential follows the same rule before any renewal starts. An
invocation with nothing configured and nothing stored reads anonymously. One
pointed at a token file it cannot read, or holding a credential store that
refuses, fails the request with that reason and sends nothing: a request sent
without its credential is answered as if the person were nobody.

Only the first renewal outcome is being signed out. The middleware carries every other failure
to the caller as a typed registry failure in the transport error's cause, which
`mapRegistryFailure` hands on unchanged and the request policy does not replay.

## Device-flow contract

Nonblocking device login emits a complete authorization URL, a clean fallback
URL, the code as a separate field, expiry, and a resume command. Every sign-in
asks for the same thing, so repeating initiation for the same Registry
re-emits the unexpired request and only a different Registry conflicts;
`--restart` is the explicit replacement operation.

Timeout remains retryable and preserves the pending request. Denial and expiry
are distinct terminal outcomes and clear it. These states are part of the JSON
contract, so update schemas, tests, help, and telemetry together.

`selectLoginStrategy` stays pure; `loginStrategyEnvironment` assembles its
facts. Interactive sign-in chooses the device code where no browser can open:
SSH without a display (a `BROWSER` setting does not override this), CI,
Codespaces, and Linux other than WSL with none of `DISPLAY`,
`WAYLAND_DISPLAY`, or `BROWSER`.

Device sign-in never writes to the clipboard on its own. The wait's `c` key
copies the handoff link (`handoffUrl`), which for device sign-in already
carries the code. Over SSH the copy is an OSC 52 sequence written to stdout, so
it reaches the clipboard of the terminal the person types on; inside tmux or
GNU screen it is wrapped in their DCS passthrough, which is best-effort (tmux
forwards it only with `allow-passthrough`). A written sequence counts as
copied because terminals acknowledge nothing; without a terminal on stdout the
wait reports that nothing was copied.

## Signed out

Being signed out is one result with one rendering: code `auth_required`, exit
13, `blockedOn: "human"`, and `axm login`, with the device-code form and token
guidance alongside for an invocation that cannot run a browser sign-in. `axm publish` returns it when no
credential resolves, exactly as every other command does.

No 403 renders it. A refusal that reaches a signed-in person is answered by
their permissions, by using their session instead of a narrower credential, or
by a step-up from the table above — never by signing in again. `translate.ts`
keys its recovery off the wire code and falls back to the Registry's own title
and detail; no branch may emit `axm login`.

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
only after issuer validation, exchange, and credential persistence. The
listener's scoped failure finalizer must close a received callback without
claiming success when its owner fails or is interrupted.

## Publishing

Publishing requires a session or a token. There is no signed-out approval path
and no browser-approved publish capability: a signed-out `axm publish` returns
the signed-out result above and offers sign-in.
