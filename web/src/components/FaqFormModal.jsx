import { useState } from "react";
import FieldError, { invalidInput } from "./FieldError.jsx";
import { suggestIntentKeyword } from "../utils/faq.js";
import {
  LIMITS,
  firstError,
  hasErrors,
  maxLength,
  noBrokenCharacters,
  requiredText,
  serverErrors,
  validateIntentKeyword,
} from "../utils/validation.js";

export const CATEGORIES = ["Enrollment", "Scholarship", "Clearance", "Discipline", "General"];

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40";

function validateFaq({ intentKeyword, questionText, answerContent }) {
  return {
    intent_keyword: validateIntentKeyword(intentKeyword),
    question_text: firstError(
      requiredText(questionText, "Question"),
      maxLength(questionText, LIMITS.faqQuestion, "Question"),
      noBrokenCharacters(questionText)
    ),
    answer_content: firstError(
      requiredText(answerContent, "Answer"),
      answerContent.trim().length < LIMITS.faqAnswerMin
        ? `Answer is too short to help a student (at least ${LIMITS.faqAnswerMin} characters).`
        : null,
      noBrokenCharacters(answerContent)
    ),
  };
}

// initialFaq: edit that FAQ. prefill: start a new FAQ with these values
// (e.g. from the Unanswered Questions page).
export default function FaqFormModal({ initialFaq, prefill, offices, hideOfficeField, onSave, onClose }) {
  const start = initialFaq ?? prefill;
  const [intentKeyword, setIntentKeyword] = useState(start?.intent_keyword ?? "");
  const [questionText, setQuestionText] = useState(start?.question_text ?? "");
  const [answerContent, setAnswerContent] = useState(start?.answer_content ?? "");
  const [category, setCategory] = useState(start?.category ?? CATEGORIES[0]);
  const [office, setOffice] = useState(start?.office ?? "");
  // A new FAQ's keyword follows the question until staff type their own;
  // an existing FAQ's keyword is never changed for them.
  const [keywordEdited, setKeywordEdited] = useState(Boolean(initialFaq));
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    const found = validateFaq({ intentKeyword, questionText, answerContent });
    setErrors(found);
    if (hasErrors(found)) return;

    setIsSaving(true);
    try {
      await onSave({
        intent_keyword: intentKeyword.trim(),
        question_text: questionText.trim(),
        answer_content: answerContent.trim(),
        category,
        office: office || null,
      });
      onClose();
    } catch (err) {
      const { fields, general } = serverErrors(err, "Could not save this FAQ.");
      setErrors(fields);
      setSaveError(general);
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
          {initialFaq ? "Edit FAQ" : "Add FAQ"}
        </h3>

        <div className="mb-3">
          <label htmlFor="faq-question" className="mb-1 block text-sm text-gray-600">Question</label>
          <input
            id="faq-question"
            value={questionText}
            onChange={(e) => {
              setQuestionText(e.target.value);
              if (!keywordEdited) setIntentKeyword(suggestIntentKeyword(e.target.value));
            }}
            aria-invalid={Boolean(errors.question_text)}
            className={`${FIELD_CLASS} ${invalidInput(errors.question_text)}`}
          />
          <FieldError message={errors.question_text} />
        </div>

        <div className="mb-3">
          <label htmlFor="faq-answer" className="mb-1 block text-sm text-gray-600">Answer</label>
          <textarea
            id="faq-answer"
            value={answerContent}
            onChange={(e) => setAnswerContent(e.target.value)}
            rows={4}
            aria-invalid={Boolean(errors.answer_content)}
            className={`${FIELD_CLASS} ${invalidInput(errors.answer_content)}`}
          />
          <FieldError message={errors.answer_content} />
        </div>

        <label className="mb-1 block text-sm text-gray-600">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {!hideOfficeField && (
          <>
            <label className="mb-1 block text-sm text-gray-600">Office / College</label>
            <select
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/40"
            >
              <option value="">Unassigned</option>
              {(offices ?? []).map((o) => (
                <option key={o.office_id} value={o.office_id}>{o.name}</option>
              ))}
            </select>
          </>
        )}

        <div className="mb-4">
          <label htmlFor="faq-keyword" className="mb-1 block text-sm text-gray-600">
            Intent keyword
          </label>
          <input
            id="faq-keyword"
            value={intentKeyword}
            onChange={(e) => {
              setKeywordEdited(true);
              setIntentKeyword(e.target.value);
            }}
            placeholder="e.g. scholarship_requirements"
            aria-invalid={Boolean(errors.intent_keyword)}
            aria-describedby="faq-keyword-hint"
            className={`${FIELD_CLASS} font-mono text-sm ${invalidInput(errors.intent_keyword)}`}
          />
          <p id="faq-keyword-hint" className="mt-1 text-xs text-gray-500">
            A short unique name the chatbot uses for this FAQ. Filled in from the question - change it only if you need to.
          </p>
          <FieldError message={errors.intent_keyword} />
        </div>

        {saveError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {saveError}
          </p>
        )}

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
