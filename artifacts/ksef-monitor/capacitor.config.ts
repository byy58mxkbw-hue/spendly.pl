import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pl.spendly.app",
  appName: "Spendly",
  // Vite buduje do dist/public (patrz vite.config).
  webDir: "dist/public",
  android: {
    // https-scheme — Clerk i cookies zachowują się jak na zwykłej stronie.
    // Origin natywnej appki to wtedy https://localhost (dodany w CORS api-server).
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#FFFFFF",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#FFFFFF",
    },
  },
};

export default config;
