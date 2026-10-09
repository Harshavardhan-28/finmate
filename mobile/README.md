# FinMate mobile (Expo / React Native)

Screens follow the "FinMate · Mobile app" design: onboarding, sign in/up, Home, Expenses, Add (scan, speak, type),
Confirm, Budgets, Family, Assistant, Alerts and Settings, in light and dark.

## Run

Start the backend first (`uvicorn finmate.api:app --host 0.0.0.0 --port 8000` from `backend/`), then:

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` / `a` for a simulator. The API address is detected from your dev machine
(port 8000). Override it with `EXPO_PUBLIC_API_URL` (see `.env.example`), for example the Android emulator uses
`http://10.0.2.2:8000`. The backend must listen on `0.0.0.0` for a physical phone to reach it.

Demo logins: `ravi@finmate.dev` (admin) or `priya@finmate.dev` (member), password `demo1234`.

Auth uses the backend's Bearer token (stored in SecureStore), so no backend changes are needed.
