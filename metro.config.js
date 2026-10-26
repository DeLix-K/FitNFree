// Metro config with Sentry's additions, so release builds can upload source maps (readable crash stack traces).
// Source-map upload only runs when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set (see docs/release/sentry-setup.md).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
