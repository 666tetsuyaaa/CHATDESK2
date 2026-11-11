// Mirrors the backend's input rules (users/validators.py and the office,
// FAQ, ticket, phase and announcement serializers), so a form never passes
// here and then fails on the server. Rules that need server data (common
// passwords, duplicates) still come back as field errors via serverErrors().

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCHOOL_ID_PATTERN = /^\d[\d-]{4,18}\d$/;
const OFFICE_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
const INTENT_KEYWORD_PATTERN = /^[A-Za-z0-9_]{2,100}$/;
const HAS_LETTER = /\p{L}/u;
const BROKEN_CHARACTER = "�";

export const LIMITS = {
  name: 150,
  faqQuestion: 300,
  faqAnswerMin: 15,
  announcementTitle: 200,
  announcementContent: 5000,
  phaseName: 100,
  phaseGuidance: 500,
  phaseQuestions: 5,
  phaseQuestion: 200,
  ticketTitle: 100,
  ticketCategory: 100,
  resolution: 5000,
  ticketMessage: 2000,
};

export function requiredText(value, label) {
  return value.trim() ? null : `${label} is required.`;
}

export function maxLength(value, max, label) {
  return value.trim().length > max ? `${label} must be ${max} characters or fewer.` : null;
}

export function validateEmail(value) {
  if (!value.trim()) return "Email is required.";
  return EMAIL_PATTERN.test(value.trim()) ? null : "Enter a valid email address.";
}

export function validateNewPassword(value) {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (/^\d+$/.test(value)) return "Password can't be only numbers.";
  return null;
}

export function validatePersonName(value, label) {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (!HAS_LETTER.test(trimmed)) return `${label} must contain letters.`;
  return maxLength(trimmed, LIMITS.name, label);
}

export function validateSchoolId(value, { required = true } = {}) {
  const trimmed = value.trim();
  if (!trimmed) return required ? "School ID is required." : null;
  return SCHOOL_ID_PATTERN.test(trimmed)
    ? null
    : "Use 6-20 digits, hyphens allowed (e.g. 2023304440 or 2026-00006).";
}

export function validateOfficeCode(value) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null; // optional - generated from the name
  return OFFICE_CODE_PATTERN.test(trimmed) ? null : "Use 2-10 letters or numbers, no spaces (e.g. OSA, REG).";
}

export function validateIntentKeyword(value) {
  if (!value.trim()) return "Intent keyword is required.";
  return INTENT_KEYWORD_PATTERN.test(value.trim())
    ? null
    : "Use 2-100 letters, numbers or underscores, no spaces (e.g. scholarship_requirements).";
}

export function noBrokenCharacters(value) {
  return value.includes(BROKEN_CHARACTER)
    ? `Contains a broken character (${BROKEN_CHARACTER}) - please retype that part.`
    : null;
}

/** First failing check's message, or null. */
export function firstError(...results) {
  return results.find(Boolean) ?? null;
}

export function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}

/** Splits an API error into per-field messages and one general message. */
export function serverErrors(error, fallback) {
  const data = error.response?.data;
  const details = data?.details ?? {};
  const fields = {};
  for (const [field, messages] of Object.entries(details)) {
    if (field !== "non_field_errors") {
      fields[field] = Array.isArray(messages) ? messages[0] : String(messages);
    }
  }
  const general =
    details.non_field_errors?.[0] ??
    (Object.keys(fields).length ? null : data?.message ?? fallback);
  return { fields, general };
}
