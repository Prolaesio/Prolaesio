# Lodario Player AI MVP

## 1. Purpose

The Lodario Player AI assistant should help players understand their own training context and make safer, more consistent day-to-day decisions. The MVP should act like a practical training companion inside the player app: it explains patterns, summarizes recent data, suggests conservative next steps, and helps the player prepare useful questions for a coach, parent, or clinician when needed.

The assistant is not a medical provider, coach replacement, or automatic training planner. It should support reflection and safer choices using Lodario's existing player data.

## 2. MVP Scope

The MVP should:

- Answer player questions about their recent readiness, wellness, training logs, calendar, and pain or injury notes.
- Summarize recent trends in plain language, such as rising fatigue, low sleep, increasing soreness, or training load changes.
- Give conservative training suggestions for today or the next few days based on available data.
- Explain why a recommendation is cautious when pain, injury notes, high fatigue, or low readiness appear.
- Help players prepare for coach conversations by turning their data into concise talking points.
- Suggest recovery basics such as sleep, hydration, mobility, lower intensity, rest, and checking in with a trusted adult or professional when appropriate.
- Keep responses short, encouraging, specific, and age-appropriate.

## 3. Not In MVP

The MVP should not:

- Diagnose injuries, illnesses, mental health conditions, or medical causes of pain.
- Prescribe rehab programs, return-to-play protocols, medication, supplements, or treatment plans.
- Generate fully automated training plans without coach review.
- Modify player logs, calendar events, reminders, readiness scores, wellness entries, or injury notes.
- Create database records or write back AI recommendations.
- Message coaches, parents, teammates, or clinicians automatically.
- Analyze images, video, GPS files, wearables, or external health data.
- Use GPT-5.6 Sol for routine chat, simple summaries, or ordinary training guidance.
- Support coach-facing AI workflows yet.
- Include billing, usage dashboards, admin controls, or tier upgrade prompts beyond simple feature limits.

## 4. User Tiers

### Free Player

Free players should receive lightweight guidance powered by GPT-5 Nano.

Allowed:

- Ask basic questions about current readiness and recent wellness.
- Receive simple summaries of recent training and recovery patterns.
- Get conservative suggestions for low-risk situations.
- Use a small set of starter prompts.
- See clear limitations when a question is too complex for the free tier.

Limits:

- Shorter context window.
- Fewer messages per day or week.
- No deeper multi-week analysis.
- No complex scenario planning.

### Pro Player

Pro players should receive richer everyday support powered by GPT-5.6 Luna.

Allowed:

- Ask broader questions using readiness, wellness, training logs, calendar, and pain notes.
- Receive weekly pattern summaries.
- Compare recent training load against current fatigue and soreness.
- Get practical recovery and training adjustment suggestions.
- Prepare coach check-in summaries.
- Ask follow-up questions within the same conversation.

Limits:

- No GPT-5.6 Sol escalation.
- No medical diagnosis or advanced injury interpretation.
- No automatic plan generation or data writes.

### Premium Player

Premium players should use GPT-5.6 Terra by default. GPT-5.6 Sol is an automatic, hidden escalation for exceptionally complex requests only.

Allowed:

- Use everything in the Pro experience.
- Ask more detailed multi-factor questions across readiness, wellness, logs, calendar, and injury notes.
- Receive more nuanced weekly or monthly summaries.
- Ask for structured decision support, such as whether to train normally, reduce intensity, or ask a coach before training.
- Escalate only exceptionally difficult tasks to GPT-5.6 Sol, such as advanced long-term programme creation with several constraints, extensive multi-week data analysis, or a detailed deep-research request.

Limits:

- GPT-5.6 Sol is not user-selectable and must not be used for routine summaries, casual chat, ordinary training recommendations, simple readiness questions, or pain/injury requests.
- Sol escalation is capped by both a daily limit and a rolling 30-day limit; Terra handles the request when either cap is reached or the Sol route cannot be verified.
- No medical diagnosis, treatment plans, autonomous return-to-play advice, or automatic data writes.

## 5. Tier Behavior Summary

| Capability | Free | Pro | Premium |
| --- | --- | --- | --- |
| Basic readiness and wellness Q&A | Yes | Yes | Yes |
| Recent training log summary | Limited | Yes | Yes |
| Calendar-aware guidance | Limited | Yes | Yes |
| Pain or injury-aware caution | Yes | Yes | Yes |
| Weekly trend summary | No | Yes | Yes |
| Multi-week pattern analysis | No | Limited | Yes |
| Coach check-in summary | Limited | Yes | Yes |
| Default model | GPT-5 Nano | GPT-5.6 Luna | GPT-5.6 Terra |
| GPT-5.6 Sol escalation | No | No | Exceptional tasks only; automatic and capped |
| Writes to app data | No | No | No |

## 6. Player Data To Use Later

The AI should eventually use only player-owned data already available in Lodario's player app:

- Readiness: current score, recent changes, and low-readiness signals.
- Wellness: sleep, soreness, stress, mood, energy, fatigue, and other logged wellness fields.
- Training logs: recent sessions, intensity, duration, training type, perceived effort, and notes.
- Calendar: upcoming sessions, matches, rest days, and schedule density.
- Pain and injury notes: body area, pain level, recent changes, player notes, and whether symptoms are worsening.

Data use rules:

- Send only the minimum context needed for the current question.
- Prefer recent data first, such as today, the past 7 days, and the past 28 days when tier allows.
- Clearly say when data is missing or too sparse.
- Never invent logs, scores, injuries, or calendar events.
- Do not include coach-only data unless the player already has permission to see it.

## 7. Safety Rules

The assistant must:

- Never provide a medical diagnosis.
- Never claim an injury is safe, minor, healed, or cleared for play.
- Never recommend training through sharp pain, chest pain, dizziness, fainting, concussion symptoms, severe swelling, numbness, or worsening symptoms.
- Use conservative advice for pain, injury, unusual fatigue, poor sleep, high soreness, or low readiness.
- Encourage players to tell a coach, parent, guardian, athletic trainer, doctor, or other qualified professional when symptoms are concerning or persistent.
- Use youth-athlete-safe wording: calm, supportive, non-alarming, and clear.
- Avoid shame, pressure, or "push through it" language.
- Avoid nutrition, supplement, medication, weight-loss, and body-composition advice beyond basic hydration, regular meals, and seeking qualified support.
- Explain uncertainty when the data does not support a confident answer.

Example safety tone:

> I cannot diagnose what is causing the pain, but your notes suggest this is worth taking seriously. Consider reducing intensity today and checking in with your coach or a trusted adult before training hard.

## 8. Starter Prompts

Suggested starter prompts for the player AI page:

- "How ready do I look for training today?"
- "Summarize my last week of training."
- "What recovery should I focus on today?"
- "Do my soreness and fatigue look higher than usual?"
- "Help me explain my recent pain notes to my coach."
- "What should I ask my coach before today's session?"
- "Look at my calendar and training logs. Does this week look too heavy?"
- "What patterns do you notice in my sleep, soreness, and performance?"

## 9. Future Features After MVP

These should wait until after the MVP is stable:

- Coach-facing AI assistant.
- AI-generated training plans.
- AI-written calendar sessions or reminders.
- Automatic injury risk scoring.
- Wearable, GPS, image, or video analysis.
- Long-term performance reports.
- Parent or guardian summaries.
- Team-level AI insights.
- Billing and usage analytics.
- Fine-grained admin controls for tier limits.
- Conversation history search.
- Notification-driven AI nudges.
- Return-to-play workflows.

## 10. Implementation Roadmap

### Phase 2: Product Shape

- Define the player AI page entry point and UI states.
- Decide exact starter prompts and empty states.
- Define tier limits, message limits, and upgrade boundaries without wiring billing yet.
- Decide what data summaries the assistant can receive per tier.

### Phase 3: Data Context Layer

- Build server-side helpers that collect player-owned readiness, wellness, logs, calendar, and injury notes.
- Keep helpers read-only.
- Add tests for data access, missing data, and permission boundaries.

### Phase 4: Safety And Prompt Contract

- Write the system prompt and safety policy for player responses.
- Define refusal and escalation wording.
- Add fixtures for pain, fatigue, low readiness, missing data, and normal training days.

### Phase 5: AI API Route

- Add the AI route only after the data contract and safety contract are defined.
- Route Free to GPT-5 Nano.
- Route Pro to GPT-5.6 Luna.
- Route Premium to GPT-5.6 Terra by default, escalating automatically to GPT-5.6 Sol only for exceptional tasks within the configured safeguards.
- Log only safe operational metadata, not sensitive full prompts or private player notes.

### Phase 6: Player UI MVP

- Add the player AI page.
- Add starter prompts, loading states, error states, tier-limit states, and safety copy.
- Keep all AI output read-only.

### Phase 7: QA And Launch Guardrails

- Test common player questions and safety edge cases.
- Verify no data writes happen.
- Verify Free, Pro, and Premium routing plus the GPT-5.6 Sol escalation and fallback safeguards.
- Review wording with youth-athlete safety in mind.
- Launch behind a controlled feature flag only after safety and tier behavior are reviewed.
