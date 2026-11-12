// USTP CDO programs (official list, November 2026) - one entry per major.
// Must match the Course TextChoices in backend/users/models.py, or
// registration will 400 on any value the backend doesn't recognize. Shared by
// Register (the picker) and Profile (the course name).
export const COURSE_OPTIONS = [
  // Information Technology / Computing
  { label: "BS Information Technology", value: "BSIT" },
  { label: "BS Computer Science", value: "BSCS" },
  { label: "BS Data Science", value: "BSDS" },
  { label: "BS Technology Communication Management", value: "BTCM" },
  // Engineering & Architecture
  { label: "BS Architecture", value: "BSARCH" },
  { label: "BS Civil Engineering", value: "BSCE" },
  { label: "BS Computer Engineering", value: "BSCPE" },
  { label: "BS Electrical Engineering", value: "BSEE" },
  { label: "BS Electronics Engineering", value: "BSECE" },
  { label: "BS Geodetic Engineering", value: "BSGE" },
  { label: "BS Mechanical Engineering", value: "BSME" },
  // Science & Mathematics
  { label: "BS Applied Physics", value: "BSAP" },
  { label: "BS Applied Mathematics", value: "BSAMATH" },
  { label: "BS Chemistry", value: "BSCHEM" },
  { label: "BS Environmental Science - Environmental Management and Technology", value: "BSES-EMT" },
  { label: "BS Environmental Science - Natural Resource Management", value: "BSES-NRM" },
  { label: "BS Food Technology", value: "BSFT" },
  // Technology
  { label: "BS Autotronics", value: "BSAUTO" },
  { label: "BS Electronics Technology - Electronics Systems", value: "BSELT-ES" },
  { label: "BS Electronics Technology - Multimedia System Technology", value: "BSELT-MST" },
  { label: "BS Electronics Technology - Telecommunications & Networks", value: "BSELT-TN" },
  { label: "BS Energy Systems and Management - Electrical Machines Control & Maintenance", value: "BSESM-EMCM" },
  { label: "BS Energy Systems and Management - Power System Distribution with Eco-Design", value: "BSESM-PSDE" },
  { label: "BS Electro-Mechanical Technology - Mechatronics & Robotics", value: "BSEMT-MR" },
  { label: "BS Electro-Mechanical Technology - Industrial Automation", value: "BSEMT-IA" },
  { label: "BS Manufacturing Engineering Technology - Mechanical Design & Fabrication", value: "BSMFG" },
  { label: "Bachelor of Technology, Operations, and Management", value: "BTOM" },
  // Education
  { label: "Bachelor in Technology and Livelihood Education - Home Economics", value: "BTLED-HE" },
  { label: "Bachelor in Technology and Livelihood Education - Industrial Arts", value: "BTLED-IA" },
  { label: "Bachelor in Technical-Vocational Teacher Education - Computer System Servicing", value: "BTVTED-CSS" },
  { label: "Bachelor in Technical-Vocational Teacher Education - Fashion and Garments", value: "BTVTED-FG" },
  { label: "Bachelor in Technical-Vocational Teacher Education - Food Service Management", value: "BTVTED-FSM" },
  { label: "Bachelor of Secondary Education - Science", value: "BSED-SCI" },
  { label: "Bachelor of Secondary Education - Mathematics", value: "BSED-MATH" },
  // Other
  { label: "BS Nursing", value: "BSN" },
];

// Courses from the earlier list. Not offered when registering, but an
// account that already has one still shows its name on Profile.
const RETIRED_COURSE_NAMES: Record<string, string> = {
  BTLED: "Bachelor in Technology and Livelihood Education",
  BTVTED: "Bachelor in Technical-Vocational Teacher Education",
  BSED: "BS Secondary Education",
  BEED: "BS Elementary Education",
  BSELT: "BS Electronics Technology",
  BSESM: "BS Energy Systems and Management",
  BSEMT: "BS Electro-Mechanical Technology",
};

export function courseName(code: string | null | undefined) {
  if (!code) return "—";
  return COURSE_OPTIONS.find((option) => option.value === code)?.label ?? RETIRED_COURSE_NAMES[code] ?? code;
}
