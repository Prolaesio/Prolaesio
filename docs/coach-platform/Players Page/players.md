\# Players Page — Prolaesio Coach



\## Context



The Players page belongs to the Prolaesio Coach platform.



The app uses:



\* Next.js

\* Tailwind CSS

\* TypeScript

\* Supabase



The uploaded sketch is a hand-drawn wireframe for the Players page. Use it as a structural and UX reference, not as literal visual styling.



The generated UI must include all important design sections shown in the sketch.



Keep the current Prolaesio design language consistent with the athlete app. Do not redesign the UI from scratch.



Maintain:



\* existing typography

\* spacing

\* colors

\* card styling

\* analytics visual language

\* calendar visual language



\---



\# Purpose



The Players page allows coaches to inspect one selected player from the selected team.



The page should allow the coach to:



\* view the player profile

\* inspect player readiness and wellness

\* analyze individual player trends

\* view the player calendar

\* create individual sessions/events for that player



This page has two main views:



\* Analytics View

\* Calendar View



\---



\# Persistent Player Profile



A player profile card must appear in both Analytics View and Calendar View.



The player profile should include:



\* player avatar/image placeholder

\* player name

\* jersey number

\* position(s)

\* age

\* height

\* weight

\* team name



The player profile should stay in the left section of the layout on desktop.



On mobile, it should stack above the main content.



\---



\# Analytics View



The Analytics View includes:



\* persistent player profile

\* 5 numbered analytics graphs

\* a numbered analytics legend



Each graph has a number in the top-right corner.



The numbered legend beside the page explains what each graph should analyze.



Graph mapping:



1\. Readiness Score trend

2\. Energy vs Fatigue vs Acute Training Load

3\. Sleep Time vs Sleep Quality vs Sleep Score, including time the player fell asleep and woke up

4\. Stress vs Sleep Score

5\. Sleep Score + Energy + Fatigue + Stress + Load Score vs Readiness Score



The graphs should visually match the athlete-side analytics components.



Use mock data only.



Do not implement real analytics calculations yet.



\---



\## Calendar View



The Calendar View includes:



\- persistent player profile

\- player calendar

\- right-side wellness metrics panel

\- individual session/event creator



The right-side wellness metrics panel must include:



\- Readiness Score

\- Fatigue

\- Load Score



The individual session/event creator should allow the coach to create a specific event/session for only the selected player.



The form should include:



\- task toggle button

\- event title

\- event type

\- description



Event type options should include:



\- gym

\- solo



\## Task Toggle Behavior



The task toggle should start turned off by default.



When the task toggle is OFF, the form creates a normal scheduled event/session.



Normal event fields:



\- date

\- start time

\- end time



This means the player has a specific scheduled date and time for the session.



When the task toggle is ON, the form creates a task-style session.



Task fields:



\- start date

\- start time

\- end date

\- end time



This means the coach gives the player a time window to complete the session.



The start date/time is when the task becomes available.



The end date/time is the due date/deadline.



Example:



If the task starts on May 19 at 8:00 AM and ends on May 20 at 9:00 PM, the player can complete and log the task anytime between May 19 at 8:00 AM and May 20 at 9:00 PM.



The rest of the form should stay the same when the task toggle is turned on.



Use mock state only.



Do not implement backend logic yet.



\---



\# Team Context



This page is team-specific.



The selected team determines which players are available.



The selected player determines:



\* profile data

\* analytics data

\* calendar data

\* individual session/event creation target



Assume global selected-team state exists.



Use mock data and Supabase-ready structure.



\---



\# Layout



\## Desktop



Desktop layout should follow the sketch:



\* coach sidebar on the left

\* player profile on the left side of the page content

\* main content area on the right

\* analytics graphs or calendar depending on selected view



\## Mobile



On mobile:



\* sidebar becomes hamburger navigation

\* player profile stacks above main content

\* graphs stack vertically

\* calendar and form stack vertically

\* avoid horizontal scrolling



\---



\# Required Components



Create reusable components such as:



\* PlayersPage

\* PlayerProfileCard

\* PlayerViewToggle

\* PlayerAnalyticsChart

\* PlayerAnalyticsLegend

\* PlayerCalendar

\* WellnessMetricsPanel

\* IndividualSessionCreator



\---



\# Technical Requirements



Use:



\* Next.js App Router

\* TypeScript

\* Tailwind CSS

\* reusable components

\* mock data

\* Supabase-ready structure



Create:



\* responsive page layout

\* reusable UI components

\* mock player data

\* mock analytics data

\* mock calendar/session data



Do not:



\* implement backend logic yet

\* redesign the app style

\* remove any important section from the sketch

\* create unrelated features



Focus on:



\* faithful implementation of the Players sketch

\* clean responsive UI

\* reusable component architecture



