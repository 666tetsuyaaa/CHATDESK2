import { useEffect, useMemo, useState } from "react";
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  updateAnnouncement,
} from "../api/announcements.js";
import AnnouncementFormModal from "../components/AnnouncementFormModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Toast from "../components/Toast.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import ScrollTable from "../components/ScrollTable.jsx";
import { formatManilaDate } from "../utils/dates.js";

export default function AnnouncementManagement() {
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [pendingDeleteAnnouncement, setPendingDeleteAnnouncement] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [search, setSearch] = useState("");

  const loadAnnouncements = () => {
    setIsLoading(true);
    getAnnouncements()
      .then((res) => setAnnouncements(res.data.results ?? res.data))
      .catch(() => setError("Could not load announcements."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const visibleAnnouncements = useMemo(() => {
    if (!search) return announcements;
    return announcements.filter((a) =>
      a.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [announcements, search]);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteAnnouncement) return;
    setIsDeleting(true);
    try {
      await deleteAnnouncement(pendingDeleteAnnouncement.announcement_id);
      setPendingDeleteAnnouncement(null);
      loadAnnouncements();
    } catch (err) {
      setPendingDeleteAnnouncement(null);
      setToastMessage(err.response?.data?.message || "Could not delete this announcement. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (editingAnnouncement) {
      await updateAnnouncement(editingAnnouncement.announcement_id, payload);
    } else {
      await createAnnouncement(payload);
    }
    loadAnnouncements();
  };

  if (isLoading) return <LoadingState label="Loading announcements..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          label="Total Announcements"
          value={announcements.length}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M4 6h11l4-3v18l-4-3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM8 15v3a2 2 0 0 0 2 2h1"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">All Announcements</h3>
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
            setEditingAnnouncement(null);
            setIsModalOpen(true);
          }}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy-dark transition-colors hover:brightness-95"
        >
          + Broadcast Announcement
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Content</th>
              <th className="px-5 py-3">Posted</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleAnnouncements.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-14 text-center text-sm text-gray-500">
                  No announcements yet.
                </td>
              </tr>
            ) : (
              visibleAnnouncements.map((announcement) => (
                <tr
                  key={announcement.announcement_id}
                  className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                >
                  <td className="px-5 py-3.5 font-medium">{announcement.title}</td>
                  <td className="max-w-md px-5 py-3.5 truncate text-gray-500">
                    {announcement.content}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {formatManilaDate(announcement.created_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingAnnouncement(announcement);
                          setIsModalOpen(true);
                        }}
                        aria-label="Edit announcement"
                        title="Edit announcement"
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
                        onClick={() => setPendingDeleteAnnouncement(announcement)}
                        aria-label="Delete announcement"
                        title="Delete announcement"
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
        <AnnouncementFormModal
          initialAnnouncement={editingAnnouncement}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteAnnouncement !== null}
        title={`Delete "${pendingDeleteAnnouncement?.title ?? "this announcement"}"?`}
        message="This action cannot be undone."
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteAnnouncement(null)}
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
