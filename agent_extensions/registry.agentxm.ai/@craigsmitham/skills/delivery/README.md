# Delivery

Use delivery when a change needs to land on main, reach users, or be confirmed in production. The skill follows the repository’s path through **Implement → Land → Release → Confirm**. Install it with the shared software engineering knowledge bundle.

```sh
axm install @craigsmitham/packs/sdlc
```

| Request | Result |
| --- | --- |
| “Ship this fix.” | The implementer verifies the change, lands it, and follows the release to the requested outcome. |
| “My checks passed before main advanced. Can this land?” | A readiness decision grounded in the intervening changes and the checks that still apply. |
| `$delivery assess our path to production` | An overall summary, a summary for each delivery step, and numbered findings comparing the current state with an acceptable limit and a target. Pick an action beside a finding to investigate or improve it. |
| `$delivery improve our slow pre-push checks` | A scoped workflow improvement with a comparison of cost and verification coverage before and after. |

The model can invoke delivery from an ordinary request. “Where does delivery stall?” and “Shorten the wait before publishing” also select the corresponding process work.

## License

MIT.
