import { useEffect, useState } from "react";
import { createUser, deleteUser, getUsers, updateUser } from "../api/users.js";
import { getOffices } from "../api/offices.js";
import ScrollTable from "../components/ScrollTable.jsx";
import UserFormModal from "../components/UserFormModal.jsx";
import Pagination from "../components/Pagination.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Toast from "../components/Toast.jsx";
import { ErrorState, LoadingState } from "../components/PageState.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatManilaDate } from "../utils/dates.js";

const ROLE_LABELS = { student: "Student", superadmin: "Super Admin", office_admin: "Office Admin" };
const ROLE_BADGE_CLASSES = {
  student: "bg-navy/5 text-navy",
  office_admin: "bg-status-active/15 text-status-active",
  superadmin: "bg-gold/15 text-gold-ink",
};

function initialsFor(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [offices, setOffices] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [activeCount, setActiveCount] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(1);

  const loadUsers = () => {
    setIsLoading(true);
    const filters = {
      search: debouncedSearch || undefined,
      role: roleFilter === "All" ? undefined : roleFilter,
    };
    // Sorted by the server, so A-Z / Z-A runs across every page, not just
    // the 20 rows on screen.
    getUsers({
      ...filters,
      page,
      status: statusFilter === "All" ? undefined : statusFilter,
      sort: sortDirection === "desc" ? "desc" : undefined,
    })
      .then((res) => {
        setUsers(res.data.results ?? res.data);
        setTotalCount(res.data.count ?? (res.data.results ?? res.data).length);
      })
      .catch(() => setError("Could not load users."))
      .finally(() => setIsLoading(false));
    // Active users across all pages (same search and role), not just this page.
    if (statusFilter === "inactive") {
      setActiveCount(0);
    } else {
      getUsers({ ...filters, status: "active", page: 1 })
        .then((res) => setActiveCount(res.data.count ?? (res.data.results ?? res.data).length))
        .catch(() => {});
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter, statusFilter, sortDirection]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, roleFilter, statusFilter, sortDirection]);

  useEffect(() => {
    getOffices()
      .then((res) => setOffices(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const visibleUsers = users;

  const handleConfirmDelete = async () => {
    if (!pendingDeleteUser) return;
    setIsDeleting(true);
    try {
      await deleteUser(pendingDeleteUser.user_id);
      setPendingDeleteUser(null);
      loadUsers();
    } catch (err) {
      setPendingDeleteUser(null);
      setToastMessage(err.response?.data?.message || "Could not delete this user.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (payload) => {
    if (editingUser) {
      await updateUser(editingUser.user_id, payload);
    } else {
      await createUser(payload);
    }
    loadUsers();
  };

  if (isLoading && users.length === 0) return <LoadingState label="Loading users..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <section>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4">
        <StatTile
          label="Total Users"
          value={totalCount}
          accentClass="bg-navy/10 text-navy"
          icon={
            <path
              d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
        />
        <StatTile
          label="Active Users"
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
        <h3 className="mr-auto text-lg font-bold text-navy">All Users</h3>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          <option value="All">All Roles</option>
          <option value="student">Student</option>
          <option value="office_admin">Office Admin</option>
          <option value="superadmin">Super Admin</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-gold/40"
        >
          <option value="All">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="button"
          onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-navy transition-colors hover:border-gold"
        >
          Sort: {sortDirection === "asc" ? "A-Z" : "Z-A"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingUser(null);
            setIsModalOpen(true);
          }}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-navy-dark transition-colors hover:brightness-95"
        >
          + Add User
        </button>
      </div>

      <div className="overflow-clip rounded-2xl border border-gray-200 bg-white shadow-sm">
        <ScrollTable>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">School ID</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Last Login</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              visibleUsers.map((user) => {
                const isSelf = user.user_id === currentUser?.user_id;
                const isAdmin = user.role === "superadmin" || user.role === "office_admin";
                return (
                  <tr
                    key={user.user_id}
                    className="border-b border-gray-50 text-navy transition-colors last:border-0 hover:bg-gray-50/80"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {user.profile_picture ? (
                          <UserAvatar user={user} />
                        ) : (
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              isAdmin ? "bg-gold/15 text-gold-ink" : "bg-navy/10 text-navy"
                            }`}
                          >
                            {initialsFor(user.first_name, user.last_name)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium leading-tight">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs leading-tight text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{user.school_id || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ROLE_BADGE_CLASSES[user.role] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{user.office_name || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          user.is_active
                            ? "bg-status-resolved/15 text-status-resolved"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {user.last_login
                        ? formatManilaDate(user.last_login)
                        : "Never"}
                    </td>
                    <td className="px-5 py-3.5">
                      {!isSelf && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setIsModalOpen(true);
                            }}
                            aria-label="Edit user"
                            title="Edit user"
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
                            onClick={() => setPendingDeleteUser(user)}
                            aria-label="Delete user"
                            title="Delete user"
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
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </ScrollTable>
        <Pagination page={page} count={totalCount} onPageChange={setPage} />
      </div>

      {isModalOpen && (
        <UserFormModal
          initialUser={editingUser}
          offices={offices}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteUser !== null}
        title={`Delete ${pendingDeleteUser?.first_name ?? "this user"}?`}
        message="This action cannot be undone."
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteUser(null)}
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
