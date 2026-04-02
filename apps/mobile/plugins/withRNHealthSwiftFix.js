const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to fix react-native-health Swift compilation issues.
 * Adds SWIFT_COMPILATION_MODE=wholemodule to the RNHealth pod target.
 */
function withRNHealthSwiftFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const patch = `
# Fix react-native-health Swift compilation (StaticAsyncFunction/Constant not in scope)
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'RNHealth'
      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_COMPILATION_MODE'] = 'wholemodule'
        build_config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
      end
    end
  end
end
`;

      if (!contents.includes('RNHealth')) {
        contents = contents + patch;
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
}

module.exports = withRNHealthSwiftFix;
