#pragma once

#include <agentxm/tinyflags.hpp>

#include <functional>
#include <ostream>
#include <string>
#include <vector>

namespace pawmatch {

using OpenUrlFn = std::function<bool(const std::string& url)>;

bool default_open_url(const std::string& url);

class Cli {
public:
    Cli(std::ostream& out, std::ostream& err);

    Cli& with_context(agentxm::tinyflags::Context ctx);
    Cli& with_open_url(OpenUrlFn fn);

    int run(const std::vector<std::string>& args);

private:
    void write_usage();

    int run_browse(const std::vector<std::string>& args);
    int run_show(const std::vector<std::string>& args);
    int run_match(const std::vector<std::string>& args);
    int run_apply(const std::vector<std::string>& args);
    int run_fees();
    int run_return_support();
    int run_donate(const std::vector<std::string>& args);

    agentxm::tinyflags::Registry flags_;
    agentxm::tinyflags::Context context_;
    std::ostream& out_;
    std::ostream& err_;
    OpenUrlFn open_url_;
};

}  // namespace pawmatch
