import { createClient } from "@supabase/supabase-js";
import type { HabitState } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function loadRemoteHabitState(userId: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("habit_whale_data")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.payload ?? null) as HabitState | null;
}

export async function saveRemoteHabitState(userId: string, payload: HabitState) {
  if (!supabase) return;

  const { error } = await supabase.from("habit_whale_data").upsert({
    user_id: userId,
    payload,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
