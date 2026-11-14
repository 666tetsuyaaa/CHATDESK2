import { useState } from "react";
import FieldError, { invalidInput } from "./FieldError.jsx";
import { hasErrors, maxLength, requiredText, serverErrors, validateOfficeCode } from "../utils/validation.js";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function OfficeFormModal({ initialOffice, onSave, onClose }) {
  const [name, setName] = useState(initialOffice?.name ?? "");
  const [code, setCode] = useState(initialOffice?.code ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    const found = {
      name: requiredText(name, "Office name") ?? maxLength(name, 150, "Office name"),
      code: validateOfficeCode(code),
    };
    setErrors(found);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), code: code.trim().toUpperCase() });
      onClose();
    } catch (error) {
      const { fields, general } = serverErrors(error, "Could not save this office.");
      setErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
      >
        <h3 className="mb-4 text-lg font-bold text-navy">
          {initialOffice ? "Edit Office" : "Add Office"}
        </h3>

        <div className="mb-3">
          <label htmlFor="office-name" className="mb-1 block text-sm text-gray-600">Name</label>
          <input
            id="office-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. College of Information Technology and Computing"
            aria-invalid={Boolean(errors.name)}
            className={`${FIELD_CLASS} ${invalidInput(errors.name)}`}
          />
          <FieldError message={errors.name} />
        </div>

        <div className="mb-4">
          <label htmlFor="office-code" className="mb-1 block text-sm text-gray-600">
            Ticket code prefix <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="office-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={10}
            placeholder="e.g. OSA - left blank, one is made from the name"
            aria-invalid={Boolean(errors.code)}
            className={`${FIELD_CLASS} uppercase ${invalidInput(errors.code)}`}
          />
          <FieldError message={errors.code} />
          <p className="mt-1 text-xs text-gray-500">
            Starts this office&apos;s ticket codes, e.g. {(code.trim() || "OSA").toUpperCase()}103126001.
            Changing it doesn&apos;t change existing tickets.
          </p>
        </div>

        {errorMessage && <p role="alert" className="mb-3 text-sm text-red-600">{errorMessage}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-gray-500 transition-colors hover:text-navy"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-navy px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
