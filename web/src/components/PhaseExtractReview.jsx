import { useState } from "react";
import { createPhase } from "../api/phases.js";
import PhaseFormModal from "./PhaseFormModal.jsx";
import ScrollTable from "./ScrollTable.jsx";

// Review screen for phases extracted from an uploaded calendar PDF -
// nothing here is saved until "Save selected" is clicked, and each row is
// created individually through the real POST /api/v1/phases/ endpoint, so
// every save still goes through its overlap validation. Two programs'
// calendars (Undergraduate/Graduate) often run near-identical, overlapping
// periods in parallel, so some rows are expected to conflict with each
// other - that's surfaced per-row rather than silently dropped.
export default function PhaseExtractReview({ candidates, onDone }) {
  const [rows, setRows] = useState(
    candidates.map((candidate, index) => ({
      ...candidate,
      _id: index,
      _selected: true,
      _status: "pending", // pending | saved | error
      _error: null,
    }))
  );
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedCount = rows.filter((r) => r._selected && r._status !== "saved").length;
  const savedCount = rows.filter((r) => r._status === "saved").length;

  const toggleSelected = (id) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, _selected: !r._selected } : r)));
  };

  const updateRow = (id, payload) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, ...payload, _status: "pending", _error: null } : r))
    );
  };

  const handleSaveSelected = async () => {
    setIsSaving(true);
    for (const row of rows) {
      if (!row._selected || row._status === "saved") continue;
      try {
        await createPhase({
          name: row.name,
          start_date: row.start_date,
          end_date: row.end_date,
          guidance_message: row.guidance_message,
        });
        setRows((prev) =>
          prev.map((r) => (r._id === row._id ? { ...r, _status: "saved", _error: null } : r))
        );
      } catch (error) {
        const details = error.response?.data?.details;
        const firstDetail = details ? Object.values(details)[0]?.[0] : null;
        const message = firstDetail || error.response?.data?.message || "Could not save.";
        setRows((prev) =>
          prev.map((r) => (r._id === row._id ? { ...r, _status: "error", _error: message } : r))
        );
      }
    }
    setIsSaving(false);
  };

  const editingRow = rows.find((r) => r._id === editingId);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h3 className="text-lg font-bold text-navy">Review extracted phases</h3>
          <p className="text-sm text-gray-500">
            {rows.length} found from the PDF · {savedCount} saved · {selectedCount} selected.
            Two programs' calendars often overlap in dates - conflicts are shown per row.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy transition-colors hover:border-gold"
        >
          {savedCount > 0 ? "Done" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={handleSaveSelected}
          disabled={isSaving || selectedCount === 0}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy-dark transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : `Save selected (${selectedCount})`}
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable stickyFirstColumn={false}>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="w-10 px-5 py-3"></th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Date Range</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row._id}
                className={`border-b border-gray-50 text-navy transition-colors last:border-0 ${
                  row._status === "saved" ? "bg-status-resolved/5" : "hover:bg-gray-50/80"
                }`}
              >
                <td className="px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={row._selected}
                    onChange={() => toggleSelected(row._id)}
                    disabled={row._status === "saved"}
                  />
                </td>
                <td className="px-5 py-3.5 font-medium">{row.name}</td>
                <td className="px-5 py-3.5 text-gray-500">
                  {row.start_date} — {row.end_date}
                </td>
                <td className="px-5 py-3.5">
                  {row._status === "saved" && (
                    <span className="whitespace-nowrap rounded-full bg-status-resolved/15 px-2.5 py-0.5 text-xs font-medium text-status-resolved">
                      Saved
                    </span>
                  )}
                  {row._status === "error" && (
                    <span className="text-xs text-red-600" title={row._error}>
                      {row._error}
                    </span>
                  )}
                  {row._status === "pending" && (
                    <span className="text-xs text-gray-500">Not saved yet</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => setEditingId(row._id)}
                    disabled={row._status === "saved"}
                    className="text-sm text-navy underline decoration-gray-300 underline-offset-2 hover:decoration-gold disabled:text-gray-300 disabled:no-underline"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollTable>
      </div>

      {editingRow && (
        <PhaseFormModal
          initialPhase={editingRow}
          onSave={async (payload) => updateRow(editingRow._id, payload)}
          onClose={() => setEditingId(null)}
        />
      )}
    </section>
  );
}
