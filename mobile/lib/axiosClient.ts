import axios, { type InternalAxiosRequestConfig } from "axios";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokenStorage";

// Set EXPO_PUBLIC_API_BASE_URL in your .env — must be your Jefferson's
// machine's LAN IP, not "localhost", since your phone/emulator is a
// separate device on the network. e.g. http://192.168.1.39:8000/api/v1
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// Without a timeout, an unreachable backend (server not running, wrong LAN
// IP, firewall) leaves requests hanging forever and buttons spin endlessly.
const axiosClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

axiosClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const accessToken = await getAccessToken();
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return config;
});

// AuthContext subscribes so a dead session drops the student back to the
// login screen, instead of every screen failing while still "logged in".
let sessionExpiredListener: (() => void) | null = null;

export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiredListener = listener;
}

let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (newAccessToken: string) => void;
  reject: (error: unknown) => void;
}> = [];

const resolvePendingRequests = (newAccessToken: string) => {
  pendingRequests.forEach(({ resolve }) => resolve(newAccessToken));
  pendingRequests = [];
};

const rejectPendingRequests = (error: unknown) => {
  pendingRequests.forEach(({ reject }) => reject(error));
  pendingRequests = [];
};

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/token/refresh");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({
            resolve: (newAccessToken) => {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              resolve(axiosClient(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });
        // The backend rotates refresh tokens and blacklists the old one, so
        // the new one must be kept or the next refresh fails (~30 min logout).
        await saveTokens(data.access, data.refresh ?? refreshToken);
        resolvePendingRequests(data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return axiosClient(originalRequest);
      } catch (refreshError) {
        await clearTokens();
        rejectPendingRequests(refreshError);
        sessionExpiredListener?.();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
