import { useEffect, useState } from "react";
import { createFaq, deleteFaq, getFaqs, updateFaq } from "../api/faqs.js";
import { getOffices } from "../api/offices.js";
import FaqFormModal, { CATEGORIES } from "../components/FaqFormModal.jsx";
import Pagination from "../components/Pagination.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import ScrollTable from "../components/ScrollTable.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function FaqManagement() {
  const { currentUser } = useAuth();
  const isOfficeAdmin = currentUser?.role === "office_admin";
  const [faqs, setFaqs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categoriesInUse, setCategoriesInUse] = useState(0);
  const [offices, setOffices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [pendingDeleteFaq, setPendingDeleteFaq] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [officeFilter, setOfficeFilter] = useState("All");
  const [page, setPage] = useState(1);

  const loadFaqs = () => {
    setIsLoading(true);
    getFaqs({
      page,
      search: debouncedSearch || undefined,
      category: categoryFilter === "All" ? undefined : categoryFilter,
      office: officeFilter === "All" || officeFilter === "Unassigned" ? undefined : officeFilter,
    })
      .then((res) => {
        setFaqs(res.data.results ?? res.data);
        setTotalCount(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError("Could not load FAQs."))
      .finally(() => setIsLoading(false));
  };

  const loadCategoriesInUse = () => {
    Promise.all(CATEGORIES.map((category) => getFaqs({ page: 1, category })))
      .then((results) => {
        const inUse = results.filter((res) => (res.data.count ?? (res.data.results ?? res.data).length) > 0);
        setCategoriesInUse(inUse.length);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, officeFilter]);

  useEffect(() => {
    loadFaqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, categoryFilter, officeFilter]);

  useEffect(() => {
    loadCategoriesInUse();
    getOffices()
      .then((res) => setOffices(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteFaq) return;
    setIsDeleting(true);
    try {
      await deleteFaq(pendingDeleteFaq.faq_id);
      setPendingDeleteFaq(null);
      loadFaqs();
      loadCategoriesInUse();
    } finally {
      setIsDeleting(false);
    }
  };
  const handleSave = async (payload) => {
    if (editingFaq) {
      await updateFaq(editingFaq.faq_id, payload);
    } else {
      await createFaq(payload);
    }
    loadFaqs();
    loadCategoriesInUse();
  };

  if (isLoading && faqs.length === 0) return <LoadingState label="Loading FAQs..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label="Total FAQs"
          value={totalCount}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M9 9a3 3 0 1 1 4 2.83c-.6.25-1 .85-1 1.5V14M12 17.5h.01M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 3V6a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Categories in Use"
          value={categoriesInUse}
          accentClass="bg-gold/15 text-gold"
          icon={
            <path
              d="M4 6h16M4 12h16M4 18h7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h3 className="mr-auto text-lg font-bold text-navy">All FAQs</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          <option value="All">All Types</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        {!isOfficeAdmin && (
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
          >
            <option value="All">All Offices</option>
            <option value="Unassigned">Unassigned</option>
            {offices.map((o) => (
              <option key={o.office_id} value={String(o.office_id)}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            setEditingFaq(null);
            setIsModalOpen(true);
          }}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:brightness-95"
        >
          + Add FAQ
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Question</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {faqs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-14 text-center text-sm text-gray-500">
                  No FAQs yet.
                </td>
              </tr>
            ) : (
              faqs.map((faq) => (
                <tr
                  key={faq.faq_id}
                  className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                >
                  <td className="px-5 py-3.5">{faq.question_text}</td>
                  <td className="px-5 py-3.5">
                    <span className="whitespace-nowrap rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-medium text-navy">
                      {faq.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {faq.office_name ? (
                      <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {faq.office_name}
                      </span>
                    ) : (
                      <span className="italic text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          setEditingFaq(faq);
                          setIsModalOpen(true);
                        }}
                        aria-label="Edit FAQ"
                        className="text-gray-400 transition-colors hover:text-status-active"
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
                        onClick={() => setPendingDeleteFaq(faq)}
                        aria-label="Delete FAQ"
                        className="text-gray-400 transition-colors hover:text-red-500"
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
        <Pagination page={page} count={totalCount} onPageChange={setPage} />
      </div>

      {isModalOpen && (
        <FaqFormModal
          initialFaq={editingFaq}
          offices={offices}
          hideOfficeField={isOfficeAdmin}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteFaq !== null}
        title="Delete this FAQ?"
        message="This action cannot be undone."
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteFaq(null)}
      />
    </section>
  );
}

function StatTile({ label, value, icon, accentClass }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {icon}
        </svg>
      </div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-navy">{value}</p>
    </div>
  );
}
