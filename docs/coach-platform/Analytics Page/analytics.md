\# Analytics Page — Prolaesio Coach



\## Context



The Analytics page belongs to the Prolaesio Coach platform.



The app uses:



\* Next.js

\* Tailwind CSS

\* TypeScript

\* Supabase



The uploaded sketch is a hand-drawn wireframe for the team Analytics page. Use it as a structural and UX reference, not as literal visual styling.



The generated UI must include all important design sections shown in the sketch.



Keep the current Prolaesio design language consistent with the athlete app. Do not redesign the UI from scratch.



Maintain:



\* existing typography

\* spacing

\* colors

\* card styling

\* analytics visual language



\---



\# Purpose



The Analytics page allows a coach to analyze the selected team’s performance, readiness, wellness, and training load.



This is the team-wide analytics page, not the individual player analytics view from the Players page.



The page should allow the coach to:



\* view team-wide averages

\* inspect team trends

\* compare individuals

\* identify player risk signals

\* analyze readiness, fatigue, sleep, stress, and load



\---



\# Page Views



The Analytics page has two main views:



\* Averages View

\* Individuals View



Use a clear toggle or tab switch between these views.



Both views should follow the structure shown in the uploaded Analytics sketch.



\---



\# Averages View



The Averages View shows team-wide analytics.



It should include:



\* numbered analytics graphs

\* numbered analytics legend

\* team averages panel



The numbered graph system should match the sketch.



Each graph has a number in the top-right corner.



The numbered legend explains which metric belongs to each graph.



Graph mapping:



1\. Team Readiness Score trend

2\. Team Energy vs Fatigue vs Acute Training Load

3\. Team Sleep Time vs Sleep Quality vs Sleep Score, including average time players fell asleep and woke up

4\. Team Stress vs Sleep Score

5\. Team Sleep Score + Energy + Fatigue + Stress + Load Score vs Readiness Score

6\. Team Averages Panel



The Team Averages Panel should visually match the filled-out panel shown in the Calendar sketch.



Include average metrics such as:



\* Team Readiness Score

\* Team Fatigue

\* Team Energy

\* Team Stress

\* Team Sleep Score

\* Team Sleep Quantity

\* Team Sleep Quality

\* Acute Training Load

\* Load Score

\* Average Sleep Time

\* Average Wake Time



Use mock data only.



Do not implement real analytics calculations yet.



\---



\# Individuals View



The Individuals View allows the coach to compare individual players within the selected team.



It should include:



\* player comparison cards or rows

\* individual readiness scores

\* individual fatigue

\* individual load score

\* individual sleep/wellness indicators

\* player trend summaries



\## Individuals View Data Behavior



The Individuals View should show one data point per player for the selected day.



This means each graph/card compares all players on the selected team using that day’s value for the selected metric.



Example:

\- Player A = 82 readiness

\- Player B = 76 readiness

\- Player C = 91 readiness



The Individuals View is not primarily a multi-day trend view. It is a same-day player comparison view.



In contrast, the Averages View shows team-average trends over multiple days.



The design should stay consistent with the Averages View and the Players analytics view.



This view should help the coach quickly see:



\* who is performing well

\* who may be overloaded

\* who may be under-recovered

\* who may need attention



Use mock player data only.



Do not implement real backend logic yet.



\---



\# Team Context



This page is team-specific.



The selected team determines:



\* team averages

\* visible players

\* analytics data

\* comparison data



Assume global selected-team state exists.



Use mock data and Supabase-ready structure.



\---



\# Layout



\## Desktop



Desktop layout should follow the sketch:



\* coach sidebar on the left

\* main analytics content area

\* numbered graphs

\* legend/metrics reference

\* team averages panel where shown

\* responsive dashboard-style grid



\## Mobile



On mobile:



\* sidebar becomes hamburger navigation

\* graph cards stack vertically

\* legend stacks above or below graphs

\* team averages panel becomes full-width

\* avoid horizontal scrolling



\---



\# Required Components



Create reusable components such as:



\* AnalyticsPage

\* AnalyticsViewToggle

\* TeamAnalyticsChart

\* AnalyticsLegend

\* TeamAveragesPanel

\* IndividualPlayerAnalyticsCard

\* PlayerComparisonList

\* MetricsGrid

\* CoachLayout



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



\* responsive analytics layout

\* reusable analytics components

\* mock team analytics data

\* mock player comparison data

\* clean component architecture



Do not:



\* implement backend logic yet

\* create real analytics calculations

\* redesign the app style

\* remove any important section from the sketch

\* create unrelated features



Focus on:



\* faithful implementation of the Analytics sketch

\* consistency with the Players analytics view

\* clean responsive UI

\* reusable graph/card architecture



