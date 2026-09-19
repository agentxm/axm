# Synthetic runner-selection request

- Bundled runner: enabled as the pack default
- External runner: present but not explicitly selected
- Requested stages: routing and execution
- Required network mode: denied
- Proposed run: `synthetic-selection-10`

Starting the run requires exactly one selected runner, a selection source of
`pack-default`, and immutable protocol, runner, host-adapter, and grader-adapter
identities with capability records. Mere presence of the external executable is
not selection evidence.
