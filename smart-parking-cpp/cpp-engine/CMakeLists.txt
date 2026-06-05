cmake_minimum_required(VERSION 3.20)
project(parking-engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find nlohmann_json (vendored or system)
find_package(nlohmann_json QUIET)
if(NOT nlohmann_json_FOUND)
    message(STATUS "nlohmann_json not found, downloading...")
    include(FetchContent)
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(nlohmann_json)
endif()

# Find curl (for HTTP client in main)
find_package(CURL REQUIRED)

# Collect sources
file(GLOB_RECURSE ENGINE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/src/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/main.cpp"
)

add_executable(parking-engine ${ENGINE_SOURCES})

target_include_directories(parking-engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${nlohmann_json_SOURCE_DIR}/single_include
)

target_link_libraries(parking-engine PRIVATE CURL::libcurl)

# ------------------------------------------------------------
# Tests (optional, requires doctest/doctest.h header)
# ------------------------------------------------------------
option(BUILD_TESTS "Build unit tests" OFF)
if(BUILD_TESTS)
    # Download doctest header-only if not present
    if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/tests/doctest.h")
        message(STATUS "Downloading doctest.h for unit tests...")
        file(DOWNLOAD
            https://raw.githubusercontent.com/doctest/doctest/master/doctest/doctest.h
            "${CMAKE_CURRENT_SOURCE_DIR}/tests/doctest.h"
        )
    endif()

    file(GLOB TEST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_*.cpp")
    foreach(TEST_FILE ${TEST_SOURCES})
        get_filename_component(TEST_NAME ${TEST_FILE} NAME_WE)
        add_executable(${TEST_NAME} ${TEST_FILE} ${ENGINE_SOURCES})
        target_include_directories(${TEST_NAME} PRIVATE
            ${CMAKE_CURRENT_SOURCE_DIR}/include
            ${CMAKE_CURRENT_SOURCE_DIR}/tests
            ${nlohmann_json_SOURCE_DIR}/single_include
        )
        target_link_libraries(${TEST_NAME} PRIVATE CURL::libcurl)
    endforeach()
endif()
