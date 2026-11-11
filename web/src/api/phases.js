import { getAllPages } from "./allPages.js";
import axiosClient from "./axiosClient.js";

export const getPhases = () => getAllPages("/phases/");

export const createPhase = (payload) => axiosClient.post("/phases/", payload);

export const updatePhase = (phaseId, payload) =>
  axiosClient.patch(`/phases/${phaseId}/`, payload);

export const deletePhase = (phaseId) => axiosClient.delete(`/phases/${phaseId}/`);

export const extractPhasesFromPdf = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return axiosClient.post("/phases/extract/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 180000,
  });
};
