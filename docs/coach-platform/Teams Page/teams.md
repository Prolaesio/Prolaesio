\# Teams Page — Prolaesio Coach



\## Context



The Teams page belongs to the Prolaesio Coach platform.



The app uses:



\* Next.js

\* Tailwind CSS

\* TypeScript

\* Supabase



The uploaded sketch is a hand-drawn wireframe for the Teams page. Use it as a structural and UX reference, not as literal visual styling.



Keep the current Prolaesio design language consistent with the athlete app. Do not redesign the UI from scratch.



Maintain:



\* existing typography

\* spacing

\* colors

\* card styling

\* clean SaaS dashboard feel



\---



\# Purpose



The Teams page allows a coach to view and select the teams connected to their account.



The team selected on this page controls the data shown in the team-specific coach pages:



\* Overview

\* Players

\* Analytics

\* Calendar



This page is the foundation for the rest of the coach platform.



\---



\# Layout



\## Desktop



The page should include:



\* left coach sidebar navigation

\* main content area with team cards

\* responsive grid layout



Each team should appear as a card.



A selected team card should have a subtle outline or low-contrast highlight, as shown in the sketch.



\## Mobile



On mobile:



\* sidebar becomes hamburger navigation

\* team cards stack vertically

\* spacing stays clean and readable

\* avoid horizontal scrolling



\---



\# Team Cards



Each team card should include:



\* team logo/avatar placeholder

\* team name

\* team code

\* number of players

\* average age

\* average height

\* average weight

\* average readiness

\* average load



Use mock data for now.



The selected team should be visually clear without being too loud.



\---



\# Team Selection Behavior



When a coach selects a team:



\* that team becomes the active selected team

\* the selected team name should appear under “Teams” in the sidebar

\* the selected team determines the data shown in Overview, Players, Analytics, and Calendar



Assume a global selected-team state will exist.



Do not implement real backend logic yet.



Use mock state or mock data only.



\---



\# Required Components



Create reusable components such as:



\* TeamsPage

\* TeamCard

\* TeamGrid

\* SelectedTeamIndicator

\* CoachLayout

\* CoachSidebar



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



\* responsive Teams page layout

\* reusable team card components

\* selected team UI state

\* clean component architecture



Do not:



\* implement backend logic yet

\* redesign the app style

\* create unrelated features

\* overcomplicate the page



Focus on:



\* faithful implementation of the Teams sketch

\* clean responsive UI

\* selected-team structure

\* preparing the page for future Supabase data



