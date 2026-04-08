import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cornerpos.app",
  appName: "CornerPOS",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {},
};

export default config;
