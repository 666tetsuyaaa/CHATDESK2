import axiosClient from "./axiosClient.js";

// For lists a page shows in full (phases, announcements, offices in
// dropdowns): the API pages them 20 at a time, so this asks for page 1, 2, ...
// until there is no next page. Resolves to { data: [all rows] }, so callers
// reading `res.data.results ?? res.data` keep working.
export async function getAllPages(path, params = {}) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const { data } = await axiosClient.get(path, { params: { ...params, page } });
    if (Array.isArray(data)) return { data };
    rows.push(...(data.results ?? []));
    if (!data.next) return { data: rows };
  }
}
