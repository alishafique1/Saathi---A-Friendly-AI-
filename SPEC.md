# Saathi — Life Tracker: Build Plan & Progress

## 1. Product Vision & Positioning
*   **One-Line Pitch:** An AI-powered Habit & Task Architect that anchors your personal growth goals into your real-world schedule.
*   **Design Philosophy:** "Apple New Design Language" - Minimalist, typography-focused, text-based navigation. Warm editorial mood with emphasis on data and ritual.
*   **Core Problem Solved:** The "Aspiration vs. Reality" gap. People set habits but forget them because their calendar is a mess.

---

## 2. Status & Progress
*   [x] **Foundation:** React + Vite + Tailwind + Firebase.
*   [x] **Authentication:** Google Auth with Calendar & Tasks scopes.
*   [x] **UI Version 2.0:** Transitioned from big tiles to minimalist text-menu navigation ("Briefing", "Routine", "Growth").
*   [x] **The Briefing:** AI-generated daily summary based on calendar and energy state.
*   [x] **The Ritual (Routine):** Habit tracking with streak logic and "Anchor" mapping.
*   [x] **Growth (Tasks):** Goal tracking integrated with Google Tasks.
*   [x] **Saathi Companion:** AI chat interface for habit creation and scheduling assistance.
*   [ ] **Refinement:** Polishing animations and cross-device responsiveness.

---

## 3. Core Features
*   **AI Habit Stacking:** Gemini identifies "Anchor Points" in your schedule for habit suggestions.
*   **Energy-Aware Dashboard:**
    *   **Morning Briefing:** Minimalist text summary of the day.
    *   **Energy State:** 1-5 scale capture to re-sort priorities.
*   **Bottom Text Menu:** Minimalist navigation following premium mobile app patterns.
*   **Integrated Saathi:** A companion that stays in the background until needed, accessible via button.

---

## 4. Technical Architecture
*   **Frontend:** React (Vite) + Tailwind CSS + Framer Motion.
*   **Backend:** Firebase (Auth, Firestore).
*   **AI Layer:** Gemini 1.5 Flash (via `@google/genai`).
*   **Integrations:** Google Calendar API, Google Tasks API.
*   **Data Model:**
    *   `Habit`: Definition (name, frequency, target_time).
    *   `HabitLog`: Daily completion status, energy_at_time.
    *   `Task`: Energy-weighted personal tasks.

---

## 5. Security & Invariants
*   **Siloed Data:** Strict Firestore rules (`isOwner()`) for all collections.
*   **Integrity:** Automatic `userId` tagging and server-side timestamp validation.
*   **Privacy:** External API tokens stored only in session/local state (handled by Google Auth).
