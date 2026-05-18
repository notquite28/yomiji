const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin that enables Android predictive back gesture support
 * (Android 13+). Sets android:enableOnBackInvokedCallback="true" on the
 * <application> element in AndroidManifest.xml.
 *
 * Once Expo SDK ships the built-in `predictiveBackGestureEnabled` config
 * option (tracked in https://github.com/expo/expo/pull/38774), this plugin
 * can be removed in favor of the native config.
 */
function withPredictiveBackGesture(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:enableOnBackInvokedCallback'] = 'true';
    }
    return config;
  });
}

module.exports = withPredictiveBackGesture;
