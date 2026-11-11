// USTP course codes and names. Must match the Course TextChoices in
// backend/users/models.py, or registration will 400 on any value the
// backend doesn't recognize. Shared by Register (the picker) and Profile
// (the course name).
export const COURSE_OPTIONS = [
  // Information Technology / Computer Science
  { label: "BS Information Technology", value: "BSIT" },
  { label: "BS Computer Science", value: "BSCS" },
  { label: "BS Data Science", value: "BSDS" },
  { label: "Bachelor in Technology Communication Management", value: "BTCM" },
  // Engineering
  { label: "BS Architecture", value: "BSARCH" },
  { label: "BS Civil Engineering", value: "BSCE" },
  { label: "BS Computer Engineering", value: "BSCPE" },
  { label: "BS Electrical Engineering", value: "BSEE" },
  { label: "BS Electronics Engineering", value: "BSECE" },
  { label: "BS Geodetic Engineering", value: "BSGE" },
  { label: "BS Mechanical Engineering", value: "BSME" },
  // Technology
  { label: "BS Autotronics", value: "BSAUTO" },
  { label: "BS Electro-Mechanical Technology", value: "BSEMT" },
  { label: "BS Electronics Technology", value: "BSELT" },
  { label: "BS Energy Systems and Management", value: "BSESM" },
  { label: "BS Manufacturing Engineering Technology", value: "BSMFG" },
  { label: "Bachelor of Technology, Operations, and Management", value: "BTOM" },
  // Education
  { label: "Bachelor in Technology and Livelihood Education", value: "BTLED" },
  { label: "Bachelor in Technical-Vocational Teacher Education", value: "BTVTED" },
  { label: "BS Secondary Education", value: "BSED" },
  { label: "BS Elementary Education", value: "BEED" },
  // Not yet confirmed on the official list
  { label: "BS Nursing", value: "BSN" },
];

export function courseName(code: string | null | undefined) {
  if (!code) return "—";
  return COURSE_OPTIONS.find((option) => option.value === code)?.label ?? code;
}
