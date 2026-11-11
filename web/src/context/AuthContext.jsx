import { createContext, useContext, useEffect, useState } from "react";
import axiosClient from "../api/axiosClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const accessToken = localStorage.getItem("chatdesk_access_token");
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    axiosClient
      .get("/auth/me/")
      .then((response) => setCurrentUser(response.data))
      .catch(() => {
        localStorage.removeItem("chatdesk_access_token");
        localStorage.removeItem("chatdesk_refresh_token");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await axiosClient.post("/auth/login/", { email, password });
    localStorage.setItem("chatdesk_access_token", data.access);
    localStorage.setItem("chatdesk_refresh_token", data.refresh);
    setCurrentUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem("chatdesk_refresh_token");
    try {
      if (refreshToken) {
        await axiosClient.post("/auth/logout/", { refresh: refreshToken });
      }
    } finally {
      localStorage.removeItem("chatdesk_access_token");
      localStorage.removeItem("chatdesk_refresh_token");
      setCurrentUser(null);
    }
  };

  const updateCurrentUser = (partial) => {
    setCurrentUser((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, updateCurrentUser }}>
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
