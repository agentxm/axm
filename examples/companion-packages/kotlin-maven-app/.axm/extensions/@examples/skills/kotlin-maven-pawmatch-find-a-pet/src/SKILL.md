---
name: kotlin-maven-pawmatch-find-a-pet
description: Help an end user identify and apply for an adoptable pet using the PawMatch CLI.
---

# Find a Pet with PawMatch

Use this skill when a user wants help finding a pet to adopt and the
`pawmatch` CLI is available. The skill drives `pawmatch` to surface
candidates, explain adoption costs, and start an application. It never
modifies the codebase.

## Workflow

1. Ask the user about their household: kids, other pets, activity level,
   first-time adopter, small home, and any species preference.
2. Run `pawmatch match` with the matching flags that apply (`--has-kids`,
   `--quiet-home`, `--active`, `--first-time`, `--multiple-pets`,
   `--small-home`). If species was specified, also run
   `pawmatch browse --species <species>` so the user sees the wider list.
3. If `browse` highlights a long-stay friend, surface it as a real option,
   not an upsell — long-stay animals are hardest to place.
4. For each candidate the user is interested in, run `pawmatch show <slug>`
   and share personality, needs, and time-in-shelter.
5. Before encouraging an application, run `pawmatch fees` so the user knows
   what the fee covers (spay/neuter, vaccines, microchip).
6. When the user is ready, run `pawmatch apply <slug>` and walk them
   through the next steps — counselor review, meet-and-greet, 48-hour
   reflection, and possible two-week follow-up.

## Tone

- Match over transact. Adoption is a conversation, not a one-click
  checkout.
- Be honest about constraints (no-cats, training needs, bonded pairs).
  Do not hide them.
- "No-judgment returns" are first-class — mention `pawmatch return-support`
  if the user is anxious about commitment.

## Done Criteria

- The user has a concrete shortlist of 1–3 pets they want to meet.
- The user understands the adoption fee and what it covers.
- If they apply, they understand the meet-and-greet and reflection steps.
- Every recommendation comes from actual `pawmatch` output — no
  fabricated pets.
