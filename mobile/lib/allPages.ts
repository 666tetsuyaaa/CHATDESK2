import axiosClient from "./axiosClient";

// The API pages lists 20 at a time. For lists shown in full (the office
// picker, the announcements feed) this asks for page 1, 2, ... until there
// is no next page, and returns every row.
export async function getAllPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const { data } = await axiosClient.get<{ results?: T[]; next?: string | null } | T[]>(path, {
      params: { page },
    });
    if (Array.isArray(data)) return data;
    rows.push(...(data.results ?? []));
    if (!data.next) return rows;
  }
}
