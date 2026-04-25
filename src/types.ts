import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  latestEnergyLevel?: number; // 1-5
  createdAt: Timestamp;
}

export type HabitFrequency = 'daily' | 'weekly' | 'custom';
export type HabitStatus = 'completed' | 'skipped' | 'failed';

export interface Habit {
  id: string;
  userId: string;
  name: string;
  frequency: HabitFrequency;
  targetTime?: string; // HH:mm
  anchorEventId?: string;
  streak: number;
  createdAt: Timestamp;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  status: HabitStatus;
  energyAtTime?: number;
  loggedAt: Timestamp;
}

export interface JournalEntry {
  id: string;
  userId: string;
  content: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  energyLevel: number;
  type: 'reflection' | 'mind-dump';
  createdAt: Timestamp;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  due?: Timestamp;
  energyRequired: number; // 1-5
  isCompleted: boolean;
  completedAt?: Timestamp;
  googleTaskId?: string;
  createdAt: Timestamp;
}
