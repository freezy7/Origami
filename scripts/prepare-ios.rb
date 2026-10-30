require 'xcodeproj'
require 'fileutils'
root = File.expand_path('..', __dir__)
path = File.join(root, 'build/ios-simulator/proj/Origami.xcodeproj')
project = Xcodeproj::Project.open(path)
([project] + project.targets).each do |target|
  target.build_configurations.each do |config|
    config.build_settings.delete('EXCLUDED_ARCHS[sdk=iphonesimulator*]')
    config.build_settings['VALID_ARCHS[sdk=iphonesimulator*]'] = 'arm64'
    config.build_settings['ARCHS[sdk=iphonesimulator*]'] = 'arm64'
    config.build_settings['EXCLUDED_ARCHS'] = ''
    config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
    config.build_settings['ARCHS'] = '$(ARCHS_STANDARD)'
  end
end
project.save
puts 'Prepared generated Xcode project for Apple Silicon simulators.'
test_path = File.join(root, 'build/OrigamiSmoke.xcodeproj')
FileUtils.rm_rf(test_path) if File.directory?(test_path)
tests = Xcodeproj::Project.new(test_path)
target = tests.new_target(:ui_test_bundle, 'OrigamiSmoke', :ios, '15.0')
file = tests.main_group.new_file(File.join(root, 'tests/ios/OrigamiSmokeTests.swift'))
target.source_build_phase.add_file_reference(file)
target.build_configurations.each do |config|
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.freezy7.origami.smoke'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['SUPPORTED_PLATFORMS'] = 'iphoneos iphonesimulator'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
end
tests.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.save_as(test_path, 'OrigamiSmoke', true)
puts 'Generated standalone iOS UI smoke test project.'
