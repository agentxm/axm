cmake_minimum_required(VERSION 3.20)
project(
    agentxm-example-tinyflags
    VERSION 0.1.0
    DESCRIPTION "Tiny feature-flag library used by AXM companion package examples."
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(AGENTXM_TINYFLAGS_BUILD_TESTS "Build TinyFlags tests" OFF)

add_library(agentxm-example-tinyflags
    src/tinyflags.cpp
)
target_include_directories(agentxm-example-tinyflags
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)
add_library(agentxm::example-tinyflags ALIAS agentxm-example-tinyflags)

include(GNUInstallDirs)
install(TARGETS agentxm-example-tinyflags
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
install(DIRECTORY include/ DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

if(AGENTXM_TINYFLAGS_BUILD_TESTS)
    enable_testing()
    find_package(Catch2 3 REQUIRED)
    add_executable(tinyflags_tests
        test/tinyflags_test.cpp
    )
    target_link_libraries(tinyflags_tests
        PRIVATE
            agentxm::example-tinyflags
            Catch2::Catch2WithMain
    )
    include(CTest)
    include(Catch)
    catch_discover_tests(tinyflags_tests)
endif()
