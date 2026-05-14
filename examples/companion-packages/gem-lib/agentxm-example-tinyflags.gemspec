Gem::Specification.new do |spec|
  spec.name          = "agentxm-example-tinyflags"
  spec.version       = "0.1.0"
  spec.summary       = "Tiny feature flags library used by AXM companion package examples."
  spec.description   = "A minimal feature-flags library demonstrating boolean and variant flags with deterministic rollout bucketing."
  spec.authors       = ["AgentXM"]
  spec.email         = ["noreply@agentxm.ai"]
  spec.license       = "MIT"
  spec.homepage      = "https://github.com/agentxm/axm"
  spec.required_ruby_version = ">= 2.6"

  spec.files = Dir["lib/**/*.rb", "README.md", "agentxm-example-tinyflags.gemspec"]
  spec.require_paths = ["lib"]

  spec.metadata = {
    "homepage_uri"                 => "https://github.com/agentxm/axm",
    "source_code_uri"              => "https://github.com/agentxm/axm",
    "rubygems_mfa_required"        => "true",
    "axm_recommended_extensions"   => "[@examples/packs/gem-tinyflags@^0.1.0]"
  }

  spec.add_development_dependency "minitest", "~> 5.18"
  spec.add_development_dependency "rake", "~> 13.0"
end
