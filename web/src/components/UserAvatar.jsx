import { useState } from "react";

function initialsFor(user) {
  if (user?.first_name || user?.last_name) {
    return `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?";
  }
  return user?.email ? user.email.slice(0, 2).toUpperCase() : "?";
}

// Profile photo with an initials fallback - also used when the photo URL is
// set but fails to load, so a broken image icon never shows.
export default function UserAvatar({ user, className = "h-9 w-9", ringClass = "" }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = user?.profile_picture;

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src)}
        className={`${className} shrink-0 rounded-full object-cover ${ringClass}`}
      />
    );
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-navy-dark ${ringClass}`}
    >
      {initialsFor(user)}
    </span>
  );
}
