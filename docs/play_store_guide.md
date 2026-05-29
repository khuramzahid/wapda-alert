# Publishing WAPDA Alert to the Google Play Store

## Prerequisites

Before you begin, make sure you have:

- [x] An Expo project with `android/` directory committed (you just un-gitignored it ✅)
- [ ] A **Google Play Developer Account** ($25 one-time fee) → [Register here](https://play.google.com/console/signup)
- [ ] An **Expo account** → [Sign up free](https://expo.dev/signup)
- [ ] App icon (`assets/icon.png`) — 1024×1024 px
- [ ] Feature graphic — 1024×500 px (required for Play Store listing)
- [ ] At least 2 screenshots of the app (phone-sized)

---

## Step 1 — Prepare `app.json` for Production

Update your [app.json](file:///home/aisha/Documents/ESP8266/wapda-alert/app/app.json) with production-ready values:

```jsonc
{
  "expo": {
    "name": "WAPDA Alert",
    "slug": "wapda-alert",
    "version": "1.0.0",       // ← Increment for each release
    "android": {
      "package": "com.wapdaalert.app",  // ← Already set ✅
      "versionCode": 1,                  // ← ADD THIS: increment for each upload
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0a0e1a"
      }
    }
    // ... rest stays the same
  }
}
```

> [!IMPORTANT]
> `versionCode` must be incremented for **every** upload to the Play Store. Google rejects uploads with a duplicate `versionCode`.

---

## Step 2 — Configure Production Build in `eas.json`

Your [eas.json](file:///home/aisha/Documents/ESP8266/wapda-alert/app/eas.json) already has a `production` profile, but it needs to be configured to produce an AAB (Android App Bundle — required by Play Store):

```jsonc
{
  "build": {
    "development": { ... },
    "preview": { ... },
    "production": {
      "android": {
        "buildType": "app-bundle"   // ← Produces .aab for Play Store
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json",
        "track": "internal"
      }
    }
  }
}
```

---

## Step 3 — Log In to Expo & Build

```bash
# 1. Log in to your Expo account
npx eas login

# 2. Build the production AAB
npx eas build --platform android --profile production
```

EAS will:
1. Ask to generate an **Android signing keystore** — say **Yes** (EAS stores it securely for you)
2. Upload your project and build it in the cloud
3. Give you a download link for the `.aab` file when done (~5-10 min)

> [!TIP]
> EAS manages your signing keys automatically. You never need to touch `keytool` or `.jks` files manually.

---

## Step 4 — Create Your App on Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **"Create app"**
3. Fill in:
   - **App name**: WAPDA Alert
   - **Default language**: English
   - **App or Game**: App
   - **Free or Paid**: Free
4. Accept the declarations and click **Create app**

---

## Step 5 — Complete the Store Listing

Navigate to **Grow → Store presence → Main store listing** and fill in:

| Field | Value |
|---|---|
| **App name** | WAPDA Alert |
| **Short description** | Monitor your home's power status in real-time with ESP8266 |
| **Full description** | Real-time power monitoring for your home. WAPDA Alert connects to an ESP8266 device on your local WiFi network and notifies you instantly when power goes on or off. Features include: real-time LED status, background monitoring with push notifications, easy WiFi provisioning, and factory reset support. |
| **App icon** | 512×512 PNG |
| **Feature graphic** | 1024×500 PNG |
| **Screenshots** | At least 2 phone screenshots |

---

## Step 6 — Complete Policy Declarations

Under **Policy → App content**, complete all required declarations:

| Section | What to select |
|---|---|
| **Privacy policy** | Required — host a simple privacy policy page (even a GitHub Gist works) |
| **Ads** | No ads |
| **Content rating** | Complete the questionnaire (your app will likely get an "Everyone" rating) |
| **Target audience** | 18+ (IoT/technical app) |
| **Data safety** | Declare: No data collected/shared (your app communicates only on LAN) |
| **Government apps** | No |

> [!WARNING]
> Google **will reject** your app if the Privacy Policy is missing. A simple page stating "This app does not collect or transmit any personal data" is sufficient for a LAN-only IoT app.

---

## Step 7 — Upload the AAB

1. Go to **Release → Production** (or start with **Testing → Internal testing** first)
2. Click **"Create new release"**
3. Upload the `.aab` file you downloaded from EAS Build
4. Add release notes (e.g., "Initial release — real-time power monitoring for ESP8266")
5. Click **Review release** → **Start rollout**

---

## Step 8 (Optional) — Automate with EAS Submit

Instead of manually uploading the AAB, you can automate it:

```bash
# One command to build AND submit to Play Store
npx eas build --platform android --profile production --auto-submit
```

For this to work, you need a **Google Play Service Account Key**:
1. Go to **Google Play Console → Setup → API access**
2. Create a service account (follow Google's guide)
3. Download the JSON key file
4. Save it as `play-store-key.json` in your app directory
5. **Add it to `.gitignore`** so it's never committed!

---

## Quick Reference: Release Checklist

```
[ ] Google Play Developer account created ($25)
[ ] app.json: versionCode added
[ ] eas.json: production profile set to app-bundle
[ ] npx eas build --platform android --profile production
[ ] Play Console: App created
[ ] Play Console: Store listing completed (icon, screenshots, descriptions)
[ ] Play Console: Privacy policy URL added
[ ] Play Console: Content rating questionnaire completed
[ ] Play Console: Data safety form completed
[ ] Play Console: AAB uploaded & release submitted
[ ] Wait for Google review (typically 1-3 days for first app)
```

---

## After Submission

- **Review time**: First-time apps typically take **1-7 days** for review
- **Updates**: For future updates, just increment `versionCode` in `app.json`, run `eas build`, and upload the new AAB
- **Internal testing**: Consider using the **Internal testing track** first before going to Production — it's available instantly with no review wait
