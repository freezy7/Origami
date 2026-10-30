cmake_minimum_required(VERSION 3.8)

set(CMAKE_SYSTEM_NAME iOS)
set(APP_NAME "Origami"  CACHE STRING "Project Name")

project(${APP_NAME} CXX)

set(CC_PROJECT_DIR ${CMAKE_CURRENT_LIST_DIR})
set(CC_UI_RESOURCES)
set(CC_PROJ_SOURCES)
set(CC_ASSET_FILES)
set(CC_COMMON_SOURCES)
set(CC_ALL_SOURCES)

include(${CC_PROJECT_DIR}/../common/CMakeLists.txt)
set(EXECUTABLE_NAME ${APP_NAME}-mobile)

cc_ios_before_target(${EXECUTABLE_NAME})
add_executable(${EXECUTABLE_NAME} ${CC_ALL_SOURCES})
cc_ios_after_target(${EXECUTABLE_NAME})

# Clang 21 promotes the bundled Enoki half-type trait specializations to errors.
# Keep the diagnostic visible while allowing the editor's existing dependency to compile.
if(CMAKE_CXX_COMPILER_ID STREQUAL "AppleClang" AND CMAKE_CXX_COMPILER_VERSION VERSION_GREATER_EQUAL 21)
    target_compile_options(cocos_engine PRIVATE -Wno-error=invalid-specialization)
endif()

# Select the editor's bundled simulator libraries locally; never patch the installed engine.
option(ORIGAMI_SIMULATOR "Build for Apple Silicon iOS Simulator" OFF)
if(ORIGAMI_SIMULATOR)
    get_property(_origami_imports DIRECTORY PROPERTY IMPORTED_TARGETS)
    foreach(_origami_target IN LISTS _origami_imports)
        get_target_property(_origami_location ${_origami_target} IMPORTED_LOCATION)
        if(_origami_location)
            string(REPLACE "/external/ios/" "/external/ios-m1-simulator/" _origami_sim_location "${_origami_location}")
            if(EXISTS "${_origami_sim_location}")
                set_target_properties(${_origami_target} PROPERTIES IMPORTED_LOCATION "${_origami_sim_location}")
            endif()
        endif()
    endforeach()
    set(CMAKE_XCODE_ATTRIBUTE_EXCLUDED_ARCHS[sdk=iphonesimulator*] "")
    set(CMAKE_XCODE_ATTRIBUTE_ARCHS[sdk=iphonesimulator*] "arm64")
    set(CMAKE_XCODE_ATTRIBUTE_VALID_ARCHS[sdk=iphonesimulator*] "arm64")
    set_target_properties(${EXECUTABLE_NAME} PROPERTIES OSX_ARCHITECTURES "arm64")
endif()
