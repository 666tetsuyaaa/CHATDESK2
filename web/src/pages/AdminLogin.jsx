import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import FieldError from "../components/FieldError.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { hasErrors, serverErrors, validateEmail } from "../utils/validation.js";
import ustpLogo from "../assets/1.png";

const MAIL_ICON = (
  <path
    d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3.5 6.5l8.5 6 8.5-6"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const LOCK_ICON = (
  <>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </>
);

const EYE_ICON = (
  <>
    <path
      d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
  </>
);

const EYE_OFF_ICON = (
  <>
    <path
      d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M6.6 6.7C4.2 8.3 2 12 2 12s3.6 7 10 7c1.8 0 3.36-.4 4.7-1.02M9.9 5.1A9.3 9.3 0 0 1 12 5c6.4 0 10 7 10 7-.45.85-1.4 2.4-2.87 3.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    const found = {
      email: validateEmail(email),
      password: password ? null : "Password is required.",
    };
    setFieldErrors(found);
    if (hasErrors(found)) return;

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      if (!["superadmin", "office_admin"].includes(user.role)) {
        // Don't leave a student's session behind in the dashboard.
        await logout();
        setErrorMessage("This account is not authorized to access the admin dashboard.");
        return;
      }
      navigate("/tickets");
    } catch (error) {
      // The reason (wrong password, deactivated, rate limited) is in
      // non_field_errors or message - not the generic validation text.
      const { general } = serverErrors(error, "Can't reach ChatDesk right now. Please try again.");
      setErrorMessage(general ?? "Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col font-plus-jakarta lg:flex-row">
      {/* Left panel: navy-to-navy-dark branding, kept ChatDesk's own palette
          (not the reference's blue/violet) per explicit brand instruction. */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-navy to-navy-dark px-14 py-14 lg:flex lg:w-[45%] lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-glass/10 blur-3xl" />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="-80" y1="800" x2="520" y2="0" stroke="white" strokeWidth="1" />
          <line x1="40" y1="800" x2="640" y2="0" stroke="white" strokeWidth="1" />
          <line x1="160" y1="800" x2="760" y2="0" stroke="white" strokeWidth="1" />
          <line x1="280" y1="800" x2="880" y2="0" stroke="white" strokeWidth="1" />
        </svg>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg bg-glass/10 p-1.5 ring-1 ring-white/20">
            <img src={ustpLogo} alt="ChatDesk logo" className="h-full w-full object-contain" />
          </div>
          <span className="text-xl font-bold text-white">
            Chat<span className="text-gold">Desk</span>
          </span>
        </div>

        <div className="relative z-10 max-w-sm">
          <h1 className="mb-3 text-3xl font-bold leading-tight text-white">
            Welcome to ChatDesk
          </h1>
          <p className="text-base leading-relaxed text-white/70">
            Your central workspace for managing student support — FAQs, tickets, and inquiries,
            organized by office.
          </p>
        </div>

        <p className="relative z-10 text-sm text-white/50">
          © 2026 ChatDesk — USTP Office of Student Affairs.
        </p>
      </div>

      {/* Right panel: sign-in form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12 sm:py-16 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg bg-navy p-1.5">
              <img src={ustpLogo} alt="ChatDesk logo" className="h-full w-full object-contain" />
            </div>
            <span className="text-xl font-bold text-navy">
              Chat<span className="text-gold">Desk</span>
            </span>
          </div>

          <h2 className="mb-2 text-3xl font-bold text-navy">Welcome back, Admin</h2>
          <p className="mb-8 text-sm text-gray-500">
            Sign in to manage FAQs, tickets, and student inquiries.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-navy">
                Email Address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {MAIL_ICON}
                  </svg>
                </span>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@ustp.edu.ph"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-sm text-navy placeholder:text-gray-400 transition-colors duration-150 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 ${
                    fieldErrors.email ? "border-red-400" : "border-gray-200"
                  }`}
                />
              </div>
              <FieldError message={fieldErrors.email} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="admin-password" className="block text-sm font-medium text-navy">
                  Password
                </label>
                <Link
                  to="/reset-password"
                  className="rounded text-sm font-medium text-gold outline-none transition-colors duration-150 hover:text-navy focus-visible:ring-2 focus-visible:ring-gold/60"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-gray-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {LOCK_ICON}
                  </svg>
                </span>
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-11 text-sm text-navy placeholder:text-gray-400 transition-colors duration-150 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30 ${
                    fieldErrors.password ? "border-red-400" : "border-gray-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 outline-none transition-colors duration-150 hover:text-navy focus-visible:text-navy"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {showPassword ? EYE_OFF_ICON : EYE_ICON}
                  </svg>
                </button>
              </div>
              <FieldError message={fieldErrors.password} />
            </div>

            {errorMessage && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy py-3 text-sm font-bold text-white outline-none transition-colors duration-150 hover:bg-navy-dark focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {isSubmitting ? "Signing in..." : "Log In"}
            </button>
          </form>
          {/*
            Note: admin_login.png (the original approved prototype) includes a
            "Sign up here" link, but claude/API_CONTRACT.md states admin accounts
            are created manually, not self-registered - omitted on purpose.
            Student/Faculty switching and social login are omitted too - this is
            strictly an Admin (Super Admin / Office Admin) login, and there's no
            OAuth backend behind any social provider. Forgot Password *is* wired
            up (see above) - the password-reset endpoints already existed for
            mobile and aren't role-restricted.
          */}
        </div>
      </div>
    </div>
  );
}
