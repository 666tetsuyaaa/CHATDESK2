import { useRef, useState } from "react";
import { updateMe } from "../api/auth.js";
import FieldError, { invalidInput } from "../components/FieldError.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { hasErrors, serverErrors, validatePersonName } from "../utils/validation.js";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function initialsFor(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function AdminSettings() {
  const { currentUser, updateCurrentUser } = useAuth();
  const [firstName, setFirstName] = useState(currentUser?.first_name ?? "");
  const [lastName, setLastName] = useState(currentUser?.last_name ?? "");
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);

  const avatarSrc = previewUrl || currentUser?.profile_picture;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, profile_picture: "Choose an image file (JPG or PNG)." }));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setErrors((prev) => ({ ...prev, profile_picture: "Profile picture must be 2 MB or smaller." }));
      return;
    }
    setErrors((prev) => ({ ...prev, profile_picture: null }));
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    const found = {
      first_name: validatePersonName(firstName, "First name"),
      last_name: validatePersonName(lastName, "Last name"),
    };
    setErrors(found);
    if (hasErrors(found)) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("first_name", firstName.trim());
      formData.append("last_name", lastName.trim());
      if (selectedFile) {
        formData.append("profile_picture", selectedFile);
      }
      const { data } = await updateMe(formData);
      updateCurrentUser(data);
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setFeedback({ type: "success", message: "Profile updated." });
    } catch (error) {
      const { fields, general } = serverErrors(error, "Could not update profile.");
      setErrors(fields);
      if (general) setFeedback({ type: "error", message: general });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Signed in as</p>
        <p className="font-medium text-navy">{currentUser?.email}</p>
        <p className="text-sm text-gray-500">
          Role:{" "}
          {currentUser?.role === "superadmin"
            ? "Super Admin"
            : currentUser?.role === "office_admin"
            ? `Office Admin — ${currentUser?.office_name ?? "Unassigned"}`
            : currentUser?.role}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h3 className="text-sm font-semibold text-navy">Edit profile</h3>

        <div className="flex items-center gap-4">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="Profile"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy/10 text-lg font-bold text-navy">
              {initialsFor(firstName, lastName)}
            </div>
          )}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-navy transition-colors hover:border-gold"
            >
              Change photo
            </button>
            <p className="mt-1 text-xs text-gray-500">JPG or PNG, up to 2 MB.</p>
            <FieldError message={errors.profile_picture} />
          </div>
        </div>

        <div>
          <label htmlFor="settings-first-name" className="mb-1 block text-sm text-gray-600">First name</label>
          <input
            id="settings-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            aria-invalid={Boolean(errors.first_name)}
            className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 ${invalidInput(errors.first_name)}`}
          />
          <FieldError message={errors.first_name} />
        </div>

        <div>
          <label htmlFor="settings-last-name" className="mb-1 block text-sm text-gray-600">Last name</label>
          <input
            id="settings-last-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            aria-invalid={Boolean(errors.last_name)}
            className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 ${invalidInput(errors.last_name)}`}
          />
          <FieldError message={errors.last_name} />
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.type === "success" ? "text-status-resolved" : "text-red-600"}`}>
            {feedback.message}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-full bg-navy px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </section>
  );
}
