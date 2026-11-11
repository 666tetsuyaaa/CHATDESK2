import { useState } from "react";
import FieldError, { invalidInput } from "./FieldError.jsx";
import { LIMITS, hasErrors, maxLength, requiredText, serverErrors } from "../utils/validation.js";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function AnnouncementFormModal({ initialAnnouncement, onSave, onClose }) {
  const [title, setTitle] = useState(initialAnnouncement?.title ?? "");
  const [content, setContent] = useState(initialAnnouncement?.content ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    const found = {
      title: requiredText(title, "Title") ?? maxLength(title, LIMITS.announcementTitle, "Title"),
      content: requiredText(content, "Content") ?? maxLength(content, LIMITS.announcementContent, "Content"),
    };
    setErrors(found);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim() });
      onClose();
    } catch (error) {
      const { fields, general } = serverErrors(error, "Could not save this announcement.");
      setErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
      >
        <h3 className="mb-4 text-lg font-bold text-navy">
          {initialAnnouncement ? "Edit Announcement" : "Broadcast Announcement"}
        </h3>

        <div className="mb-3">
          <label htmlFor="announcement-title" className="mb-1 block text-sm text-gray-600">Title</label>
          <input
            id="announcement-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(errors.title)}
            className={`${FIELD_CLASS} ${invalidInput(errors.title)}`}
          />
          <FieldError message={errors.title} />
        </div>

        <div className="mb-4">
          <label htmlFor="announcement-content" className="mb-1 block text-sm text-gray-600">Content</label>
          <textarea
            id="announcement-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            aria-invalid={Boolean(errors.content)}
            className={`${FIELD_CLASS} ${invalidInput(errors.content)}`}
          />
          <div className="flex justify-between">
            <FieldError message={errors.content} />
            <span className="ml-auto mt-1 text-xs text-gray-500">
              {content.trim().length}/{LIMITS.announcementContent}
            </span>
          </div>
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
            {isSaving ? "Broadcasting..." : "Broadcast"}
          </button>
        </div>
      </form>
    </div>
  );
}
