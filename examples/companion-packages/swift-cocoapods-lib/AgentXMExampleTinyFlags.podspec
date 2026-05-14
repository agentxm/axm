#
# AgentXMExampleTinyFlags — a tiny feature flags library used by the AXM
# companion-package CocoaPods example.
#
# The pod ships an `axm.json` sidecar at the pod root so AXM discovery can
# read package-author recommendations from `Pods/AgentXMExampleTinyFlags/axm.json`
# after `pod install`. The sidecar is declared in `s.preserve_paths` (and also
# matched by `s.source_files`) so CocoaPods copies it during install.
#
# The placeholder `s.source` URL points at `example.com`; this example is
# never actually fetched from a remote — the sibling consumer in
# `../swift-cocoapods-app/` uses `:path => '../swift-cocoapods-lib'` instead.
#
Pod::Spec.new do |s|
  s.name             = "AgentXMExampleTinyFlags"
  s.version          = "0.1.0"
  s.summary          = "A tiny deterministic feature flags library — AXM companion-package example."
  s.description      = <<-DESC
    AgentXMExampleTinyFlags is a small Swift library that demonstrates how a
    CocoaPods package can ship companion AXM extensions for its users via an
    `axm.json` sidecar at the pod root. Boolean flags have a default and an
    optional integer rollout percentage. Variant flags have a list of allowed
    values, a default, and an optional per-variant rollout allocation.
    Rollout bucketing is deterministic per (flag-name, context).
  DESC
  s.homepage         = "https://example.com/agentxm/example-tinyflags-pod"
  s.license          = { :type => "MIT", :text => "MIT — AXM companion-package example." }
  s.author           = { "AgentXM Examples" => "examples@agentxm.example" }
  s.source           = {
    :git => "https://example.com/agentxm/example-tinyflags-pod.git",
    :tag => s.version.to_s
  }

  s.swift_versions         = ["5.10", "6.0"]
  s.ios.deployment_target  = "15.0"
  s.osx.deployment_target  = "14.0"
  s.tvos.deployment_target = "15.0"

  s.source_files     = "Sources/AgentXMExampleTinyFlags/**/*.swift"

  # The `axm.json` sidecar must survive `pod install` so it can be read at
  # `Pods/AgentXMExampleTinyFlags/axm.json`. `preserve_paths` keeps the file
  # in place inside the installed pod tree without trying to compile it.
  s.preserve_paths   = "axm.json"

  s.frameworks       = "Foundation"

  s.test_spec "Tests" do |test_spec|
    test_spec.source_files = "Tests/AgentXMExampleTinyFlagsTests/**/*.swift"
    test_spec.frameworks   = "XCTest"
  end
end
