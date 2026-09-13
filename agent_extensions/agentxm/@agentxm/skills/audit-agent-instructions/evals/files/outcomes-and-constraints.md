# Outcomes and necessary constraints

Synthetic fixture derived from a review in which proposed persistent guidance
prescribed an inspection and execution sequence instead of the desired state.

## Effective contract

The host loads root AGENTS.md for every repository task. AGENTS.md is canonical;
there are no aliases, scoped overrides, or generated regions in this fixture.
This fixture contains the complete instruction and policy evidence. Treat
unavailable additional tools or files as unavailable, without inventing them.

## Existing AGENTS.md

1. For a service configuration change, open the infrastructure directory, read
   its README, search for a similar declaration, edit the stack, inspect its
   diff, open a terminal, run a preview, and then apply the change.
2. Pulumi owns infrastructure and provider configuration. Declared and live
   state must agree. Direct provider changes require an explicitly authorized or
   documented exception.
3. Run `pnpm run verify:affected` to verify repository changes. This workflow
   supplies required environment configuration and checks; raw test commands
   omit those prerequisites.
4. Back up persistent data before applying a destructive migration. The backup
   must be restorable before the mutation starts.
5. When changing an API contract, use `docs/api-contracts.md` for its acceptance
   criteria and validation requirements.

## Local policy

The inspection order in item 1 is one successful approach, not a prerequisite.
The tool ownership in item 2, verification mechanism in item 3, ordering in item
4, and discovery route in item 5 protect requirements the host cannot infer. No
authority to deploy, mutate a provider, or run a destructive migration is
supplied by this instruction-editing or audit request.
