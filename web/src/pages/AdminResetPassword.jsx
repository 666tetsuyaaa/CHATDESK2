import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { confirmPasswordReset, requestPasswordReset } from "../api/auth.js";
import FieldError from "../components/FieldError.jsx";
import { hasErrors, serverErrors, validateEmail, validateNewPassword } from "../utils/validation.js";
import ustpLogo from "../assets/1.png";

export default function AdminResetPassword() {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRequestCode = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    const found = { email: validateEmail(email) };
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setIsSubmitting(true);
    try {
      const { data } = await requestPasswordReset(email);
      // dev_code only appears while the backend's Gmail App Password isn't
      // configured (see backend/.env) - it's the code shown directly here
      // instead of being emailed.
      if (data.dev_code) {
        setInfoMessage(`Dev mode: email isn't configured yet. Your code is ${data.dev_code}.`);
        setCode(data.dev_code);
      } else {
        setInfoMessage(data.message || "If that email is registered, a code has been sent.");
      }
      setStep("confirm");
    } catch (error) {
      setErrorMessage(error.response?.data?.message || "Unable to send a reset code right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    const found = {
      code: /^\d{6}$/.test(code.trim()) ? null : "Enter the 6-digit code from your email.",
      new_password: validateNewPassword(newPassword),
      confirm_password: newPassword === confirmPassword ? null : "Passwords do not match.",
    };
    setFieldErrors(found);
    if (hasErrors(found)) return;
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(email, code.trim(), newPassword);
      navigate("/login", { state: { resetSuccess: true } });
    } catch (error) {
      const { fields, general } = serverErrors(error, "Unable to reset password right now.");
      setFieldErrors(fields);
      setErrorMessage(general ?? "");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen font-plus-jakarta">
      <div className="flex w-full flex-col justify-center px-8 py-12 sm:px-16 lg:w-[42%] lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg bg-navy p-1.5">
              <img src={ustpLogo} alt="ChatDesk logo" className="h-full w-full object-contain" />
            </div>
            <span className="text-xl font-bold text-navy">
              Chat<span className="text-gold">Desk</span>
            </span>
          </div>

          <h1 className="mb-2 text-4xl font-bold text-navy">
            {step === "request" ? "Reset password" : "Enter code"}
          </h1>
          <p className="mb-10 text-base text-gray-500">
            {step === "request"
              ? "We'll send a reset code to your email."
              : "Enter the code we sent you and choose a new password."}
          </p>

          {step === "request" ? (
            <form onSubmit={handleRequestCode} noValidate className="space-y-5">
              <div>
                <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-navy">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="you@ustp.edu.ph"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`w-full border-b-2 bg-transparent py-2 text-base text-navy placeholder:text-gray-300 focus:border-gold focus:outline-none ${fieldErrors.email ? "border-red-400" : "border-gray-200"}`}
                />
                <FieldError message={fieldErrors.email} />
              </div>

              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-navy py-2.5 text-sm font-bold text-white transition hover:bg-navy-dark disabled:opacity-50"
              >
                {isSubmitting ? "Sending..." : "Send reset code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} noValidate className="space-y-5">
              {infoMessage && <p className="text-sm text-navy/70">{infoMessage}</p>}

              <div>
                <label htmlFor="reset-code" className="mb-1.5 block text-sm font-medium text-navy">6-digit code</label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  aria-invalid={Boolean(fieldErrors.code)}
                  className={`w-full border-b-2 bg-transparent py-2 text-base text-navy placeholder:text-gray-300 focus:border-gold focus:outline-none ${fieldErrors.code ? "border-red-400" : "border-gray-200"}`}
                />
                <FieldError message={fieldErrors.code} />
              </div>

              <div>
                <label htmlFor="reset-new-password" className="mb-1.5 block text-sm font-medium text-navy">New password</label>
                <input
                  id="reset-new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.new_password)}
                  className={`w-full border-b-2 bg-transparent py-2 text-base text-navy placeholder:text-gray-300 focus:border-gold focus:outline-none ${fieldErrors.new_password ? "border-red-400" : "border-gray-200"}`}
                />
                <FieldError message={fieldErrors.new_password} />
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="mb-1.5 block text-sm font-medium text-navy">Confirm new password</label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.confirm_password)}
                  className={`w-full border-b-2 bg-transparent py-2 text-base text-navy placeholder:text-gray-300 focus:border-gold focus:outline-none ${fieldErrors.confirm_password ? "border-red-400" : "border-gray-200"}`}
                />
                <FieldError message={fieldErrors.confirm_password} />
              </div>

              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-navy py-2.5 text-sm font-bold text-white transition hover:bg-navy-dark disabled:opacity-50"
              >
                {isSubmitting ? "Resetting..." : "Reset password"}
              </button>

              <button
                type="button"
                onClick={() => setStep("request")}
                className="w-full text-center text-sm text-gray-500 hover:text-navy"
              >
                Didn&apos;t get a code? Try again
              </button>
            </form>
          )}

          <p className="mt-8 text-center text-sm text-gray-500">
            <Link to="/login" className="font-semibold text-navy hover:text-gold-ink">
              Back to Log In
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy to-navy-dark lg:flex lg:w-[58%] lg:flex-col lg:justify-end lg:p-14">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-10"
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="-80" y1="800" x2="520" y2="0" stroke="white" strokeWidth="1" />
          <line x1="0" y1="800" x2="600" y2="0" stroke="white" strokeWidth="1" />
          <line x1="80" y1="800" x2="680" y2="0" stroke="white" strokeWidth="1" />
          <line x1="160" y1="800" x2="760" y2="0" stroke="white" strokeWidth="1" />
          <line x1="240" y1="800" x2="840" y2="0" stroke="white" strokeWidth="1" />
          <line x1="320" y1="800" x2="920" y2="0" stroke="white" strokeWidth="1" />
        </svg>

        <p className="relative z-10 text-sm text-white/50">
          © 2026 ChatDesk — USTP Office of Student Affairs.
        </p>
      </div>
    </div>
  );
}
