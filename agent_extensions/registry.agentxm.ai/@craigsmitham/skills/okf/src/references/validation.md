# Validation boundaries

The bundled validator separates OKF v0.2 conformance from authoring guidance.
Use the pinned [specification](SPEC.md) as authority; examples and local profiles
do not add base requirements.

| Check | Basis | Result |
|---|---|---|
| Non-reserved Markdown lacks parseable frontmatter or non-empty `type` | §4, §11 conditions 1–2 | Error |
| Nested index has frontmatter, or root index adds keys beyond `okf_version` | §8, §11 condition 3 | Error |
| An index lacks a heading, an entry precedes its heading, or a list entry is not a link | Headed link groups in §8; §11 condition 3 | Error |
| A headed index has no entries | §8 does not prescribe a minimum count for an empty directory | Warning; inspect whether the index is useful |
| Log date heading is not a valid `YYYY-MM-DD` | §9, §11 condition 3 | Error |
| Missing indexes, broken cross-links, or unknown types | Explicitly tolerated by §11 | Advisory findings, never base errors |
| Missing or mismatched index descriptions and unreachable concepts | §8 SHOULD descriptions plus this skill's discovery guidance | Warning |
| Defects in optional metadata families, including timestamps | §11 producer SHOULD | Warning; omitted optional families remain valid |
| Generation timestamp is later than every valid recorded verification | Derived maintenance observation, not a new spec rule | Info with `--info`; preserve trust tier and history |

`--strict` makes warnings fail the command without making them base-conformance
errors. Informational findings do not fail it. These focused checks are not a
complete Markdown renderer; discovery extraction uses inline link entries.
The structural check also accepts reference-style entries and Setext headings.
An unfamiliar Markdown construction should be checked against §8 and the intended
renderer before treating an extraction limitation as a content defect.

Review concept selection and usefulness as part of authoring. Use the intended
renderers for navigation: an OKF resolver treats `/` as bundle-root, whereas an
ordinary web renderer may not. The upstream
[reference-agent instructions](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/src/reference_agent/prompts/reference_instruction.md)
choose file-relative links for GitHub. Passing the validator proves neither
rendering behavior nor substantive verification of the knowledge.

The validator reads local files and uses PyYAML's safe loader. It does not fetch
sources, run attested computations, or execute code in concept bodies. The
regression suite uses temporary synthetic bundles:

```bash
python3 -B -m unittest discover -s scripts/tests -v
```
