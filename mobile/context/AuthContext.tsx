import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import axiosClient, { onSessionExpired } from "../lib/axiosClient";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "../lib/tokenStorage";

export type ChatDeskUser = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "student" | "superadmin";
  course: string | null;
  school_id: string | null;
  is_email_verified: boolean;
  profile_picture: string | null;
  created_at: string;
};

type RegisterPayload = {
  first_name: string;
  last_name: string;
  school_id: string;
  email: string;
  password: string;
  course: string;
};

type AuthContextValue = {
  currentUser: ChatDeskUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<ChatDeskUser>;
  register: (payload: RegisterPayload) => Promise<ChatDeskUser>;
  logout: () => Promise<void>;
  updateCurrentUser: (partial: Partial<ChatDeskUser>) => void;
  // True after a session died on its own (not a manual logout), so the
  // login screen can say why the student is back there.
  sessionExpired: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<ChatDeskUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    onSessionExpired(() => {
      setCurrentUser((prev) => {
        if (prev) setSessionExpired(true);
        return null;
      });
    });
    return () => onSessionExpired(null);
  }, []);

  useEffect(() => {
    (async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await axiosClient.get<ChatDeskUser>("/auth/me/");
        setCurrentUser(data);
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await axiosClient.post("/auth/login/", { email, password });
    await saveTokens(data.access, data.refresh);
    setSessionExpired(false);
    setCurrentUser(data.user);
    return data.user as ChatDeskUser;
  };

  const register = async (payload: RegisterPayload) => {
    const { data } = await axiosClient.post("/auth/register/", payload);
    await saveTokens(data.access, data.refresh);
    setSessionExpired(false);
    setCurrentUser(data.user);
    return data.user as ChatDeskUser;
  };

  const logout = async () => {
    const refreshToken = await getRefreshToken();
    try {
      if (refreshToken) {
        await axiosClient.post("/auth/logout/", { refresh: refreshToken });
      }
    } catch {
      // Best-effort: still clear the local session even if the backend
      // couldn't blacklist the token (e.g. it's already expired/invalid).
    } finally {
      await clearTokens();
      setCurrentUser(null);
    }
  };

  const updateCurrentUser = (partial: Partial<ChatDeskUser>) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, isLoading, login, register, logout, updateCurrentUser, sessionExpired }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
