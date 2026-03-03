import { create } from "zustand";
import type { User } from "@clipvibe/shared";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Definition of Auth status
interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initAuth: () => Promise<() => void>; // Subscription
}

// Convert from Supabase Data to App Data
const mapSupabaseUser = (session: Session | null): User | null => {
  const u = session?.user;

  if (!u || !u.email) return null;
  return {
    id: u.id,
    email: u.email,
    avatar_url: (u.user_metadata?.avatar_url as string | undefined) ?? null,
    created_at: u.created_at,
  };
};

// Create Zustand store: manage global status
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true, // at the begining
  initialized: false,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  // Certification initialization
  initAuth: async () => {
    if (get().initialized) return () => {};

    set({ loading: true }); // start to check

    // 1. load current session
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // 2. set user status based on session
    set({
      user: mapSupabaseUser(session), // mapping Data
      loading: false, // end to check
      initialized: true,
    });
    // 3. subscribe Certification Status Change
    const { data } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        set({
          user: mapSupabaseUser(nextSession),
          loading: false,
        });
      },
    );
    // 4. Unsubscribe
    return () => data.subscription.unsubscribe();
  },
}));
