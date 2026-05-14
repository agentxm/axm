defmodule AgentXM.Examples.TinyFlags.MixProject do
  use Mix.Project

  @version "0.1.0"
  @source_url "https://github.com/agentxm/axm-b"

  def project do
    [
      app: :agentxm_example_tinyflags,
      version: @version,
      elixir: "~> 1.16",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      description: description(),
      package: package(),
      name: "AgentXM Example TinyFlags",
      source_url: @source_url
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps, do: []

  defp description do
    "Tiny feature flags library used by AXM companion package examples."
  end

  defp package do
    [
      name: "agentxm_example_tinyflags",
      maintainers: ["AgentXM Examples"],
      licenses: ["MIT"],
      links: %{"GitHub" => @source_url},
      # Ship the `axm.json` sidecar in the published Hex tarball so consumers
      # see it at `deps/agentxm_example_tinyflags/axm.json` after `mix deps.get`.
      files: ~w(lib mix.exs README.md axm.json)
    ]
  end
end
