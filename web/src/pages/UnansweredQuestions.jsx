import { useEffect, useState } from "react";
import { createFaq } from "../api/faqs.js";
import { getUnansweredQuestions } from "../api/inquiryLogs.js";
import { getOffices } from "../api/offices.js";
import FaqFormModal from "../components/FaqFormModal.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatManila } from "../utils/dates.js";
import { suggestIntentKeyword } from "../utils/faq.js";

const PERIODS = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 12 months" },
];

const FILTER_CLASS =
  "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40";

export default function UnansweredQuestions() {
  const { currentUser } = useAuth();
  const isOfficeAdmin = currentUser?.role === "office_admin";
  const [days, setDays] = useState(90);
  const [officeFilter, setOfficeFilter] = useState("");
  const [offices, setOffices] = useState([]);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draftGroup, setDraftGroup] = useState(null);
  const [notice, setNotice] = useState("");

  const load = () => {
    setIsLoading(true);
    getUnansweredQuestions({ days, office: officeFilter || undefined })
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch(() => setError("Could not load unanswered questions."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, officeFilter]);

  useEffect(() => {
    getOffices()
      .then((res) => setOffices(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const handleSave = async (payload) => {
    await createFaq(payload);
    setNotice(`FAQ "${payload.question_text}" was added. ChatDesk will now answer this question.`);
    load();
  };

  if (isLoading && !data) return <LoadingState label="Loading unanswered questions..." />;
  if (error) return <ErrorState message={error} />;

  const groups = data?.groups ?? [];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-xl text-sm text-gray-500">
          Similar questions are grouped together, most asked first. Add an FAQ for the common ones so ChatDesk can
          answer them next time.
        </p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time period" className={FILTER_CLASS}>
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>{period.label}</option>
          ))}
        </select>
        {!isOfficeAdmin && (
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} aria-label="Office" className={FILTER_CLASS}>
            <option value="">All Offices</option>
            <option value="unassigned">Unassigned</option>
            {offices.map((o) => (
              <option key={o.office_id} value={String(o.office_id)}>{o.name}</option>
            ))}
          </select>
        )}
      </div>

      {notice && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-status-resolved/30 bg-status-resolved/10 px-4 py-3 text-sm text-navy">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="text-xs font-semibold text-gray-500 hover:text-navy">
            Dismiss
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-14 text-center text-sm text-gray-500 shadow-sm">
          No unanswered questions in this period. ChatDesk answered everything it was asked from the FAQs.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500">
            {data.total_questions} {data.total_questions === 1 ? "question" : "questions"} in {groups.length}{" "}
            {groups.length === 1 ? "group" : "groups"}
          </p>
          <ol className="flex flex-col gap-3">
            {groups.map((group) => (
              <li
                key={`${group.question}-${group.last_asked_at}`}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-navy/10 text-navy">
                    <span className="text-base font-bold leading-none tabular-nums">{group.count}</span>
                    <span className="text-[10px] text-gray-500">{group.count === 1 ? "time" : "times"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-navy">{group.question}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Last asked {formatManila(group.last_asked_at)}
                      {group.office_name && <> · {group.office_name}</>}
                      {group.ticket_codes.length > 0 && <> · Tickets {group.ticket_codes.join(", ")}</>}
                    </p>
                    {group.examples.length > 1 && (
                      <ul className="mt-2 flex flex-col gap-1 border-l-2 border-gray-200 pl-3 text-sm text-gray-500">
                        {group.examples
                          .filter((example) => example !== group.question)
                          .map((example) => (
                            <li key={example} className="break-words">&ldquo;{example}&rdquo;</li>
                          ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftGroup(group)}
                    className="self-start whitespace-nowrap rounded-full bg-navy px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-navy-dark"
                  >
                    Create FAQ from this
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {draftGroup && (
        <FaqFormModal
          prefill={{
            intent_keyword: suggestIntentKeyword(draftGroup.question),
            question_text: draftGroup.question.slice(0, 300),
            office: draftGroup.office_id ?? "",
          }}
          offices={offices}
          hideOfficeField={isOfficeAdmin}
          onSave={handleSave}
          onClose={() => setDraftGroup(null)}
        />
      )}
    </section>
  );
}
