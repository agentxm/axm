# align

Align a codebase or a specified part with supplied or identified requirements and guidance.

Use this skill when guidance has changed, new requirements have been supplied,
or implementation has drifted from its intended design. The concise
[skill](src/SKILL.md) defines the desired outcome and leaves the method to the
caller and model.

## Usage

Name the scope and the requirements or guidance it should align with. Include
the relevant version or applicability when needed. For example:

```text
$align this codebase with the updated architecture in docs/architecture.md
$align src/api/ with the supplied error-response requirements
$align our database access with the repository's persistence guidance
```

## Philosophy

Alignment is a relationship between a bounded implementation and an identified
body of requirements and guidance. It concerns actual behavior, structure, and
constraints; matching terminology or changing comments alone does not establish
it.

The sources determine the strength of each obligation. Mandatory requirements
must be satisfied; recommendations allow justified departures where their
authority permits them; optional choices remain optional. Examples illustrate
guidance without automatically becoming requirements. A departure from a
mandatory requirement remains a discrepancy unless an authorized exception
applies. The model's rationale alone cannot waive it.

Guidance can express principles that require judgment without defining a binary
conformance test. This is why the skill uses the broader term *alignment*.
Implementation choices remain open wherever the sources leave them open.

Updated requirements may call for changed behavior. Existing obligations remain
in force unless superseded. Conflicting or ambiguous guidance can leave part of
the target unresolved; silently weakening the reference to match the code does
not establish alignment.

Claims of alignment should be supported by evidence for the stated scope.
Remaining discrepancies and uncertainty limit what can be claimed. The skill
does not prescribe analysis steps, implementation techniques, verification
methods, or a reporting template.

## Sources and inspiration

The skill is an original synthesis of the following perspectives. Their
institutional procedures are not incorporated as required workflow.

- **W3C — [QA Framework: Specification Guidelines](https://www.w3.org/TR/2005/REC-qaframe-spec-20050817/),
  especially §§2.1–2.4.** Defines conformance in relation to specified
  requirements, distinguishes normative and informative material, and explains
  permitted variation among implementations. This informs scope, applicability,
  and implementation freedom. It also recognizes documents for which normative
  conformance is not applicable.
- **IETF — [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html) and
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174.html).** Distinguish mandatory
  requirements, recommendations with justified exceptions, and optional
  features. The skill borrows these distinctions while respecting each source's
  own conventions; it does not impose RFC keyword semantics on arbitrary prose.
- **John Klein, Robert Nord, and Forrest Shull, SEI — [Why Architecture
  Conformance Matters for Software Systems](https://www.sei.cmu.edu/library/why-architecture-conformance-matters-for-software-systems/).**
  Connects implementation conformance with intended design and quality goals.
  It also recognizes that divergence can reveal a need to reconsider the
  architecture. This informs substantive alignment and visible unresolved
  conflicts.
- **NASA — [Systems Engineering Handbook, §6.2: Requirements
  Management](https://www.nasa.gov/reference/6-2-requirements-management/).**
  Addresses requirements baselines, traceability, consistency, and the impacts
  of changes. This informs the relationship to an applicable reference and the
  preservation of obligations that a change does not supersede.
- **NASA — [Systems Engineering Handbook, §5.3: Product
  Verification](https://www.nasa.gov/reference/5-3-product-verification/).**
  Relates verification claims to objective evidence and the disposition of
  discrepancies and exceptions. This informs evidence-supported claims and
  explicit limits on claimed alignment.

## License

MIT. The linked sources retain their respective rights; no source text or code
is vendored in this package.
