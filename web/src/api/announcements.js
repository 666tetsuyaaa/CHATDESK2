import { getAllPages } from "./allPages.js";
import axiosClient from "./axiosClient.js";

export const getAnnouncements = () => getAllPages("/announcements/");

export const createAnnouncement = (payload) => axiosClient.post("/announcements/", payload);

export const updateAnnouncement = (announcementId, payload) =>
  axiosClient.patch(`/announcements/${announcementId}/`, payload);

export const deleteAnnouncement = (announcementId) =>
  axiosClient.delete(`/announcements/${announcementId}/`);
