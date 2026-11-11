import axiosClient from "./axiosClient.js";

export const getFaqs = (params = {}) => axiosClient.get("/faqs/", { params });

export const createFaq = (payload) => axiosClient.post("/faqs/", payload);

export const updateFaq = (faqId, payload) =>
  axiosClient.patch(`/faqs/${faqId}/`, payload);

export const deleteFaq = (faqId) => axiosClient.delete(`/faqs/${faqId}/`);