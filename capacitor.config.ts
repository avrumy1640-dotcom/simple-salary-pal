import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.paystream',
  appName: 'Paystream',
  webDir: 'dist',
  server: {
    // For live-reload against the Lovable preview during development,
    // replace `url` with your project preview URL and set cleartext to true.
    // url: 'https://id-preview--<project-id>.lovable.app',
    // cleartext: true,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#F5F1E8',
  },
};

export default config;
