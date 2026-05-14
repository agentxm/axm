local tinyflags = require("tinyflags")

describe("BooleanFlag", function()
  it("returns the default when there is no rollout", function()
    local flags = tinyflags.Registry({
      ["checkout-redesign"] = tinyflags.BooleanFlag({ default = true }),
    })
    assert.is_true(flags:is_enabled("checkout-redesign", { user_id = "user-1" }))
  end)

  it("treats rollout = 0 as off for everyone", function()
    local flags = tinyflags.Registry({
      experiment = tinyflags.BooleanFlag({ default = false, rollout = 0 }),
    })
    assert.is_false(flags:is_enabled("experiment", { user_id = "user-1" }))
    assert.is_false(flags:is_enabled("experiment", { user_id = "user-42" }))
  end)

  it("treats rollout = 100 as on for everyone", function()
    local flags = tinyflags.Registry({
      experiment = tinyflags.BooleanFlag({ default = false, rollout = 100 }),
    })
    assert.is_true(flags:is_enabled("experiment", { user_id = "user-1" }))
    assert.is_true(flags:is_enabled("experiment", { user_id = "user-42" }))
  end)

  it("is deterministic per context", function()
    local flags = tinyflags.Registry({
      experiment = tinyflags.BooleanFlag({ default = false, rollout = 50 }),
    })
    local ctx = { user_id = "user-1" }
    local first = flags:is_enabled("experiment", ctx)
    local second = flags:is_enabled("experiment", ctx)
    local third = flags:is_enabled("experiment", ctx)
    assert.are.equal(first, second)
    assert.are.equal(first, third)
  end)

  it("approximately honors a 50% rollout boundary over many contexts", function()
    local flags = tinyflags.Registry({
      experiment = tinyflags.BooleanFlag({ default = false, rollout = 50 }),
    })
    local on_count = 0
    for i = 0, 199 do
      if flags:is_enabled("experiment", { user_id = "user-" .. i }) then
        on_count = on_count + 1
      end
    end
    assert.is_true(on_count >= 70)
    assert.is_true(on_count <= 130)
  end)
end)

describe("VariantFlag", function()
  it("returns the default when there is no rollout", function()
    local flags = tinyflags.Registry({
      ["search-ranking"] = tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
      }),
    })
    assert.are.equal("classic", flags:variant("search-ranking", { user_id = "user-1" }))
  end)

  it("returns the default when allocation is 0", function()
    local flags = tinyflags.Registry({
      ["search-ranking"] = tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
        rollout = { semantic = 0 },
      }),
    })
    assert.are.equal("classic", flags:variant("search-ranking", { user_id = "user-1" }))
  end)

  it("returns the variant with full allocation", function()
    local flags = tinyflags.Registry({
      ["search-ranking"] = tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
        rollout = { semantic = 100 },
      }),
    })
    assert.are.equal("semantic", flags:variant("search-ranking", { user_id = "user-1" }))
  end)

  it("is deterministic per context", function()
    local flags = tinyflags.Registry({
      ["search-ranking"] = tinyflags.VariantFlag({
        variants = { "classic", "semantic", "personalized" },
        default = "classic",
        rollout = { semantic = 33, personalized = 33 },
      }),
    })
    local ctx = { user_id = "user-1" }
    assert.are.equal(
      flags:variant("search-ranking", ctx),
      flags:variant("search-ranking", ctx)
    )
  end)
end)

describe("Validation", function()
  it("rejects boolean rollout above 100", function()
    assert.has_error(function()
      tinyflags.BooleanFlag({ default = false, rollout = 101 })
    end)
  end)

  it("rejects negative boolean rollout", function()
    assert.has_error(function()
      tinyflags.BooleanFlag({ default = false, rollout = -1 })
    end)
  end)

  it("rejects boolean rollout that is not a number", function()
    assert.has_error(function()
      tinyflags.BooleanFlag({ default = false, rollout = true })
    end)
  end)

  it("requires at least one variant", function()
    assert.has_error(function()
      tinyflags.VariantFlag({ variants = {}, default = "classic" })
    end)
  end)

  it("requires the default to be one of the variants", function()
    assert.has_error(function()
      tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "personalized",
      })
    end)
  end)

  it("rejects variant rollout totals above 100", function()
    assert.has_error(function()
      tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
        rollout = { semantic = 80, classic = 30 },
      })
    end)
  end)

  it("rejects unknown variants in rollout", function()
    assert.has_error(function()
      tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
        rollout = { personalized = 10 },
      })
    end)
  end)

  it("raises when looking up an unknown flag", function()
    local flags = tinyflags.Registry({})
    assert.has_error(function()
      flags:is_enabled("missing")
    end)
  end)

  it("evaluate dispatches on kind", function()
    local flags = tinyflags.Registry({
      ["checkout-redesign"] = tinyflags.BooleanFlag({ default = true }),
      ["search-ranking"] = tinyflags.VariantFlag({
        variants = { "classic", "semantic" },
        default = "classic",
      }),
    })
    assert.is_true(flags:evaluate("checkout-redesign"))
    assert.are.equal("classic", flags:evaluate("search-ranking"))
  end)
end)
