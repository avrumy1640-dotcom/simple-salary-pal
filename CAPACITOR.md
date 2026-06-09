# Native iOS/Android via Capacitor

This project is pre-wired for Capacitor so you can ship native builds for App Store / Play Store beta testing (TestFlight, Play Internal Testing).

## One-time setup (local machine)

You can't run `xcode` or Android Studio inside Lovable. Export to GitHub, clone locally, then:

```bash
# 1. Install Capacitor + native shells
npm i @capacitor/core @capacitor/cli
npm i @capacitor/ios @capacitor/android

# 2. Build the web app
npm run build

# 3. Add native projects (one time)
npx cap add ios
npx cap add android

# 4. Sync web build into native projects (every build)
npx cap sync

# 5. Open in IDE
npx cap open ios       # requires macOS + Xcode
npx cap open android   # requires Android Studio
```

## Live-reload against Lovable preview

Edit `capacitor.config.ts`, uncomment the `server.url` line and point it at your preview URL, then `npx cap sync`. Your phone app will load directly from the preview so you can iterate without rebuilding.

## Beta distribution

- **iOS**: Archive in Xcode → upload to App Store Connect → invite testers via TestFlight.
- **Android**: Build > Generate Signed Bundle in Android Studio → upload AAB to Play Console → Internal Testing track.
