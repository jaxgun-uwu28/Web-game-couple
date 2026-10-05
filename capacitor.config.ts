import type { CapacitorConfig } from "@capacitor/cli";
const deployed =
  process.env.ARCADE_APP_URL || "https://web-game-couple.vercel.app/";
if (
  deployed &&
  (!deployed.startsWith("https://") || new URL(deployed).pathname !== "/")
)
  throw new Error(
    "ARCADE_APP_URL must be the HTTPS origin of your deployed app.",
  );
const config: CapacitorConfig = {
  appId: "com.ourlittlearcade.app",
  appName: "Our Little Arcade",
  webDir: "native-shell",
  server: deployed
    ? { url: deployed, cleartext: false, errorPath: "offline.html" }
    : undefined,
  android: { backgroundColor: "#fff8f3" },
  plugins: {
    SplashScreen: {
      backgroundColor: "#f8c9d8",
      launchShowDuration: 1200,
      launchAutoHide: true,
    },
    StatusBar: { backgroundColor: "#f8c9d8", style: "LIGHT" },
    PushNotifications: { presentationOptions: ["sound", "alert"] },
  },
};
export default config;
