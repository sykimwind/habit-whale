export type AuthProvider = "email" | "google" | "demo";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  provider: AuthProvider;
  isRemote?: boolean;
};

export type HabitTone = "good" | "neutral" | "bad";

export type Habit = {
  id: string;
  title: string;
  category: string;
  categories?: string[];
  tone?: HabitTone;
  whenNote?: string;
  whereNote?: string;
  color: string;
  weekdays: number[];
  startDate: string;
  endDate?: string;
  order: number;
  active: boolean;
};

export type DateOverride = {
  add: string[];
  remove: string[];
};

export type HabitState = {
  habits: Habit[];
  categories: string[];
  completions: Record<string, Record<string, boolean>>;
  dateOverrides: Record<string, DateOverride>;
  dateOrders: Record<string, string[]>;
};

export type LoginMode = "login" | "signup";
