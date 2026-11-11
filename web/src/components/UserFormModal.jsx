import { useEffect, useState } from "react";
import { getColleges } from "../api/colleges.js";
import FieldError, { invalidInput } from "./FieldError.jsx";
import {
  hasErrors,
  serverErrors,
  validateEmail,
  validateNewPassword,
  validatePersonName,
  validateSchoolId,
} from "../utils/validation.js";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function UserFormModal({ initialUser, offices, onSave, onClose }) {
  const isEditing = Boolean(initialUser);
  const [firstName, setFirstName] = useState(initialUser?.first_name ?? "");
  const [lastName, setLastName] = useState(initialUser?.last_name ?? "");
  const [email, setEmail] = useState(initialUser?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initialUser?.role ?? "student");
  const [course, setCourse] = useState(initialUser?.course ?? "");
  const [schoolId, setSchoolId] = useState(initialUser?.school_id ?? "");
  const [office, setOffice] = useState(initialUser?.office ?? "");
  const [isActive, setIsActive] = useState(initialUser?.is_active ?? true);
  const [courses, setCourses] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");

  // The exact course list the backend accepts (served by /colleges/, which
  // groups them - shown here as one flat list).
  useEffect(() => {
    getColleges()
      .then((res) => setCourses(res.data.flatMap((group) => group.courses)))
      .catch(() => setCourses([]));
  }, []);

  const validate = () => ({
    first_name: validatePersonName(firstName, "First name"),
    last_name: validatePersonName(lastName, "Last name"),
    email: isEditing ? null : validateEmail(email),
    password: isEditing ? null : validateNewPassword(password),
    office: role === "office_admin" && !office ? "Choose the office this admin manages." : null,
    course: role === "student" && !course ? "Choose a course." : null,
    school_id: role === "student" ? validateSchoolId(schoolId, { required: !isEditing }) : null,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    const found = validate();
    setErrors(found);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      const shared = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
      };
      if (isEditing) {
        await onSave({
          ...shared,
          course: role === "student" ? course : null,
          school_id: role === "student" ? schoolId.trim() || null : null,
          office: role === "office_admin" ? office || null : null,
          is_active: isActive,
        });
      } else {
        await onSave({
          ...shared,
          email: email.trim(),
          password,
          ...(role === "student" ? { course, school_id: schoolId.trim() } : {}),
          ...(role === "office_admin" ? { office: office || null } : {}),
        });
      }
      onClose();
    } catch (err) {
      const { fields, general } = serverErrors(err, "Could not save this user.");
      setErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg"
      >
        <h3 className="mb-4 text-lg font-bold text-navy">
          {isEditing ? "Edit User" : "Add User"}
        </h3>

        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <label htmlFor="user-first-name" className="mb-1 block text-sm text-gray-600">First name</label>
            <input
              id="user-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              aria-invalid={Boolean(errors.first_name)}
              className={`${FIELD_CLASS} ${invalidInput(errors.first_name)}`}
            />
            <FieldError message={errors.first_name} />
          </div>
          <div className="flex-1">
            <label htmlFor="user-last-name" className="mb-1 block text-sm text-gray-600">Last name</label>
            <input
              id="user-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              aria-invalid={Boolean(errors.last_name)}
              className={`${FIELD_CLASS} ${invalidInput(errors.last_name)}`}
            />
            <FieldError message={errors.last_name} />
          </div>
        </div>

        {!isEditing && (
          <>
            <div className="mb-3">
              <label htmlFor="user-email" className="mb-1 block text-sm text-gray-600">Email</label>
              <input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)}
                className={`${FIELD_CLASS} ${invalidInput(errors.email)}`}
              />
              <FieldError message={errors.email} />
            </div>

            <div className="mb-3">
              <label htmlFor="user-password" className="mb-1 block text-sm text-gray-600">Password</label>
              <input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
                className={`${FIELD_CLASS} ${invalidInput(errors.password)}`}
              />
              <FieldError message={errors.password} />
            </div>
          </>
        )}

        <label htmlFor="user-role" className="mb-1 block text-sm text-gray-600">Role</label>
        <select
          id="user-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`mb-3 ${FIELD_CLASS}`}
        >
          <option value="student">Student</option>
          <option value="office_admin">Office Admin</option>
          <option value="superadmin">Super Admin</option>
        </select>

        {role === "office_admin" && (
          <div className="mb-3">
            <label htmlFor="user-office" className="mb-1 block text-sm text-gray-600">Office</label>
            <select
              id="user-office"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              aria-invalid={Boolean(errors.office)}
              className={`${FIELD_CLASS} ${invalidInput(errors.office)}`}
            >
              <option value="" disabled>Select an office</option>
              {(offices ?? []).map((o) => (
                <option key={o.office_id} value={o.office_id}>{o.name}</option>
              ))}
            </select>
            <FieldError message={errors.office} />
          </div>
        )}

        {role === "student" && (
          <>
            <div className="mb-3">
              <label htmlFor="user-course" className="mb-1 block text-sm text-gray-600">Course</label>
              <select
                id="user-course"
                value={course ?? ""}
                onChange={(e) => setCourse(e.target.value)}
                aria-invalid={Boolean(errors.course)}
                className={`${FIELD_CLASS} ${invalidInput(errors.course)}`}
              >
                <option value="" disabled>Select a course</option>
                {courses.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
              <FieldError message={errors.course} />
            </div>

            <div className="mb-3">
              <label htmlFor="user-school-id" className="mb-1 block text-sm text-gray-600">School ID</label>
              <input
                id="user-school-id"
                value={schoolId ?? ""}
                onChange={(e) => setSchoolId(e.target.value)}
                placeholder="e.g. 2023304440"
                aria-invalid={Boolean(errors.school_id)}
                className={`${FIELD_CLASS} ${invalidInput(errors.school_id)}`}
              />
              <FieldError message={errors.school_id} />
            </div>
          </>
        )}

        {isEditing && (
          <label className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-gold focus:ring-gold/40"
            />
            Active
          </label>
        )}

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
