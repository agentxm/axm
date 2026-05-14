# frozen_string_literal: true

# Allow tests to resolve the sibling TinyFlags gem from source without
# running `bundle install`.
sibling_lib = File.expand_path("../../gem-lib/lib", __dir__)
$LOAD_PATH.unshift(sibling_lib) unless $LOAD_PATH.include?(sibling_lib)

require "minitest/autorun"
require "pawmatch/cli"
