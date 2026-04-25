# Saathi — Life Tracker: Habit-First Build Plan (CASA-Safe MVP)

## 1. Product Vision & Positioning
*   **One-Line Pitch:** An AI-powered Habit & Task Architect that anchors your personal growth goals into your real-world schedule.
*   **Core Problem Solved:** The "Aspiration vs. Reality" gap. People set habits (e.g., "Mediate daily") but forget them because their calendar is a mess.
*   **CASA Bypass Strategy:** **No Gmail.** We focus on Google Calendar & Tasks (Sensitive Scopes) to avoid the Level 2 Security Audit, allowing for a 4-week launch window instead of 4 months.

---

## 2. Core Features (MVP)
*   **AI Habit Stacking (The "Anchor" Feature):**
    *   Gemini reads your Google Calendar.
    *   It identifies "Anchor Points" (e.g., "Right after your Daily Standup") and suggests scheduling habits there.
*   **Energy-Aware Dashboard:**
    *   **Morning Briefing:** Gemini summarizes your day: "Tight morning, but 2 PM is open for deep work."
    *   **Energy Log:** A quick tap (1-5) to log energy levels. The app re-sorts tasks based on your current state.
*   **Unified Habit & Task List:**
    *   **Habits:** Streak-based tracking with "Skipped" vs. "Failed" logic (to keep momentum without guilt).
    *   **Tasks:** Sync with Google Tasks for cross-platform utility.
*   **Intelligent Nudges:**
    *   Context-aware reminders: "You have your big presentation in 1 hour. Time for a 5-minute breathing session to reset?"

---

## 3. Technical Architecture
*   **Frontend:** React Native (Expo) - Fast iteration, cross-platform.
*   **Backend:** Firebase (Auth, Firestore, Functions).
*   **AI Layer:** Gemini 1.5 Flash.
    *   **Prompt Architecture:** "Schedule-to-Habit Mapping" - Providing a JSON of the user's calendar and a list of habits, asking Gemini for the optimal timestamp for each.
*   **Data Model:**
    *   `Habit`: Definition (name, frequency, target_time).
    *   `HabitLog`: Daily completion status, energy_at_time.
    *   `Task`: Mirror of Google Tasks.
    *   `ScheduleSnap`: Cached calendar events for the next 48 hours.

---

## 4. Build Plan (Quick Wins)
1.  **Week 1:** Google Auth + Calendar Sync. Build the "Unified Pulse" dashboard.
2.  **Week 2:** Habit CRUD + Streak Logic.
3.  **Week 3:** **The Brain.** Implement the "Anchor Suggester" - a Gemini function that suggests habit times based on `ScheduleSnap`.
4.  **Week 4:** Energy Check-in UI + AI Morning Briefing.

---

## 5. Risks & Open Questions
*   **Verification:** Still requires Google Cloud Project Verification, but much simpler without Gmail scopes.
*   **HealthKit:** iOS integration for automated energy logs (e.g., sleep data) - *Future Milestone.*

