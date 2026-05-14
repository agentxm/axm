# Gem TinyFlags

This example shows how a RubyGems gem can ship companion AXM extensions for
its users. The gem is a small Ruby feature flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The gem
itself uses the RubyGems name `agentxm-example-tinyflags`.

The gemspec metadata embeds AXM recommendations as a stringified array
literal — this is the format the AXM gem-detector reader parses:

```ruby
spec.metadata = {
  "axm_recommended_extensions" => "[@examples/packs/gem-tinyflags@^0.1.0]"
}
```

When this gem is installed in another project, `axm discover` can read that
metadata from the installed gemspec and surface the companion pack as a
package-author recommendation.

A working consumer is in `../gem-app/` (the `pawmatch` CLI).

## Package

Targets Ruby 2.6+. Tests use Minitest via Rake.

```bash
bundle install
bundle exec rake test
```

Without Bundler:

```bash
ruby -Ilib -Itest test/tiny_flags_test.rb
```

Building and publishing:

```bash
# Build the gem locally:
gem build agentxm-example-tinyflags.gemspec

# TODO: configure RubyGems publishing for agentxm-example-tinyflags,
# then run:
# gem push agentxm-example-tinyflags-0.1.0.gem
```

The library lives in `lib/tiny_flags.rb` and exposes:

- `TinyFlags::BooleanFlag.new(default:, rollout:)`
- `TinyFlags::VariantFlag.new(variants:, default:, rollout:)`
- `TinyFlags::Registry.new(definitions)` — `enabled?(name, context)`,
  `variant(name, context)`, `evaluate(name, context)`

Flag instances are frozen and validate inputs on construction. Bucketing is
deterministic by `:user_id`, `:account_id`, or `:session_id` from the
evaluation context Hash.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                             |
| -------- | ----------------------------------------------- |
| Skill    | `@examples/skills/gem-tinyflags-add-flag`       |
| Skill    | `@examples/skills/gem-tinyflags-rollout-review` |
| Skill    | `@examples/skills/gem-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/gem-tinyflags-maintainer`  |
| Pack     | `@examples/packs/gem-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:gem/agentxm-example-tinyflags@^0.1.0` as its companion package.

## Scenario

A RubyGems author can use this layout as a model:

1. Implement the normal Ruby gem.
2. Embed package-native AXM metadata in the gemspec `metadata` hash under the
   `axm_recommended_extensions` key (stringified array literal).
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
