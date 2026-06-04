const { withProjectBuildGradle, withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidBackgroundFix(config) {
  // 1. Force androidx.core:core:1.13.1 globally in project build.gradle
  config = withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('force "androidx.core:core:1.13.1"')) {
      config.modResults.contents += `\n
allprojects {
    configurations.all {
        resolutionStrategy {
            force "androidx.core:core:1.13.1"
            force "androidx.core:core-ktx:1.13.1"
        }
    }
}\n`;
    }
    return config;
  });

  // 2. Add explicit app dependency in app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("implementation('androidx.core:core:1.13.1')")) {
      config.modResults.contents = config.modResults.contents.replace(
        /dependencies\s*\{/,
        "dependencies {\n    implementation('androidx.core:core:1.13.1')"
      );
    }
    return config;
  });

  // 3. Modify AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    // Disable auto-backup so AsyncStorage (saved device IP) is not restored
    // from cloud backup after reinstall — otherwise fresh installs skip Setup.
    app.$['android:allowBackup'] = 'false';

    // Ensure cleartext traffic is enabled
    app.$['android:usesCleartextTraffic'] = 'true';

    // Add FOREGROUND_SERVICE_DATA_SYNC permission
    const usesPermissions = manifest.manifest['uses-permission'] || [];
    if (!usesPermissions.find((p) => p.$['android:name'] === 'android.permission.FOREGROUND_SERVICE_DATA_SYNC')) {
      usesPermissions.push({ $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_DATA_SYNC' } });
      manifest.manifest['uses-permission'] = usesPermissions;
    }

    // Add RNBackgroundActionsTask service
    const services = app.service || [];
    if (!services.find((s) => s.$['android:name'] === 'com.asterinet.react.bgactions.RNBackgroundActionsTask')) {
      services.push({
        $: {
          'android:name': 'com.asterinet.react.bgactions.RNBackgroundActionsTask',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false'
        }
      });
      app.service = services;
    }

    return config;
  });

  return config;
};
