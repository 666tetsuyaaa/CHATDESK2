import { useEffect, useMemo, useRef, useState } from "react";
import { createPhase, deletePhase, extractPhasesFromPdf, getPhases, updatePhase } from "../api/phases.js";
import PhaseFormModal from "../components/PhaseFormModal.jsx";
import PhaseExtractReview from "../components/PhaseExtractReview.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Toast from "../components/Toast.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import ScrollTable from "../components/ScrollTable.jsx";

function phaseStatus(phase) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < phase.start_date) return { label: "Upcoming", className: "bg-status-pending/15 text-status-pending" };
  if (today > phase.end_date) return { label: "Past", className: "bg-gray-100 text-gray-500" };
  return { label: "Active now", className: "bg-status-resolved/15 text-status-resolved" };
}

export default function PhaseManagement() {
  const [phases, setPhases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState(null);
  const [pendingDeletePhase, setPendingDeletePhase] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [search, setSearch] = useState("");
  const [extractedCandidates, setExtractedCandidates] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef(null);

  const loadPhases = () => {
    setIsLoading(true);
    getPhases()
      .then((res) => setPhases(res.data.results ?? res.data))
      .catch(() => setError("Could not load phases."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadPhases();
  }, []);

  const activeCount = useMemo(
    () => phases.filter((p) => phaseStatus(p).label === "Active now").length,
    [phases]
  );

  const visiblePhases = useMemo(() => {
    const filtered = search
      ? phases.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      : phases;
    return [...filtered].sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [phases, search]);

  const handleConfirmDelete = async () => {
    if (!pendingDeletePhase) return;
    setIsDeleting(true);
    try {
      await deletePhase(pendingDeletePhase.phase_id);
      setPendingDeletePhase(null);
      loadPhases();
    } catch (err) {
      setPendingDeletePhase(null);
      setToastMessage(err.response?.data?.message || "Could not delete this phase. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (editingPhase) {
      await updatePhase(editingPhase.phase_id, payload);
    } else {
      await createPhase(payload);
    }
    loadPhases();
  };

  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setExtractError("");
    setIsExtracting(true);
    try {
      const { data } = await extractPhasesFromPdf(file);
      setExtractedCandidates(data.phases);
    } catch (err) {
      setExtractError(err.response?.data?.message || "Could not extract phases from this PDF.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractReviewDone = () => {
    setExtractedCandidates(null);
    loadPhases();
  };

  if (isLoading) return <LoadingState label="Loading phases..." />;
  if (error) return <ErrorState message={error} />;

  if (extractedCandidates) {
    return <PhaseExtractReview candidates={extractedCandidates} onDone={handleExtractReviewDone} />;
  }

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          label="Total Phases"
          value={phases.length}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Active Now"
          value={activeCount}
          accentClass="bg-status-resolved/15 text-status-resolved"
          icon={
            <path
              d="m20 6-11 11-5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">All Phases</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isExtracting}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy transition-colors hover:border-gold disabled:opacity-50"
        >
          {isExtracting ? "Reading PDF..." : "Extract from PDF"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingPhase(null);
            setIsModalOpen(true);
          }}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy-dark transition-colors hover:brightness-95"
        >
          + Add Phase
        </button>
      </div>

      {extractError && <p className="mb-4 text-sm text-red-600">{extractError}</p>}

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Date Range</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePhases.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-14 text-center text-sm text-gray-500">
                  No phases yet.
                </td>
              </tr>
            ) : (
              visiblePhases.map((phase) => {
                const status = phaseStatus(phase);
                return (
                  <tr
                    key={phase.phase_id}
                    className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                  >
                    <td className="px-5 py-3.5 font-medium">{phase.name}</td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {phase.start_date} — {phase.end_date}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingPhase(phase);
                            setIsModalOpen(true);
                          }}
                          aria-label="Edit phase"
                          title="Edit phase"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 hover:bg-status-active/10 hover:text-status-active"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinejoin="round"
                            />
                            <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.8" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setPendingDeletePhase(phase)}
                          aria-label="Delete phase"
                          title="Delete phase"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 hover:bg-red-50 hover:text-red-600"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2m-7 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </ScrollTable>
      </div>

      {isModalOpen && (
        <PhaseFormModal
          initialPhase={editingPhase}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeletePhase !== null}
        title={`Delete ${pendingDeletePhase?.name ?? "this phase"}?`}
        message="This action cannot be undone."
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeletePhase(null)}
      />
      <Toast message={toastMessage} onDismiss={() => setToastMessage("")} />
    </section>
  );
}

function StatTile({ label, value, icon, accentClass }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {icon}
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-snug text-gray-500 sm:text-sm">{label}</p>
        <p className="text-xl font-bold tabular-nums text-navy sm:text-2xl">{value}</p>
      </div>
    </div>
  );
}
