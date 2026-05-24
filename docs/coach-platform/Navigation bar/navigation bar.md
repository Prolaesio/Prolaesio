\# Coach Navigation — Prolaesio Coach



\## Context



The coach platform uses the same app stack as the athlete side:



\- Next.js

\- Tailwind CSS

\- TypeScript

\- Supabase



The uploaded navigation sketches show the Prolaesio Coach sidebar in both collapsed and expanded states.



The navigation system is shared across all coach pages.



Do not redesign the app style. Keep the same Prolaesio visual language, spacing, colors, typography, and card styling as the athlete app.



\---



\# Purpose



The coach navigation allows coaches to move between:



\- Dashboard

\- Teams

\- Overview

\- Players

\- Analytics

\- Calendar

\- Profile

\- Settings



The navigation should feel:



\- clean

\- minimal

\- professional

\- smooth

\- consistent across desktop and mobile



\---



\# Desktop Navigation Behavior



\## Collapsed State



By default, the sidebar should be collapsed on desktop.



Collapsed sidebar shows:



\- Prolaesio icon/logo

\- page icons only

\- current active page subtly highlighted

\- profile icon near the bottom

\- settings icon near the bottom



The collapsed sidebar should be narrow and remain fixed on the left side.



\---



\## Expanded Hover State



When the user hovers over the sidebar, it should smoothly expand.



Expanded sidebar shows:



\- Prolaesio Coach logo/text

\- Dashboard

\- Teams

\- selected team name under Teams

\- Overview

\- Players

\- Analytics

\- Calendar

\- Profile

\- Settings



The expanded sidebar should slide out smoothly and match the sketch.



The active page should have a subtle highlight.



\---



\# Navigation Structure



Top section:



1\. Prolaesio Coach logo

2\. Dashboard

3\. Teams

&#x20;  - selected team appears underneath

4\. Overview

5\. Players

6\. Analytics

7\. Calendar



Bottom section:



1\. Profile

2\. Settings



\---



\# Team-Specific Pages



These pages depend on the currently selected team:



\- Overview

\- Players

\- Analytics

\- Calendar



The selected team should be visible in the navigation, under the Teams item.



Example:



\- Teams

&#x20; - Whitby FC U19



The selected team determines what data appears in the team-specific pages.



Use mock data for now.



Do not implement backend logic yet.



\---



\# Mobile Navigation Behavior



On mobile:



\- sidebar should not stay visible by default

\- hamburger menu opens the navigation

\- navigation slides in from the left

\- tapping outside or selecting a page should close it

\- desktop multi-column layouts should stack vertically



Mobile top bar should show:



\- hamburger icon

\- Prolaesio Coach logo

\- selected team name when relevant

\- current page icon if useful



\---



\# Required Components



Create reusable components such as:



\- CoachSidebar

\- CoachMobileNav

\- NavigationItem

\- TeamNavigationLabel

\- ActivePageIndicator

\- CoachLayout



\---



\# Technical Requirements



Use:



\- Next.js App Router

\- TypeScript

\- Tailwind CSS

\- reusable component structure

\- mock data

\- Supabase-ready structure



The navigation should support:



\- active route highlighting

\- collapsed desktop state

\- expanded hover state

\- mobile hamburger menu

\- smooth transitions

\- selected team display



Do not:



\- implement backend logic yet

\- redesign the existing app style

\- create unrelated features

\- hardcode the final database logic



Focus on:



\- layout

\- responsiveness

\- clean architecture

\- faithful implementation of the navigation sketches

