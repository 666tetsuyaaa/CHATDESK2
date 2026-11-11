import { useEffect, useMemo, useState } from "react";
import { createOffice, deleteOffice, getOffices, updateOffice } from "../api/offices.js";
import OfficeFormModal from "../components/OfficeFormModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import ScrollTable from "../components/ScrollTable.jsx";

export default function OfficeManagement() {
  const [offices, setOffices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [pendingDeleteOffice, setPendingDeleteOffice] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [search, setSearch] = useState("");

  const loadOffices = () => {
    setIsLoading(true);
    getOffices()
      .then((res) => setOffices(res.data.results ?? res.data))
      .catch(() => setError("Could not load offices."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadOffices();
  }, []);

  const visibleOffices = useMemo(() => {
    const filtered = search
      ? offices.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
      : offices;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [offices, search]);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteOffice) return;
    setIsDeleting(true);
    try {
      await deleteOffice(pendingDeleteOffice.office_id);
      setPendingDeleteOffice(null);
      loadOffices();
    } catch (err) {
      // e.g. the office still has Office Admins assigned (backend blocks it).
      setDeleteError(err.response?.data?.message ?? "Could not delete this office.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (editingOffice) {
      await updateOffice(editingOffice.office_id, payload);
    } else {
      await createOffice(payload);
    }
    loadOffices();
  };

  if (isLoading) return <LoadingState label="Loading offices..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          label="Total Offices"
          value={offices.length}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">All Offices</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <button
          type="button"
          onClick={() => {
            setEditingOffice(null);
            setIsModalOpen(true);
          }}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy-dark transition-colors hover:brightness-95"
        >
          + Add Office
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Ticket code</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOffices.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-14 text-center text-sm text-gray-500">
                  No offices yet.
                </td>
              </tr>
            ) : (
              visibleOffices.map((office) => (
                <tr
                  key={office.office_id}
                  className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                >
                  <td className="px-5 py-3.5 font-medium">{office.name}</td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs text-gray-600">{office.code}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingOffice(office);
                          setIsModalOpen(true);
                        }}
                        aria-label="Edit office"
                        title="Edit office"
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
                        onClick={() => setPendingDeleteOffice(office)}
                        aria-label="Delete office"
                        title="Delete office"
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
              ))
            )}
          </tbody>
        </table>
        </ScrollTable>
      </div>

      {isModalOpen && (
        <OfficeFormModal
          initialOffice={editingOffice}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteOffice !== null}
        title={`Delete ${pendingDeleteOffice?.name ?? "this office"}?`}
        message={deleteError ?? "FAQs and tickets routed to it will become unassigned."}
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setPendingDeleteOffice(null);
          setDeleteError(null);
        }}
      />
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
