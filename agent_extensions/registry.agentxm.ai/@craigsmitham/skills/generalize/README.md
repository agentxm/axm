# generalize

Generalize a codebase or a specified part to support a broader, coherent family of cases.

A concise, reusable prompt that defines the desired outcome and leaves the
method to the caller and model. The [skill](src/SKILL.md) emphasizes essential
properties, required behavior for existing cases, simplicity of use, and an
extent of generality determined by intended reuse.

## Usage

Invoke it with a codebase, component, or concern; include intended reuse when
known. For example:

```text
$generalize this codebase
$generalize src/importers/ so the import logic can serve other record types
$generalize the retry behavior shared by our service clients
```

## Sources and inspiration

The wording is an original synthesis of these perspectives, rather than a
quotation or a prescribed implementation of any one author's method:

- **Bertrand Meyer — [From Structured Programming to Object-Oriented Design:
  The Road to Eiffel, §3.6](https://se.inf.ethz.ch/~meyer/publications/structured/road.pdf).**
  Generalization develops a working component for reuse beyond the project
  that first needed it. This supplies the skill's central purpose.
- **David Musser and Alexander Stepanov — [Generic Programming, especially
  §5](https://stepanovpapers.com/genprog.pdf).** General algorithms emerge from
  concrete ones by identifying the assumptions needed for their guarantees.
  This informs the emphasis on essential properties and preserved behavior.
- **David Parnas — [Designing Software for Ease of Extension and
  Contraction](https://users.ece.utexas.edu/~perry/education/SE-Intro/parnas.pdf).**
  Program families have common aspects and meaningful variations, including
  subsets and extensions. This informs the broader family of related cases.
- **John Ousterhout — [Modular Design](https://web.stanford.edu/~ouster/cgi-bin/cs190-winter18/lecture.php?topic=modularDesign).**
  Somewhat general-purpose interfaces can serve other uses while remaining
  simple and convenient for current needs. This informs simplicity of use.
- **Martin Fowler — [Yagni](https://martinfowler.com/bliki/Yagni.html).**
  Speculative capabilities carry costs; making software easier to change
  remains worthwhile. This informs the boundary set by intended reuse.
- **Sandi Metz — [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction).**
  Shared code can entangle distinct ideas as it accumulates exceptions.
  This informs the requirement that the family of cases be coherent.

These perspectives differ in how much generality they encourage. The skill
leaves that judgment to the caller and model, along with techniques,
sequencing, and verification.

## License

MIT. The linked sources retain their respective rights; no source text or code
is vendored in this package.
