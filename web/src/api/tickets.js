import axiosClient from "./axiosClient.js";

export const getTickets = (params = {}) => axiosClient.get("/tickets/", { params });

export const updateTicket = (ticketId, payload) =>
  axiosClient.patch(`/tickets/${ticketId}/`, payload);

export const getTicketMessages = (ticketId) => axiosClient.get(`/tickets/${ticketId}/messages/`);

export const sendTicketMessage = (ticketId, body) =>
  axiosClient.post(`/tickets/${ticketId}/messages/`, { body });
