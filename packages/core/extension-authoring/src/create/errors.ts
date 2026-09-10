/**
 * Typed refusals the authoring request phase can settle with.
 *
 * Each one carries the facts a person needs to recover — the owners they
 * could have meant, the settings file that records ownership, the name rule
 * their name broke — and none of them carries rendered prose. The
 * application boundary owns the sentence; the feature owns the decision.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * No owner is configured for the selected workspace and none was named, so
 * the package has no authorship to carry. `candidates` are the owners the
 * person could plausibly have meant, most local first; it may be empty.
 */
export class AuthoringOwnerRequired extends Schema.TaggedError<AuthoringOwnerRequired>()(
  "AuthoringOwnerRequired",
  {
    /** The thing being authored, e.g. `skill`. */
    subject: Schema.String,
    /** The command route, so a recovery action is a runnable command. */
    command: Schema.String,
    /** The name the person asked to create. */
    name: Schema.String,
    /** Owners the person could have meant, most local first. */
    candidates: Schema.Array(Schema.String),
    /** Workspace-relative settings file that would record the owner. */
    settingsPath: Schema.String,
  },
) {}

/** An explicitly named owner disagrees with the one the workspace records. */
export class AuthoringOwnerMismatch extends Schema.TaggedError<AuthoringOwnerMismatch>()(
  "AuthoringOwnerMismatch",
  {
    requested: Schema.String,
    configured: Schema.String,
  },
) {}

/** The requested name is not a name an authored package can carry. */
export class ScaffoldNameInvalid extends Schema.TaggedError<ScaffoldNameInvalid>()(
  "ScaffoldNameInvalid",
  {
    subject: Schema.String,
    name: Schema.String,
    /** The pattern source every authored name matches. */
    pattern: Schema.String,
    maxLength: Schema.Number,
  },
) {}

/**
 * Authoring was requested in a workspace scope that does not hold authored
 * packages. Only the project workspace does.
 */
export class AuthoringScopeUnsupported extends Schema.TaggedError<AuthoringScopeUnsupported>()(
  "AuthoringScopeUnsupported",
  {
    subject: Schema.String,
    scope: Schema.String,
  },
) {}
