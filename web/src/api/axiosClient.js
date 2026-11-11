import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

const axiosClient = axios.create({ baseURL: BASE_URL });

// Attach the access token to every outgoing request.
axiosClient.interceptors.request.use((requestConfig) => {
  const accessToken = localStorage.getItem("chatdesk_access_token");
  if (accessToken) {
    requestConfig.headers.Authorization = `Bearer ${accessToken}`;
  }
  return requestConfig;
});

let isRefreshing = false;
let pendingRequests = [];

const resolvePendingRequests = (newAccessToken) => {
  pendingRequests.forEach(({ resolve }) => resolve(newAccessToken));
  pendingRequests = [];
};

// Requests that were waiting on a refresh that failed - fail them too,
// rather than leaving their pages loading forever.
const rejectPendingRequests = (refreshError) => {
  pendingRequests.forEach(({ reject }) => reject(refreshError));
  pendingRequests = [];
};

// On a 401, try to refresh the access token once, then replay the request.
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/token/refresh");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem("chatdesk_refresh_token");
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
        const { data } = await axios.post(
          `${BASE_URL}/auth/token/refresh/`,
          { refresh: refreshToken },
          { timeout: 15000 }
        );
        localStorage.setItem("chatdesk_access_token", data.access);
        // The backend rotates refresh tokens and blacklists the old one, so
        // the new one must be kept or the next refresh fails (~30 min logout).
        if (data.refresh) {
          localStorage.setItem("chatdesk_refresh_token", data.refresh);
        }
        resolvePendingRequests(data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return axiosClient(originalRequest);
      } catch (refreshError) {
        // Another tab may have rotated the token at the same moment - if a
        // newer one is already stored, retry with it instead of logging out.
        const latestRefresh = localStorage.getItem("chatdesk_refresh_token");
        const latestAccess = localStorage.getItem("chatdesk_access_token");
        if (latestRefresh && latestRefresh !== refreshToken && latestAccess) {
          resolvePendingRequests(latestAccess);
          originalRequest.headers.Authorization = `Bearer ${latestAccess}`;
          return axiosClient(originalRequest);
        }
        rejectPendingRequests(refreshError);
        // Log out only when the server refused the refresh token. A dropped
        // connection or server restart just fails this request.
        const status = refreshError.response?.status;
        if (status === 401 || status === 400) {
          localStorage.removeItem("chatdesk_access_token");
          localStorage.removeItem("chatdesk_refresh_token");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
