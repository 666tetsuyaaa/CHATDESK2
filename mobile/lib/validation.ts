// Mirrors the backend's input rules (backend/users/validators.py and the
// password rules) so a form never passes here and then fails on the server.
// Rules that need server data (common passwords, duplicates) still come back
// as field errors - see serverFieldErrors().

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCHOOL_ID_PATTERN = /^\d[\d-]{4,18}\d$/;
const NAME_MAX_LENGTH = 150;

// A letter is any character with upper/lower case forms (covers ñ, é...).
// Avoids \p{L} regexes, which not every Hermes build supports.
function hasLetter(value: string) {
  return [...value].some((ch) => ch.toLowerCase() !== ch.toUpperCase());
}

export type FieldErrors = Record<string, string | null>;

export function validateEmail(value: string) {
  if (!value.trim()) return "Email is required.";
  return EMAIL_PATTERN.test(value.trim()) ? null : "Enter a valid email address.";
}

export function validateNewPassword(value: string) {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (/^\d+$/.test(value)) return "Password can't be only numbers.";
  return null;
}

export function validatePersonName(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (!hasLetter(trimmed)) return `${label} must contain letters.`;
  if (trimmed.length > NAME_MAX_LENGTH) return `${label} must be ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function validateSchoolId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "School ID is required.";
  return SCHOOL_ID_PATTERN.test(trimmed)
    ? null
    : "Use 6-20 digits, hyphens allowed (e.g. 2023304440 or 2026-00006).";
}

export function validateResetCode(value: string) {
  return /^\d{6}$/.test(value.trim()) ? null : "Enter the 6-digit code from your email.";
}

export function hasErrors(errors: FieldErrors) {
  return Object.values(errors).some(Boolean);
}

/** Per-field messages from an API error, plus one general message. */
export function serverFieldErrors(error: any, fallback: string) {
  const data = error?.response?.data;
  const details: Record<string, unknown> = data?.details ?? {};
  const fields: FieldErrors = {};
  for (const [field, messages] of Object.entries(details)) {
    if (field !== "non_field_errors") {
      fields[field] = Array.isArray(messages) ? String(messages[0]) : String(messages);
    }
  }
  const nonField = details.non_field_errors as string[] | undefined;
  const general =
    nonField?.[0] ??
    (Object.keys(fields).length ? null : error?.response ? data?.message ?? fallback : "Can't reach ChatDesk right now. Please try again.");
  return { fields, general };
}
