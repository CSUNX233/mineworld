import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.csunx233.abysswait',
  appName: '深渊，请等一下',
  webDir: 'dist',
  backgroundColor: '#081725',
  android: { backgroundColor: '#081725', webContentsDebuggingEnabled: false, minWebViewVersion: 107 },
  server: { hostname: 'localhost', androidScheme: 'https', errorPath: 'android-unsupported.html' }
};

export default config;
