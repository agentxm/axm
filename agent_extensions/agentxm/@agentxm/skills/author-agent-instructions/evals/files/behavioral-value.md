# Synthetic instruction revision request

The host loads `/workspace/AGENTS.md` for every repository task. The file is the
canonical source and currently contains one valid route: “Before changing a
database migration, read `docs/migrations.md`.” The route resolves and applies
at the intended scope.

One agent recently changed a payment adapter without running the repository's
integration suite. The suite is required after payment-adapter changes, but it
is slow and irrelevant to documentation-only work.

A maintainer proposes adding all of the following to the root file:

- “You are an expert software engineer.”
- “Always run the full integration suite.”
- three invented examples of good repository work.

No comparative behavioral run exists. Preserve the observed payment-adapter
failure as a development case. Documentation-only work is a representative
adjacent case and must not acquire unnecessary integration testing. Reserve at
least one different adapter change as a held-out case.
