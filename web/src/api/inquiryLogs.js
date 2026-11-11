import axiosClient from "./axiosClient.js";

export const getInquiryLogs = (params = {}) => axiosClient.get("/inquiry-logs/", { params });
export const getUnansweredQuestions = (params = {}) =>
  axiosClient.get("/inquiry-logs/unanswered/", { params });
