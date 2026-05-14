cmake_minimum_required(VERSION 3.20)
project(
    agentxm-example-pawmatch
    VERSION 0.1.0
    DESCRIPTION "PawMatch — community pet adoption CLI (C++/Conan example consumer)."
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(agentxm-example-tinyflags REQUIRED)

add_library(pawmatch_core
    src/charities.cpp
    src/cli.cpp
    src/flags.cpp
    src/pets.cpp
    src/variants.cpp
)
target_include_directories(pawmatch_core
    PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_link_libraries(pawmatch_core
    PUBLIC agentxm::example-tinyflags
)

add_executable(pawmatch
    src/main.cpp
)
target_link_libraries(pawmatch
    PRIVATE pawmatch_core
)

option(AGENTXM_PAWMATCH_BUILD_TESTS "Build PawMatch tests" ON)
if(AGENTXM_PAWMATCH_BUILD_TESTS)
    enable_testing()
    find_package(Catch2 3 REQUIRED)
    add_executable(pawmatch_tests
        test/cli_test.cpp
    )
    target_link_libraries(pawmatch_tests
        PRIVATE
            pawmatch_core
            Catch2::Catch2WithMain
    )
    include(CTest)
    include(Catch)
    catch_discover_tests(pawmatch_tests)
endif()
