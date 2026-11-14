import { useRef } from "react";

/**
 * Lists load again whenever the page or a filter changes, and the answers
 * can arrive out of order - an older, slower one used to overwrite the newer
 * list. Call the returned function when a load starts; it gives back a
 * check that is true only while that load is still the newest one.
 *
 *   const startLoad = useLatestLoad();
 *   const isLatest = startLoad();
 *   getThings().then((res) => { if (isLatest()) setThings(res.data); });
 */
export function useLatestLoad() {
  const latest = useRef(0);
  return () => {
    const id = ++latest.current;
    return () => id === latest.current;
  };
}

/**
 * A page that no longer exists (the filters changed and there are fewer
 * results now): the API answers 404. Go back to page 1 instead of showing
 * an error.
 */
export function isMissingPage(error, page) {
  return error?.response?.status === 404 && page > 1;
}
