\# Calendar Page — Prolaesio Coach



\## Context



The Calendar page belongs to the Prolaesio Coach platform.



The app uses:



\* Next.js

\* Tailwind CSS

\* TypeScript

\* Supabase



The uploaded sketch is a hand-drawn wireframe for the team Calendar page. Use it as a structural and UX reference, not as literal visual styling.



The generated UI must include all important design sections shown in the sketch.



Keep the current Prolaesio design language consistent with the athlete app. Do not redesign the UI from scratch.



Maintain:



\* existing typography

\* spacing

\* colors

\* card styling

\* calendar visual language



\---



\# Purpose



The Calendar page allows a coach to manage the schedule for the selected team.



The page should allow the coach to:



\* view team calendar events

\* create team sessions/events

\* create tasks with flexible completion windows

\* inspect upcoming team activities

\* manage training, gym, recovery, and solo work



This is the team-wide calendar page, not the individual player calendar from the Players page.



\---



\# Team Context



This page is team-specific.



The selected team determines:



\* visible calendar events

\* team sessions

\* team tasks

\* player assignment options



Assume global selected-team state exists.



Use mock data and Supabase-ready structure.



Do not implement backend logic yet.



\---



\# Calendar Layout



The Calendar page should include:



\- coach sidebar navigation

\- left-side team averages panel

\- main calendar area

\- right-side event/task creator panel

\- event/task list or upcoming activities section if shown in the sketch



The layout should closely follow the uploaded calendar sketch.



On desktop:



\* calendar should be the main focus

\* creator panel should sit on the right

\* spacing should stay clean and professional



On mobile:



\* sidebar becomes hamburger navigation

\* calendar stacks above creator panel

\* all sections become full-width

\* avoid horizontal scrolling



\---



\# Team Averages Panel



The Calendar page must include a left-side team averages/statistics panel, positioned just to the left of the main calendar/schedule section.



This panel should show the selected team’s current average wellness/performance metrics.



It should visually match the filled-out panel shown in the Calendar sketch.



This team averages panel is important because it is also reused in the Analytics page as legend/item number 6.



Include team average metrics such as:



\- Team Readiness Score

\- Team Fatigue

\- Team Energy

\- Team Stress

\- Team Sleep Score

\- Team Sleep Quantity

\- Team Sleep Quality

\- Acute Training Load

\- Load Score

\- Average Sleep Time

\- Average Wake Time



The design should be compact, readable, and card-based.



On desktop:

\- this panel sits between the coach sidebar and the main calendar/schedule area



On mobile:

\- this panel stacks above the calendar or below the page header



Use mock data only.



Do not implement backend logic yet.



\---



\# Event Creator



The creator panel should allow coaches to create team-wide calendar items.



The form should include:



\* task toggle button

\* event title

\* event type

\* description



Event type options should include:



\* training

\* game

\* gym

\* recovery

\* solo

\* meeting

\* other



\---



\# Task Toggle Behavior



The task toggle should start turned off by default.



When the task toggle is OFF, the form creates a normal scheduled event/session.



Normal event fields:



\* date

\* start time

\* end time



This means the team has a specific scheduled date and time for the session.



When the task toggle is ON, the form creates a task-style session.



Task fields:



\* start date

\* start time

\* end date

\* end time



This means the coach gives players a time window to complete the task.



The start date/time is when the task becomes available.



The end date/time is the due date/deadline.



Example:



If the task starts on May 19 at 8:00 AM and ends on May 20 at 9:00 PM, players can complete and log the task anytime between May 19 at 8:00 AM and May 20 at 9:00 PM.



The rest of the form should stay the same when the task toggle is turned on.



Use mock state only.



Do not implement backend logic yet.



\---



\# Calendar Behavior



The calendar should support mock events and tasks.



Events should appear as scheduled items.



Tasks should appear as flexible-window items with a due date.



Use different subtle visual treatments for:



\* events

\* tasks

\* completed items

\* upcoming items



Do not overuse bright colors.



Keep the UI consistent with the athlete-side calendar.



\---



\# Required Components



Create reusable components such as:



\* CalendarPage

\* TeamCalendar

\* CalendarEventCard

\* CalendarTaskCard

\* EventCreatorPanel

\* TaskToggle

\* UpcomingActivities

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



\* responsive calendar layout

\* reusable event/task components

\* mock calendar data

\* mock form state

\* clean component architecture



Do not:



\* implement backend logic yet

\* redesign the app style

\* create unrelated features

\* omit important sections from the sketch



Focus on:



\* faithful implementation of the Calendar sketch

\* clean responsive UI

\* clear difference between events and tasks

\* future-ready Supabase structure



