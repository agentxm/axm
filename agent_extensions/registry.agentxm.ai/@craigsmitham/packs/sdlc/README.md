# Software Development Lifecycle

## The software development lifecycle

**Spec → Design → Implement → Test → Deploy → Operate**

These six activities recur throughout a product’s life. Spec establishes the behavior someone needs. Design and Implement turn it into a working change. Test supplies evidence while the change takes shape. Deploy puts a known version in its target environment, and Operate reveals what happens in use. That experience can prompt the next change or show when a service is ready to retire. [The software development lifecycle](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/sdlc/src/software-engineering-lifecycle.md)

## Delivering a software change

**Implement → Land → Release → Confirm**

The implementer follows one change from the first working version to evidence that it solves the problem identified in Spec.

| Step | What the implementer owns |
| --- | --- |
| **Implement** | Build a small change in a checkout, worktree, or temporary branch. Exercise the behavior agreed in Spec. |
| **Land** | Check that the change works with current main, integrate it using the repository’s merge policy, and verify that it reached shared main. |
| **Release** | Deploy or publish the artifact built from a verified main revision. Follow the product’s cadence and rollout controls until the intended audience can use it. |
| **Confirm** | Observe the agreed behavior in use. If a release or observation is pending, identify the remaining step and its owner. |

Verification runs throughout delivery. Choose the fastest path to a confirmed change with sufficient coverage for each decision. Where timing is comparable, prefer lower compute and developer effort. Each repository’s **path to production** supplies the commands, hooks, CI jobs, deployment targets, and observations behind those decisions. Track where changes wait, which checks repeat, and which failures escape to users. [Delivering a software change](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/sdlc/src/release-engineering/foundations/delivering-a-software-change.md)

## Use the pack

```sh
axm install @craigsmitham/packs/sdlc
```

Ask “Can this change land?” or “Ship this fix” and the model can invoke the **delivery** skill directly. Calling `$delivery` uses the same behavior. Use its two named modes to work on the delivery process itself.

- `$delivery assess our path to production` traces a real change. Read the overall summary, scan **Implement → Land → Release → Confirm**, then choose an action beside a numbered finding. Each finding shows the current measure or state, what is acceptable, and the target for improvement. [Example assessment](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/sdlc/src/release-engineering/guides/assessing-the-path-to-production.md#example-assessment)
- `$delivery improve our slow pre-push checks` starts from a baseline and verifies both the time saved and the failures the revised workflow can catch.

Ordinary requests such as “Where are releases waiting?” and “Speed up our pre-push checks” work too.

The shared knowledge bundle supports lookup by activity or by discipline. It covers business analysis, requirements engineering, architecture and design, software testing, release engineering, software operations, and project management. [Knowledge index](https://github.com/craigsmitham/agent-extensions/blob/main/knowledge/sdlc/src/index.md)

## Upgrade from software-engineering

Record your current package versions with `axm list` before switching. The packs require different versions of `delivery`, so remove the old pack before installing SDLC. If installation fails, reinstall your previous pack version. To try SDLC before removing the old pack, use a separate workspace.

```sh
axm uninstall @craigsmitham/packs/software-engineering
axm install @craigsmitham/packs/sdlc
axm knowledge concepts get '@craigsmitham/knowledge/sdlc#release-engineering/foundations/delivering-a-software-change'
```

If you installed the knowledge bundle directly, install `@craigsmitham/knowledge/sdlc`, verify the lookup above, then uninstall `@craigsmitham/knowledge/software-engineering`. In direct concept references, change the bundle identity to `@craigsmitham/knowledge/sdlc` and keep the path after `#`. Check `axm list` for separately installed copies or pins of `delivery`. The SDLC pack needs `delivery` 0.3.x. If your workspace enforces a minimum release age, wait for the new releases to become eligible or add `--ignore-release-age` to the install command to use them immediately.

## License

The pack and skill use MIT. The knowledge bundle identifies the Creative Commons licenses for each section.
