import axiosClient from "./axiosClient.js";

// [{ key, name, courses: [{ code, name }] }] - not paginated.
export const getColleges = () => axiosClient.get("/colleges/");
