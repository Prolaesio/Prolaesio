# Player AI Rewarded Ads

Lodario Player AI supports a safe rewarded-ad credit foundation for free players. The current implementation prepares the server route, provider abstraction, database write path, and UI hook, but real rewarded ads are still disabled by default.

## Environment

```env
AI_REWARDED_ADS_ENABLED=false
AI_REWARDED_AD_CREDITS=10
AI_REWARDED_AD_PROVIDER=google
GOOGLE_REWARDED_AD_UNIT_ID=
GOOGLE_REWARDED_AD_VERIFICATION_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` is also required server-side before the app can grant verified rewarded credits, because credit rows are intentionally not writable by normal players.

Never expose these values to the frontend.

## Current Status

Real rewarded ads are not active yet.

The `/api/player-ai/rewarded-ad` route will not grant credits unless a trusted provider verification succeeds. At the moment, the Google verification adapter is intentionally not connected, so the route returns a friendly unavailable/setup message instead of adding credits.

## Required Google Setup

Before enabling real rewarded ads, configure the Google/AdMob rewarded ad unit and the trusted server-side verification flow:

- Create the rewarded ad unit in Google/AdMob.
- Store the ad unit id in `GOOGLE_REWARDED_AD_UNIT_ID`.
- Configure server-side reward verification.
- Connect the Google verification payload to `lib/ai/rewarded-ads.ts`.
- Add an idempotency key or provider transaction id check before allowing repeated grants for the same completed ad.
- Only then set `AI_REWARDED_ADS_ENABLED=true`.

## How Credits Are Granted

The intended safe flow is:

1. Free player taps `+`.
2. Frontend starts the real rewarded ad provider flow.
3. Provider confirms a completed rewarded ad through a trusted verification payload.
4. Frontend sends only that provider verification payload to `/api/player-ai/rewarded-ad`.
5. Server verifies it.
6. Server adds `AI_REWARDED_AD_CREDITS` to `ai_free_message_credits.rewarded_ad_credits`.
7. Server records the grant in `ai_rewarded_ad_grants`.
8. Frontend refreshes the AI message counter from the backend.

The frontend never decides whether credits are valid.

## Why Frontend-Only Granting Is Unsafe

If the browser could directly add credits, a user could call the same endpoint without watching an ad. Credits must only be granted after the server verifies a trusted provider signal.

## Testing For Now

Use the Phase 12 dev-admin controls for local testing:

```bash
curl -X POST "http://localhost:3000/api/player-ai/dev-admin" \
  -H "Content-Type: application/json" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN" \
  -d "{\"action\":\"add_rewarded_test_credits\",\"user_id\":\"USER_UUID\",\"credits\":10}"
```

That path is development-only, localhost-only, token-protected, and requires the service role key server-side.
