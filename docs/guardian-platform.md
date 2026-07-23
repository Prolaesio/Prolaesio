# Guardian platform

The Guardian account, onboarding, linking, consent, and age-transition implementation lives under `/guardian`, `/profile/guardians`, and `/coach/guardians`.

## What is implemented

- Private, server-evaluated Player DOB and country policy with reviewed-jurisdiction and conservative-fallback paths.
- Guardian onboarding only when the central policy decision requires it; only Players requiring approval are restricted.
- Hashed, seven-day, single-use invitation tokens with exact-email matching, replay prevention, duplicate protection, resend cooldowns, attempt limits, cancel/replace states, and audit events.
- Existing-account and new-account Guardian acceptance, verified-email checks, authority declaration, required approval/rejection, separate optional consent records, and multiple account roles.
- Multiple Players per Guardian and multiple Guardians per Player with primary/secondary templates and relationship status history.
- Complete sanitized read-only access for active Guardians while a Player is below the applicable jurisdiction self-consent age, including DOB/profile basics, readiness summaries, training load, safety categories, individual sessions, Guardian-visible documents, AI feature status, and masked billing metadata.
- Provider-written billing summaries that can store and return only card brand, expiry, and last four digits; full card numbers and security codes have no storage field.
- Database write guards for restricted Player wellness, training, personal calendar, and injury data.
- Player connection/permission visibility, invitation management, DOB correction requests, privacy requests, Coach operational status, and age-18 access suspension with explicit limited reauthorization.
- Gmail SMTP invitation/reminder delivery. Development logs the secure preview URL server-side when SMTP is intentionally absent.

## Apply to hosted Supabase

No Docker is required. From the repository folder, use either:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or copy the new migrations into the hosted Supabase SQL Editor in filename order. Never use `db reset` against a shared or production project.

Required deployed app environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GMAIL_SMTP_USER=...
GMAIL_SMTP_APP_PASSWORD=...
EMAIL_FROM=Lodario <...>
```

## Security and product boundaries

Guardian sporting data is read-only and sanitized through relationship- and permission-checked RPCs. Raw wellness answers, private notes, medical records, AI conversation content, full payment card numbers, security codes, and Coach-only analytics are not returned. The masked billing summary remains empty until a subscription provider writes its display-safe fields. The seeded age thresholds and policy wording are technical defaults, not a claim of legal compliance; launch jurisdictions require review.

Privacy deletion/export requests are tracked and deliberately require identity confirmation and fulfilment review rather than executing destructive actions immediately.

The jurisdiction policy register, active sources, fallback rules, and review workflow are documented in
[Guardian jurisdiction policies](./guardian-jurisdiction-policies.md).
