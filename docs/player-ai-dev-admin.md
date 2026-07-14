# Player AI Dev Admin Controls

These controls are for local development testing only. They are not a public admin UI and they do not run unless all of these are true:

- `NODE_ENV` is `development`
- the request is sent to `localhost`, `127.0.0.1`, or `::1`
- `AI_DEV_ADMIN_ENABLED=true`
- `AI_DEV_ADMIN_TOKEN` is provided in the request
- `SUPABASE_SERVICE_ROLE_KEY` is configured server-side

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `AI_DEV_ADMIN_TOKEN` to the frontend.

## Local Env

Add these to `.env.local` when you need local AI testing controls:

```env
SUPABASE_SERVICE_ROLE_KEY=your-local-or-project-service-role-key
AI_DEV_ADMIN_ENABLED=true
AI_DEV_ADMIN_TOKEN=choose-a-long-random-local-token
```

## View AI Status

```bash
curl "http://localhost:3000/api/player-ai/dev-admin?user_id=USER_UUID" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN"
```

Returns:

- resolved AI tier
- stored entitlement row, if present
- remaining message status
- free lifetime usage and rewarded test credits
- recent `ai_usage` rows
- conversation counts only, not full chat content

## Set Tier

```bash
curl -X POST "http://localhost:3000/api/player-ai/dev-admin" \
  -H "Content-Type: application/json" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN" \
  -d "{\"action\":\"set_tier\",\"user_id\":\"USER_UUID\",\"tier\":\"premium\"}"
```

Valid tiers are `free`, `pro`, and `premium`.

## Reset Free Usage

```bash
curl -X POST "http://localhost:3000/api/player-ai/dev-admin" \
  -H "Content-Type: application/json" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN" \
  -d "{\"action\":\"reset_free_usage\",\"user_id\":\"USER_UUID\"}"
```

This resets `ai_free_message_credits.lifetime_free_used` to `0`.

To also clear rewarded test credits:

```bash
curl -X POST "http://localhost:3000/api/player-ai/dev-admin" \
  -H "Content-Type: application/json" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN" \
  -d "{\"action\":\"reset_free_usage\",\"user_id\":\"USER_UUID\",\"reset_rewarded_ad_credits\":true}"
```

## Add Rewarded Test Credits

```bash
curl -X POST "http://localhost:3000/api/player-ai/dev-admin" \
  -H "Content-Type: application/json" \
  -H "x-ai-dev-admin-token: YOUR_TOKEN" \
  -d "{\"action\":\"add_rewarded_test_credits\",\"user_id\":\"USER_UUID\",\"credits\":10}"
```

This updates `ai_free_message_credits.rewarded_ad_credits` and records a row in `ai_rewarded_ad_grants` for testing visibility. It does not add any frontend path for users to grant themselves credits.
