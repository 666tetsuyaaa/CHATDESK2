import axiosClient from "./axiosClient.js";

export const getTickets = (params = {}) => axiosClient.get("/tickets/", { params });

// The page's tile numbers (staff, pending, resolved, ai, overdue) in one request.
export const getTicketCounts = () => axiosClient.get("/tickets/counts/");

export const getTicket = (ticketId) => axiosClient.get(`/tickets/${ticketId}/`);

export const updateTicket = (ticketId, payload) =>
  axiosClient.patch(`/tickets/${ticketId}/`, payload);

export const getTicketMessages = (ticketId) => axiosClient.get(`/tickets/${ticketId}/messages/`);

export const sendTicketMessage = (ticketId, body) =>
  axiosClient.post(`/tickets/${ticketId}/messages/`, { body });
