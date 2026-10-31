# prune

Prune a codebase or a specified part by removing unnecessary elements and their associated maintenance burden.

Use this skill when obsolete, unused, redundant, or superseded elements have
accumulated. The concise [skill](src/SKILL.md) defines purposeful contraction
and the integrity of what remains, leaving the method to the caller and model.

## Usage

Name the scope and any relevant limits on what must remain supported. For example:

```text
$prune this codebase while preserving all supported capabilities
$prune src/importers/ after the completed retirement of the legacy format
$prune obsolete build and release configuration
```

## Philosophy

Pruning reduces the software and supporting machinery that must be understood,
maintained, and operated. Its value is a coherent remaining system with less
maintenance burden. Line count alone is an inadequate measure: compressing code
or moving complexity elsewhere can leave the same obligations and costs.

An element is expendable in relation to intended purpose and live obligations.
Low usage, age, or an absence of local references does not establish that it is
unnecessary. External consumers, recovery paths, compatibility commitments, and
infrequent supported cases can still depend on it. Removal of an element must
preserve any obligation that remains live.

Removing unnecessary implementation can preserve existing behavior. Retiring a
capability changes what the system promises to support; the user's intent and
remaining obligations determine whether that contraction is in scope. A broad
request to prune does not by itself establish that a supported capability may
be retired.

Removal can also make associated dependencies, configuration, tests,
documentation, and delivery machinery unnecessary. Those elements belong in the
same consideration when their sole purpose has ended. Shared support remains
necessary wherever retained capabilities still require it.

The skill favors deletion and the simplification it enables. It specifies the
desired outcome without prescribing discovery tools, removal sequences,
verification methods, or a reporting template. A scope with nothing expendable
does not require a change merely to produce a smaller diff or codebase.

## Sources and inspiration

The wording is an original synthesis of these perspectives; the skill does not
incorporate their procedures as a required workflow.

- **David Parnas — [Designing Software for Ease of Extension and
  Contraction](https://users.ece.utexas.edu/~perry/education/SE-Intro/parnas.pdf).**
  Treats useful subsets and removal of unneeded capabilities as design concerns.
  This supplies the central idea of purposeful contraction and a coherent
  remaining system.
- **SWEBOK — [Software Maintenance](https://swebokwiki.org/Chapter_5:_Software_Maintenance),
  especially “Definitions and Terminology” and “Categories of Maintenance.”**
  Frames maintenance around modifying software while preserving its integrity,
  with perfective maintenance addressing qualities such as maintainability.
  This informs reduced maintenance burden and preservation of live obligations.
- **Martin Fowler — [Refactoring](https://refactoring.com/) and the
  [Catalog of Refactorings](https://refactoring.com/catalog/).** Describes
  restructuring that preserves observable behavior. The catalog includes
  Remove Dead Code, Collapse Hierarchy, and Remove Middle Man. This informs
  removal of unnecessary implementation while retaining required behavior;
  these techniques remain examples rather than prescribed steps.
- **SWEBOK — [Software Maintenance: Retirement](https://swebokwiki.org/Chapter_5:_Software_Maintenance#Retirement).**
  Addresses the end of software's useful life, including retirement impact,
  replacement, and access to archived data. This informs the distinction between
  removing unnecessary implementation and ending a capability's obligations.

## License

MIT. The linked sources retain their respective rights; no source text or code
is vendored in this package.
