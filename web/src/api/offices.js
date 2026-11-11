import { getAllPages } from "./allPages.js";
import axiosClient from "./axiosClient.js";

export const getOffices = () => getAllPages("/offices/");

export const createOffice = (payload) => axiosClient.post("/offices/", payload);

export const updateOffice = (officeId, payload) =>
  axiosClient.patch(`/offices/${officeId}/`, payload);

export const deleteOffice = (officeId) => axiosClient.delete(`/offices/${officeId}/`);
