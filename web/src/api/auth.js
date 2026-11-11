import axiosClient from "./axiosClient.js";

export const requestPasswordReset = (email) =>
  axiosClient.post("/auth/password-reset/request/", { email });

export const confirmPasswordReset = (email, code, newPassword) =>
  axiosClient.post("/auth/password-reset/confirm/", {
    email,
    code,
    new_password: newPassword,
  });

export const updateMe = (payload) => axiosClient.patch("/auth/me/", payload);
