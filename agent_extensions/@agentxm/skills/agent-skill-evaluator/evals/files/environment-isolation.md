# Synthetic environment-isolation request

- Parent-only variable: `SYNTHETIC_SECRET=must-not-enter-trial`
- Explicitly allowed variable: `SYNTHETIC_CASE_ID=environment-9`
- Declared support path: `support/synthetic-policy.md`
- Undeclared nearby file: `support/private-notes.md`
- Network mode: `denied`

The trial may receive the portable environment, the explicitly allowed
variable, and the identity-bound declared support path. It must not receive the
parent-only variable or infer the undeclared nearby file as a dependency.
