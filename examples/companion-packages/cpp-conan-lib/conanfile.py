from conan import ConanFile
from conan.tools.cmake import CMake, CMakeToolchain, cmake_layout
from conan.tools.files import copy


class AgentxmExampleTinyflagsConan(ConanFile):
    name = "agentxm-example-tinyflags"
    version = "0.1.0"
    license = "MIT"
    url = "https://github.com/agentxm/axm-b"
    homepage = "https://github.com/agentxm/axm-b"
    description = (
        "Tiny feature-flag library used by AXM companion package examples."
    )
    topics = ("feature-flags", "tinyflags", "axm")

    settings = "os", "compiler", "build_type", "arch"
    options = {"shared": [True, False], "fPIC": [True, False]}
    default_options = {"shared": False, "fPIC": True}

    exports_sources = (
        "CMakeLists.txt",
        "include/*",
        "src/*",
        "test/*",
        "conandata.yml",
        "LICENSE",
        "README.md",
    )

    def config_options(self):
        if self.settings.os == "Windows":
            del self.options.fPIC

    def build_requirements(self):
        # Catch2 is only needed when running the in-package tests.
        self.test_requires("catch2/3.5.2")

    def layout(self):
        cmake_layout(self)

    def generate(self):
        tc = CMakeToolchain(self)
        tc.cache_variables["AGENTXM_TINYFLAGS_BUILD_TESTS"] = "ON"
        tc.generate()

    def build(self):
        cmake = CMake(self)
        cmake.configure()
        cmake.build()
        if not self.conf.get("tools.build:skip_test", default=False, check_type=bool):
            cmake.test()

    def package(self):
        copy(self, "LICENSE", self.source_folder, self.package_folder)
        cmake = CMake(self)
        cmake.install()

    def package_info(self):
        self.cpp_info.libs = ["agentxm-example-tinyflags"]
        self.cpp_info.set_property("cmake_file_name", "agentxm-example-tinyflags")
        self.cpp_info.set_property(
            "cmake_target_name", "agentxm::example-tinyflags"
        )
