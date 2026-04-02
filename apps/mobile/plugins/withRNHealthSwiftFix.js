const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to fix react-native-health Swift compilation issues on RN 0.76+.
 * The error: "cannot find 'StaticAsyncFunction'/'Constant' in scope"
 * Fix: Set SWIFT_COMPILATION_MODE=wholemodule for all pod targets.
 * Pod name: RNAppleHealthKit (not RNHealth).
 */
function withRNHealthSwiftFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // Don't apply patch twice
      if (contents.includes('RNHEALTH_SWIFT_FIX')) {
        return config;
      }

      const patch = `
# RNHEALTH_SWIFT_FIX — fix StaticAsyncFunction/Constant not in scope (RN 0.76 + New Arch)
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Apply wholemodule compilation to all pods to fix Swift New Architecture interop
      config.build_settings['SWIFT_COMPILATION_MODE'] = 'wholemodule'
      # Suppress warnings that can cause build failures in strict mode
      config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
    end
  end
end
`;

      contents = contents + patch;
      fs.writeFileSync(podfilePath, contents);

      return config;
    },
  ]);
}

module.exports = withRNHealthSwiftFix;
