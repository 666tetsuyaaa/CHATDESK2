// Inline message under a form field. Pair with invalidInput() on the field.
export default function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}

/** Extra classes for a field that failed validation. */
export function invalidInput(message) {
  return message ? "border-red-400 focus:ring-red-200" : "";
}
