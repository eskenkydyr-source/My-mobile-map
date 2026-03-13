import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kalamkas.fieldmap',
  appName: 'Қаламқас Карта',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
