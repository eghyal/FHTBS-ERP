import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pavingjoss.erpmobile",
  appName: "Paving Joss Mobile",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  plugins: {
    Preferences: {
      group: "PavingJossMobileStorage",
    },
  },
};

export default config;
