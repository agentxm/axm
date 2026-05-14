Gem::Specification.new do |spec|
  spec.name          = "agentxm-example-pawmatch"
  spec.version       = "0.1.0"
  spec.summary       = "Tiny community pet-adoption CLI demonstrating consumption of agentxm-example-tinyflags."
  spec.description   = "Reference Ruby consumer of the agentxm-example-tinyflags gem. Not packable — exists to demonstrate consumption."
  spec.authors       = ["AgentXM"]
  spec.email         = ["noreply@agentxm.ai"]
  spec.license       = "MIT"
  spec.homepage      = "https://github.com/agentxm/axm"
  spec.required_ruby_version = ">= 3.3"

  spec.files = Dir["lib/**/*.rb", "bin/*", "README.md", "agentxm-example-pawmatch.gemspec"]
  spec.bindir = "bin"
  spec.executables = ["pawmatch"]
  spec.require_paths = ["lib"]

  spec.metadata = {
    "homepage_uri"               => "https://github.com/agentxm/axm",
    "source_code_uri"            => "https://github.com/agentxm/axm",
    "rubygems_mfa_required"      => "true",
    "axm_recommended_extensions" => "[@examples/skills/ruby-rubygems-pawmatch-find-a-pet@^0.1.0]"
  }

  spec.add_runtime_dependency "agentxm-example-tinyflags", "0.1.0"

  spec.add_development_dependency "minitest", "~> 5.18"
  spec.add_development_dependency "rake", "~> 13.0"
end
