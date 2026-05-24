import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Unique reverse-domain app identifier — change the company prefix if needed
  appId: 'com.enterprise.productivity',
  appName: 'PG',

  // Vite builds here — Capacitor bundles this folder into the APK
  webDir: 'dist',

  // Native HTTP requests from the WebView are NOT blocked by CORS
  // because they originate from 'capacitor://localhost' not the server origin.
  server: {
    androidScheme: 'https',   // Use HTTPS scheme inside the WebView on Android
    // Uncomment the line below ONLY during local Wi-Fi development
    // (live-reload — app loads from your dev machine instead of the bundle)
    // url: 'http://192.168.1.100:3001',
    // cleartext: true,
  },

  android: {
    // Allow cleartext HTTP traffic to your backend (needed when the server
    // is on plain HTTP, e.g. your local machine).  Remove for HTTPS-only prod.
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,   // set true only for debugging builds
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0C66E4',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0C66E4',
    },
  },
};

export default config;
