\# Mobile View — Prolaesio Coach



\## Context



The mobile view belongs to the Prolaesio Coach platform.



The app uses:



\* Next.js

\* Tailwind CSS

\* TypeScript

\* Supabase



The uploaded sketch is a hand-drawn wireframe for the mobile layout. Use it as a structural and UX reference, not as literal visual styling.



Keep the current Prolaesio design language consistent with the athlete app. Do not redesign the UI from scratch.



Maintain:



\* existing typography

\* spacing

\* colors

\* card styling

\* dashboard visual language



\---



\# Purpose



The mobile view defines how coach pages should adapt on smaller screens.



The coach platform should feel fully usable on mobile, not like a squeezed desktop layout.



Mobile should be:



\* clean

\* stacked

\* easy to scroll

\* easy to tap

\* readable

\* responsive



\---



\# Mobile Navigation



On mobile:



\* the desktop sidebar should not stay visible

\* use a hamburger menu

\* tapping the hamburger opens the coach navigation

\* navigation should slide in from the left

\* tapping outside the menu should close it

\* selecting a navigation item should close the menu



The mobile navigation should include:



\* Dashboard

\* Teams

\* selected team name

\* Overview

\* Players

\* Analytics

\* Calendar

\* Profile

\* Settings



\---



\# Mobile Layout Rules



Desktop multi-column layouts should stack vertically on mobile.



Examples:



\* profile card stacks above analytics/calendar content

\* graph cards stack vertically

\* team cards stack vertically

\* calendar stacks above event/task creator

\* team averages panel becomes full-width

\* right-side panels move below the main content



Avoid:



\* horizontal scrolling

\* tiny unreadable cards

\* squeezed charts

\* hidden important content



\---



\# Mobile Page Header



Each mobile page should have a clean top header.



The header may include:



\* hamburger icon

\* Prolaesio Coach logo/text

\* current page title

\* selected team name when relevant



Keep the header compact and consistent across coach pages.



\---



\# Mobile Cards



Cards should remain easy to read and tap.



Use:



\* full-width cards

\* clean spacing

\* readable text sizes

\* clear active states

\* subtle borders/shadows



Do not overcrowd mobile cards with too much information.



If needed, secondary information can be moved lower inside the card.



\---



\# Mobile Analytics Behavior



Analytics graphs should:



\* stack vertically

\* remain readable

\* keep the numbered graph indicators

\* keep the analytics legend accessible

\* avoid being too compressed



The analytics legend can appear:



\* above the graphs

\* below the graphs

\* or as a collapsible section



Do not remove the legend.



\---



\# Mobile Calendar Behavior



Calendar pages should stack as:



1\. page header

2\. team/player averages or profile panel

3\. calendar/schedule view

4\. event/task creator panel



The event/task creator must still support:



\* normal event mode

\* task mode

\* date/time fields

\* start/end task window fields



\---



\# Technical Requirements



Use:



\* responsive Tailwind CSS

\* reusable mobile navigation components

\* shared layout components

\* clean breakpoint logic



Create:



\* mobile hamburger navigation

\* responsive stacked layouts

\* reusable mobile header

\* mobile-safe cards and charts



Do not:



\* create a separate mobile app

\* duplicate all desktop components unnecessarily

\* remove important desktop features

\* redesign the app style



Focus on:



\* responsive behavior

\* usability

\* clean mobile layout

\* consistency with the uploaded mobile sketch



