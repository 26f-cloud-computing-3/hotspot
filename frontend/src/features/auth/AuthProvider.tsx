import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { supabase } from "../../lib/supabase";

/** The signed-in user's own row, as `GET /api/me` returns it. */
export interface Me {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** Null until it has loaded, and while signed out. */
  me: Me | null;
  /** Replaces `me` after the user edits their profile. */
  setMe: (me: Me) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const cachedUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Fires INITIAL_SESSION once the stored session (or an OAuth code in the
    // URL) has been resolved, then on every sign-in/out/token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // What was cached belongs to whoever was signed in; nobody else may see it.
      if (cachedUserId.current && cachedUserId.current !== next?.user.id) {
        queryClient.clear();
      }
      cachedUserId.current = next?.user.id;
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  // The backend creates the user's profile row on their first authenticated
  // request; ask for it right after sign-in so the row exists before it is needed.
  // Kept out of the onAuthStateChange callback, where calling supabase would deadlock.
  const { data: me = null } = useQuery({
    queryKey: queryKeys.me(userId),
    queryFn: () => apiGet<Me>("/api/me"),
    enabled: userId !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const setMe = useCallback(
    (next: Me) => queryClient.setQueryData(queryKeys.me(userId), next),
    [queryClient, userId],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      me,
      setMe,
      loading,
      signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, me, setMe, loading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
