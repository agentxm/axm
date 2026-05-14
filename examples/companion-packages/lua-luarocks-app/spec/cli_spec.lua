-- Allow the spec to resolve the sibling TinyFlags rock from source without
-- running `luarocks install`. Adjust `package.path` so `require("tinyflags")`
-- and `require("pawmatch.*")` both work when invoked from this project root.
local sibling = "../lua-luarocks-lib/src/?.lua"
package.path = "./src/?.lua;./src/?/init.lua;" .. sibling .. ";" .. package.path

local Cli = require("pawmatch.cli")

local function make_buffer()
  local lines = {}
  return {
    write = function(self, s)
      lines[#lines + 1] = s
      return self
    end,
    value = function()
      return table.concat(lines)
    end,
  }
end

local function run(args)
  local out = make_buffer()
  local err = make_buffer()
  local status = Cli.run(args, { stdout = out, stderr = err })
  return status, out:value(), err:value()
end

describe("pawmatch CLI", function()
  it("prints usage when called without args", function()
    local status, out = run({})
    assert.are.equal(0, status)
    assert.is_truthy(out:find("pawmatch"))
    assert.is_truthy(out:find("Commands:"))
  end)

  it("fees exits zero", function()
    local status, out = run({ "fees" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Adoption fees"))
  end)

  it("browse lists pets", function()
    local status, out = run({ "browse" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Biscuit"))
  end)

  it("browse with species filter excludes other species", function()
    local status, out = run({ "browse", "--species", "cat" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Pepper"))
    assert.is_nil(out:find("Biscuit"))
  end)

  it("browse with unknown species shows empty message", function()
    local status, out = run({ "browse", "--species", "dragon" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("No adoptable pets found"))
  end)

  it("show with known pet prints needs", function()
    local status, out = run({ "show", "pepper" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Pepper"))
    assert.is_truthy(out:find("Needs:"))
  end)

  it("show with unknown pet exits non-zero", function()
    local status, _, err = run({ "show", "nope" })
    assert.are.equal(1, status)
    assert.is_truthy(err:find("Unknown pet"))
  end)

  it("match prints strategy and quiz depth", function()
    local status, out = run({ "match", "--has-kids", "--active" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Strategy:"))
    assert.is_truthy(out:find("Quiz depth:"))
  end)

  it("apply with known pet prints meet-and-greet step", function()
    local status, out = run({ "apply", "biscuit" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Adoption application for Biscuit"))
    assert.is_truthy(out:find("Meet%-and%-greet"))
  end)

  it("apply with unknown pet exits non-zero", function()
    local status, _, err = run({ "apply", "nope" })
    assert.are.equal(1, status)
    assert.is_truthy(err:find("Unknown pet"))
  end)

  it("return-support is supportive", function()
    local status, out = run({ "return-support" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Return support"))
    assert.is_truthy(out:find("No%-judgment"))
  end)

  it("donate lists charities", function()
    local status, out = run({ "donate" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Animal%-welfare charities"))
    assert.is_truthy(out:find("Best Friends"))
  end)

  it("donate with focus filter excludes other focuses", function()
    local status, out = run({ "donate", "--focus", "rescue" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Brother Wolf"))
    assert.is_nil(out:find("Best Friends Animal Society"))
  end)

  it("donate with known slug shows that charity", function()
    local status, out = run({ "donate", "brother-wolf" })
    assert.are.equal(0, status)
    assert.is_truthy(out:find("Brother Wolf"))
  end)

  it("donate with unknown slug exits non-zero", function()
    local status, _, err = run({ "donate", "not-a-charity" })
    assert.are.equal(1, status)
    assert.is_truthy(err:find("Unknown charity"))
  end)

  it("unknown command exits non-zero", function()
    local status, _, err = run({ "teleport" })
    assert.are.equal(1, status)
    assert.is_truthy(err:find("Unknown command"))
  end)
end)
