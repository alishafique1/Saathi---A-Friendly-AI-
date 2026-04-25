import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Habit, Task, HabitLog, JournalEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Models
const BRAIN_MODEL = "gemini-3.1-pro-preview";
const FAST_MODEL = "gemini-3-flash-preview";

export const saathiTools: FunctionDeclaration[] = [
  {
    name: "create_habit",
    description: "Launch a new habit for the user. Example: Daily meditation at 8am.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the habit" },
        frequency: { 
          type: Type.STRING, 
          enum: ["daily", "weekly"],
          description: "How often to do it"
        },
        targetTime: { type: Type.STRING, description: "Preferred time (e.g., '08:00')" },
      },
      required: ["name", "frequency"],
    },
  },
  {
    name: "create_goal",
    description: "Set a new specific goal or task for the user. If they want to track it externally, this will also sync to Google Tasks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The task or goal description" },
        energyRequired: { 
          type: Type.NUMBER, 
          description: "Energy required from 1 (low) to 5 (high)" 
        },
        syncToGoogleTasks: { type: Type.BOOLEAN, description: "Whether to sync this to Google Tasks" },
      },
      required: ["title", "energyRequired"],
    },
  },
  {
    name: "add_calendar_event",
    description: "Schedule an event in the user's Google Calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: "Title of the event" },
        startDateTime: { type: Type.STRING, description: "ISO 8601 start time (e.g., 2024-04-25T17:00:00Z)" },
        endDateTime: { type: Type.STRING, description: "ISO 8601 end time" },
        description: { type: Type.STRING, description: "Optional description" },
      },
      required: ["summary", "startDateTime", "endDateTime"],
    },
  }
];

export async function getSaathiBriefing(habits: Habit[], tasks: Task[], energyLevel: number, recentJournals?: JournalEntry[]) {
  const prompt = `
    You are Saathi, a warm and supportive friend. Your name means "companion" in Urdu/Hindi.
    Based on their current state, give them a simple, friendly 1-2 sentence message.
    
    Current State:
    - Energy: ${energyLevel}/5
    - Habits: ${habits.map(h => h.name).join(', ')}
    - Tasks: ${tasks.map(t => t.title).join(', ')}
    ${recentJournals?.length ? `- Latest Thoughts: ${recentJournals[0].content}` : ''}
  `;

  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        systemInstruction: "You are Saathi, a supportive friend. Speak simply and kindly. Avoid jargon."
      }
    });
    return response.text;
  } catch (error) {
    return "I'm right here with you. Let's take it easy today.";
  }
}

export async function getDriftSuggestion(currentEventName: string, minutesLate: number, habits: Habit[]) {
  const prompt = `
    The user is late for "${currentEventName}" by ${minutesLate} minutes.
    Current habits: ${habits.map(h => h.name).join(', ')}.
    As Saathi, suggest a simple adjustment. Max 2 sentences.
  `;

  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    return "Time is moving fast! Should we adjust our schedule slightly?";
  }
}

export async function getWeeklyAnalysis(logs: HabitLog[], habits: Habit[]) {
  const prompt = `
    Analyze logs:
    ${logs.map(l => `${habits.find(h => h.id === l.habitId)?.name}: ${l.status}`).join('\n')}
    
    Provide 2 simple "Friend Insights" as a JSON array of strings.
  `;

  try {
    const response = await ai.models.generateContent({
      model: BRAIN_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    return ["You're showing up for yourself, that's what matters.", "Try to notice when you have the most energy."];
  }
}

export async function getTodayBriefing(
  habits: Habit[], 
  habitLogs: HabitLog[], 
  tasks: Task[], 
  events: CalendarEvent[],
  energyLevel: number
) {
  const completedHabits = habitLogs.filter(l => l.status === 'completed' && l.loggedAt.toDate().toDateString() === new Date().toDateString());
  const completedTasks = tasks.filter(t => t.isCompleted);
  const upcomingEvents = events.filter(e => new Date(e.start.dateTime || e.start.date || '').getTime() > Date.now());

  const prompt = `
    Analyze this user's day so far:
    - Energy Level: ${energyLevel}/5
    - Completed Habits: ${completedHabits.length} (${completedHabits.map(l => habits.find(h => h.id === l.habitId)?.name).join(', ')})
    - Completed Goals: ${completedTasks.length} (${completedTasks.map(t => t.title).join(', ')})
    - Upcoming Events: ${upcomingEvents.length} (${upcomingEvents.map(e => e.summary).join(', ')})

    Provide a very warm, supportive "Friend's Overview" of their progress and energy expenditure. 
    Keep it to 2-3 encouraging sentences. Use simple, friendly language.
  `;

  try {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        systemInstruction: "You are Saathi, a supportive friend. Speak simply and kindly."
      }
    });
    return response.text;
  } catch (error) {
    return "You're making steady progress today, and I'm proud of you for showing up. Remember to breathe and check in with your energy as you move forward.";
  }
}

export async function startSaathiChat(history: any[], currentContext: any) {
  const systemInstruction = `
    You are Saathi, an AI life companion. You help users navigate their daily life with kindness.
    You have tools to create habits, goals, and calendar events. 
    
    Current Context:
    - Energy: ${currentContext.energyLevel}/5
    - Active Habits: ${currentContext.habits.map((h: any) => h.name).join(', ')}
    - Active Goals: ${currentContext.tasks.map((t: any) => t.title).join(', ')}
    - Time: ${new Date().toISOString()}

    Rules:
    1. Be conversational and warm.
    2. Use tools whenever the user expresses intent to do something (starting a habit, setting a goal, scheduling).
    3. Keep responses relatively short.
    4. If you use a tool, confirm it to the user after the tool response is processed.
  `;

  try {
    const response = await ai.models.generateContent({
      model: BRAIN_MODEL,
      contents: history,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: saathiTools }],
      }
    });

    return response;
  } catch (error) {
    console.error("Saathi Chat Error:", error);
    throw error;
  }
}
