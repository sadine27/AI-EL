cmake_minimum_required(VERSION 3.20)
project(parking-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find nlohmann_json (vendored or system)
find_package(nlohmann_json QUIET)
if(NOT nlohmann_json_FOUND)
    message(STATUS "nlohmann_json not found, downloading...")
    include(FetchContent)
    # Don't build nlohmann_json's own test/example targets — we only need the
    # header. This also keeps its test main.cpp files out of our build graph.
    set(JSON_BuildTests OFF CACHE INTERNAL "")
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(nlohmann_json)
endif()

# NOTE: the engine ships a self-contained HTTP server built on the platform
# sockets API (winsock2 on Windows, BSD sockets elsewhere) — see main.cpp — and
# does NOT use libcurl. No external HTTP client dependency is required.

# Collect sources.
# IMPORTANT: use a NON-recursive glob restricted to src/ for the engine library,
# and add main.cpp explicitly. A GLOB_RECURSE rooted at the project dir would also
# sweep up stray main.cpp files under build/_deps (e.g. nlohmann_json's own tests)
# and break the build. ENGINE_LIB_SOURCES is the reusable engine (no entry point);
# the server executable adds main.cpp, while unit tests provide their own main.
file(GLOB ENGINE_LIB_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp")

# Compile the reusable engine sources exactly once into an OBJECT library, then
# link both the server executable and every unit test against it. This avoids
# recompiling all of src/ separately for each of the 7 test targets. The PUBLIC
# include dirs propagate to anything that links engine_obj.
add_library(engine_obj OBJECT ${ENGINE_LIB_SOURCES})
target_include_directories(engine_obj PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${nlohmann_json_SOURCE_DIR}/single_include
)

add_executable(parking-engine "${CMAKE_CURRENT_SOURCE_DIR}/main.cpp")
target_link_libraries(parking-engine PRIVATE engine_obj)

# Link the platform socket library where the linker needs it explicitly.
if(WIN32)
    target_link_libraries(parking-engine PRIVATE ws2_32)
endif()

# On MinGW, statically link the GCC/libstdc++/winpthread runtimes so the produced
# binaries run without mingw64/bin on PATH (also what makes ctest find them).
if(MINGW)
    target_link_options(parking-engine PRIVATE -static -static-libgcc -static-libstdc++)
endif()

# ------------------------------------------------------------
# Tests (optional, requires doctest/doctest.h header)
# ------------------------------------------------------------
option(BUILD_TESTS "Build unit tests" OFF)
if(BUILD_TESTS)
    # Download the doctest single header if missing or empty (a previous failed
    # download could leave a 0-byte file). Pin to a release tag and verify the
    # transfer so the build fails loudly instead of producing broken test objects.
    set(DOCTEST_HEADER "${CMAKE_CURRENT_SOURCE_DIR}/tests/doctest.h")
    if(EXISTS "${DOCTEST_HEADER}")
        file(SIZE "${DOCTEST_HEADER}" DOCTEST_SIZE)
    else()
        set(DOCTEST_SIZE 0)
    endif()
    if(DOCTEST_SIZE EQUAL 0)
        message(STATUS "Downloading doctest.h (v2.4.11) for unit tests...")
        file(DOWNLOAD
            https://raw.githubusercontent.com/doctest/doctest/v2.4.11/doctest/doctest.h
            "${DOCTEST_HEADER}"
            TLS_VERIFY ON
            STATUS DOCTEST_DL_STATUS
        )
        list(GET DOCTEST_DL_STATUS 0 DOCTEST_DL_CODE)
        if(NOT DOCTEST_DL_CODE EQUAL 0)
            file(REMOVE "${DOCTEST_HEADER}")
            message(FATAL_ERROR "Failed to download doctest.h: ${DOCTEST_DL_STATUS}")
        endif()
    endif()

    enable_testing()
    file(GLOB TEST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_*.cpp")
    foreach(TEST_FILE ${TEST_SOURCES})
        get_filename_component(TEST_NAME ${TEST_FILE} NAME_WE)
        # Link tests against the shared engine objects (NOT main.cpp) — each
        # test file generates its own entry point via
        # DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN. engine_obj's PUBLIC include dirs
        # (include/ + nlohmann) propagate automatically; we only add tests/ for
        # doctest.h.
        add_executable(${TEST_NAME} ${TEST_FILE})
        target_link_libraries(${TEST_NAME} PRIVATE engine_obj)
        target_include_directories(${TEST_NAME} PRIVATE
            ${CMAKE_CURRENT_SOURCE_DIR}/tests
        )
        if(WIN32)
            target_link_libraries(${TEST_NAME} PRIVATE ws2_32)
        endif()
        if(MINGW)
            target_link_options(${TEST_NAME} PRIVATE -static -static-libgcc -static-libstdc++)
        endif()
        add_test(NAME ${TEST_NAME} COMMAND $<TARGET_FILE:${TEST_NAME}>)
    endforeach()
endif()
