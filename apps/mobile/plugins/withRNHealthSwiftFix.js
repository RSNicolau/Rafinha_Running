const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to fix react-native-health Swift compilation on RN 0.76+ / New Architecture.
 * Error: "cannot find 'StaticAsyncFunction'/'Constant' in scope"
 *
 * Strategy: insert SWIFT_COMPILATION_MODE=wholemodule INSIDE the existing post_install block
 * that react-native-expo-build creates. Two separate post_install blocks in Ruby only run the last.
 */
function withRNHealthSwiftFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // Don't patch twice
      if (contents.includes('RNHEALTH_SWIFT_FIX')) {
        return config;
      }

      // Insert our fix BEFORE the closing end of the react_native_post_install block
      // The existing post_install ends with the CODE_SIGNING_ALLOWED block followed by "  end\nend"
      const insertAfter = `        end
      end
    end
  end
end`;

      const patch = `        end
      end
    end
  end

  # RNHEALTH_SWIFT_FIX — fix StaticAsyncFunction/Constant not in scope (RN 0.76 + New Arch)
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_COMPILATION_MODE'] = 'wholemodule'
      config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
    end
  end
end`;

      if (contents.includes(insertAfter)) {
        contents = contents.replace(insertAfter, patch);
        fs.writeFileSync(podfilePath, contents);
      } else {
        // Fallback: if the exact pattern is not found, append a second post_install
        // (This may not work on all CocoaPods versions but is better than nothing)
        const fallback = `
# RNHEALTH_SWIFT_FIX — fix StaticAsyncFunction/Constant not in scope
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_COMPILATION_MODE'] = 'wholemodule'
      config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
    end
  end
end
`;
        contents = contents + fallback;
        fs.writeFileSync(podfilePath, contents);
      }

      return config;
    },
  ]);
}

module.exports = withRNHealthSwiftFix;
