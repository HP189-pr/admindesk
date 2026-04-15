// src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo } from "react";
import Sidebar from "../Menu/Sidebar.jsx";
import WorkArea from "./WorkArea.jsx";
import ChatBox from "../components/ChatBox.jsx";
import Clock from "../components/Clock.jsx";
import { useAuth } from "../hooks/AuthContext";
import { isoToDMY } from "../utils/date";

const INSTITUTION_NAME = "Kadi Sarva Vishwavidyalaya";
const LOGO_PATH = "/logo.png";
const LOGO_URL = LOGO_PATH;

const normalizeApiList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    return [];
};

const MONTH_FILTER_OPTIONS = [
    { value: "current_month", label: "Current Month" },
    { value: "next_month", label: "Next Month" },
    { value: "all", label: "All" },
];

const parseDashboardDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // Accept ISO-style strings like yyyy-mm-dd and yyyy/mm/dd first.
    let m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return new Date(year, month - 1, day);
        }
        return null;
    }

    // API date output is configured as dd-mm-yyyy / dd/mm/yyyy.
    m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return new Date(year, month - 1, day);
        }
        return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMonthFromDate = (value) => {
    const d = parseDashboardDate(value);
    if (!d) return null;
    return d.getMonth();
};

const matchesMonthScope = (value, scope) => {
    if (scope === "all") return true;
    const month = getMonthFromDate(value);
    if (month == null) return false;
    const now = new Date();
    const currentMonth = now.getMonth();
    if (scope === "current_month") return month === currentMonth;
    if (scope === "next_month") return month === (currentMonth + 1) % 12;
    return true;
};

const rowStatus = (row) => String(row?.status || row?.verification_status || row?.mail_status || "").trim().toLowerCase();
const filterMatchesStatus = (row, filter) => {
    if (!filter || filter === "All" || filter === "all") return true;
    const normalizedFilter = String(filter).trim().toLowerCase();
    const normalizedStatus = rowStatus(row);
    if (!normalizedStatus) return true;
    return normalizedStatus === normalizedFilter;
};

const MODULES = [
    {
        key: "verification",
        label: "📜 Verification",
        openMenuLabel: "Verification",
        endpoint: "/api/verification",
        statuses: ["All", "IN_PROGRESS", "PENDING", "CORRECTION", "CANCEL", "DONE", "DONE_WITH_REMARKS"],
        defaultStatus: "IN_PROGRESS",
        fields: (row) => {
            const docDate = isoToDMY(row.doc_rec_date || row.date) || "-";
            const recId = row.doc_rec_key || row.doc_rec_id || (row.doc_rec && row.doc_rec.doc_rec_id) || "-";
            const enrollNo = row.enrollment_no || (row.enrollment && row.enrollment.enrollment_no) || "-";
            const name = row.student_name || "-";
            return `${docDate} | ${recId} | ${enrollNo} | ${name}`;
        },
    },
    {
        key: "migration",
        label: "🚀 Migration",
        openMenuLabel: "Migration",
        endpoint: "/api/migration",
        requiresAdmin: true,
        statuses: ["pending", "done", "cancel", "correction"],
        defaultStatus: "pending",
        fields: (row) => `${row.student_name || "-"} - ${row.migration_number || row.migration_no || row.mg_number || "—"} - ${row.status || ""}`,
    },
    {
        key: "provisional",
        label: "📄 Provisional",
        openMenuLabel: "Provisional",
        endpoint: "/api/provisional",
        requiresAdmin: true,
        statuses: ["pending", "done", "cancel", "correction"],
        defaultStatus: "pending",
        fields: (row) => `${row.student_name || "-"} - ${row.provisional_number || row.prv_number || "—"} - ${row.status || ""}`,
    },
    {
        key: "institutional",
        label: "🏛️ Institutional Verification",
        openMenuLabel: "Inst-Verification",
        endpoint: "/api/inst-verification-main",
        requiresAdmin: true,
        statuses: ["pending", "done", "cancel", "correction", "fake"],
        defaultStatus: "pending",
        fields: (row) => `${row.rec_inst_name || row.student_name || "-"} - ${row.inst_veri_number || row.doc_rec_id || "—"} - ${row.verification_status || row.status || ""}`,
    },
    {
        key: "mailrequests",
        label: "📧 Mail Requests",
        openMenuLabel: "Official Mail Status",
        endpoint: "/api/mail-requests",
        requiresAdmin: true,
        statuses: ["pending", "progress", "done"],
        statusParam: "mail_status",
        defaultStatus: "pending",
        fields: (row) => `${row.mail_req_no || row.id || "-"} • ${row.mail_status || ""} • ${row.enrollment_no || "—"} • ${row.student_name || "-"}`,
    },
    {
        key: "transcript_pdf",
        label: "📄 Transcript Requests",
        openMenuLabel: "Transcript Requests",
        endpoint: "/api/transcript-requests",
        requiresAdmin: true,
        statuses: ["pending", "progress", "done"],
        statusParam: "mail_status",
        defaultStatus: "pending",
        fields: (row) => `${row.tr_request_no || row.request_ref_no || "-"} • ${row.enrollment_no || "—"} • ${row.student_name || "-"} • ${row.pdf_generate || ""} • ${row.mail_status || ""}`,
    },
    {
        key: "birthdays",
        label: "🎂 Birthdays",
        openMenuLabel: "Dashboard",
        endpoint: "/api/empprofile",
        statuses: MONTH_FILTER_OPTIONS.map((f) => f.value),
        statusLabels: Object.fromEntries(MONTH_FILTER_OPTIONS.map((f) => [f.value, f.label])),
        defaultStatus: "current_month",
        fields: (row) => `${row.emp_name || row.username || "-"} • ${row.emp_designation || "-"} • ${isoToDMY(row.usr_birth_date) || "-"}`,
        clientFilter: (row, selected) => matchesMonthScope(row.usr_birth_date, selected),
        badge: (row) => isoToDMY(row.usr_birth_date) || "",
    },
    {
        key: "holidays",
        label: "🏖️ Holidays",
        openMenuLabel: "Dashboard",
        endpoint: "/api/holidays",
        statuses: MONTH_FILTER_OPTIONS.map((f) => f.value),
        statusLabels: Object.fromEntries(MONTH_FILTER_OPTIONS.map((f) => [f.value, f.label])),
        defaultStatus: "current_month",
        fields: (row) => `${row.holiday_name || "-"} • ${row.holiday_day || "-"} • ${isoToDMY(row.holiday_date) || "-"}`,
        clientFilter: (row, selected) => matchesMonthScope(row.holiday_date, selected),
        badge: (row) => isoToDMY(row.holiday_date) || "",
    },
    {
        key: "student_search",
        label: "🔍 Student Search",
        openMenuLabel: "Student Search",
        endpoint: null,
        statuses: [],
        fields: null,
        isSearch: true,
    },
];

const normalizeNavText = (value) => String(value || "").trim().toLowerCase();

const hasVisibleNavigationMenu = (modules, predicate) =>
    modules.some((module) =>
        (module?.menus || []).some(
            (menu) => Boolean(menu?.rights?.can_view) && predicate(normalizeNavText(menu?.name), normalizeNavText(module?.name))
        )
    );

const canAccessDashboardModule = (moduleKey, navigationModules) => {
    switch (moduleKey) {
        case "verification":
            return hasVisibleNavigationMenu(
                navigationModules,
                (menuName) => menuName.includes("verification") && !menuName.includes("inst") && !menuName.includes("institution")
            );
        case "migration":
            return hasVisibleNavigationMenu(navigationModules, (menuName) => menuName.includes("migration"));
        case "provisional":
            return hasVisibleNavigationMenu(navigationModules, (menuName) => menuName.includes("provisional"));
        case "institutional":
            return hasVisibleNavigationMenu(
                navigationModules,
                (menuName) => menuName.includes("inst") || menuName.includes("institution")
            );
        case "mailrequests":
            return hasVisibleNavigationMenu(
                navigationModules,
                (menuName) => menuName.includes("mail") && (menuName.includes("status") || menuName.includes("request"))
            );
        case "transcript_pdf":
            return hasVisibleNavigationMenu(navigationModules, (menuName) => menuName.includes("transcript"));
        case "student_search":
            return hasVisibleNavigationMenu(
                navigationModules,
                (_menuName, moduleName) => moduleName === "student module"
            );
        case "birthdays":
        case "holidays":
            return true;
        default:
            return true;
    }
};

const ModuleCard = ({ mod, authFetch, onOpen }) => {
    const initialFilter = mod.defaultStatus || mod.statuses?.[0] || "";
    const [statusFilter, setStatusFilter] = useState(initialFilter);
    const [mailFilter, setMailFilter] = useState("");
    const [ecaStatusFilter, setEcaStatusFilter] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setStatusFilter(mod.defaultStatus || mod.statuses?.[0] || "");
        setMailFilter("");
        setEcaStatusFilter("");
    }, [mod.key]);

    if (mod.isSearch) {
        return (
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl shadow-sm border border-indigo-200 p-6 flex flex-col items-center justify-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-indigo-900 mb-2">Student Search</h3>
                <p className="text-gray-600 text-center mb-4 text-sm">Search comprehensive student information by enrollment number</p>
                <button
                    onClick={onOpen}
                    className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg transition-all"
                >
                    Open Search
                </button>
            </div>
        );
    }

    const load = async () => {
        setLoading(true);
        setError("");
        if (!mod.endpoint) {
            setItems([]);
            setError(mod.disabledReason || "Endpoint not available");
            setLoading(false);
            return;
        }
        try {
            const params = new URLSearchParams();
            if (statusFilter && statusFilter !== "All" && statusFilter !== "all" && mod.statusParam) {
                params.set(mod.statusParam, statusFilter);
            } else if (statusFilter && statusFilter !== "All" && statusFilter !== "all" && !mod.clientFilter) {
                params.set("status", statusFilter);
            }
            if (mod.key === "verification") {
                if (mailFilter) params.set("mail_status", mailFilter);
                if (ecaStatusFilter) params.set("eca_status", ecaStatusFilter);
            }
            params.set("limit", mod.key === "verification" ? "25" : "50");
            const url = `${mod.endpoint}?${params.toString()}`;
            const res = await authFetch(url);
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                const msg = `Load failed (${res.status}) ${text}`;
                console.error("Module load error:", msg, { url, mod });
                throw new Error(msg);
            }
            const data = await res.json();
            setItems(normalizeApiList(data));
        } catch (e) {
            console.error("Module load exception:", e, { mod });
            setError(typeof e === "string" ? e : e.message || "Could not load");
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [statusFilter, mailFilter, ecaStatusFilter]);

    const filteredItems = (mod.key === "verification"
        ? items.filter((row) => {
                const statusOk = filterMatchesStatus(row, statusFilter);
                const mailOk = !mailFilter || row.mail_status === mailFilter;
                const ecaOk = !ecaStatusFilter || row.eca_status === ecaStatusFilter;
                return statusOk && mailOk && ecaOk;
            })
        : mod.clientFilter
            ? items.filter((row) => mod.clientFilter(row, statusFilter))
            : items.filter((row) => filterMatchesStatus(row, statusFilter))
    ).slice(0, mod.key === "verification" ? 25 : 5);

    const optionLabel = (value) => mod.statusLabels?.[value] || value;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">{mod.label}</h3>
                <div className="flex items-center gap-2">
                    {mod.key === "verification" && (
                        <>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                                {mod.statuses.map((s) => (
                                    <option key={s} value={s}>
                                        {optionLabel(s)}
                                    </option>
                                ))}
                            </select>
                            <select value={mailFilter} onChange={(e) => setMailFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                                <option value="">All Mail</option>
                                <option value="NOT_SENT">NOT_SENT</option>
                                <option value="SENT">SENT</option>
                                <option value="FAILED">FAILED</option>
                            </select>
                            <select value={ecaStatusFilter} onChange={(e) => setEcaStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                                <option value="">All ECA</option>
                                <option value="SENT">SENT</option>
                                <option value="NOT_SENT">NOT_SENT</option>
                            </select>
                        </>
                    )}
                    {mod.key !== "verification" && (
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                            {mod.statuses.map((s) => (
                                <option key={s} value={s}>
                                    {optionLabel(s)}
                                </option>
                            ))}
                        </select>
                    )}
                    <button onClick={onOpen} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm">
                        Open
                    </button>
                </div>
            </div>
            <div className="text-sm text-gray-600 mb-2">Recent ({statusFilter})</div>
            {loading ? (
                <div className="text-gray-500 text-sm">Loading…</div>
            ) : error ? (
                <div className="text-red-500 text-sm">{error}</div>
            ) : (
                <ul className="space-y-2">
                    {filteredItems.map((row) => (
                        <li key={row.id || row.pk || JSON.stringify(row)} className="flex items-center justify-between border rounded px-2 py-1 text-xs">
                            <span className="truncate mr-2">{mod.fields(row)}</span>
                            {Boolean(mod.badge ? mod.badge(row) : row.status || row.verification_status || row.mail_status) && (
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border capitalize">
                                    {(mod.badge ? mod.badge(row) : row.status || row.verification_status || row.mail_status || "").toString()}
                                </span>
                            )}
                        </li>
                    ))}
                    {!filteredItems.length && <li className="text-gray-500 text-xs">No items</li>}
                </ul>
            )}
        </div>
    );
};

const ModuleSelector = ({ selected, setSelected, modules }) => {
    const toggle = (key) => {
        setSelected((prev) => {
            const exists = prev.includes(key);
            if (exists) return prev.filter((k) => k !== key);
            if (prev.length >= 4) return prev;
            return [...prev, key];
        });
    };
    return (
        <div className="flex flex-wrap gap-2">
            {modules.map((m) => {
                const isOn = selected.includes(m.key);
                return (
                    <button
                        key={m.key}
                        onClick={() => toggle(m.key)}
                        className={`px-3 py-1 rounded-full border ${isOn ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"} text-sm`}
                    >
                        {m.label}
                    </button>
                );
            })}
        </div>
    );
};

export const CustomDashboard = ({ selectedMenuItem, setSelectedMenuItem, isSidebarOpen, setSidebarOpen }) => {
    const { user, isAdmin } = useAuth();

    if (!setSelectedMenuItem) {
        console.error("CustomDashboard: setSelectedMenuItem prop is missing!");
    }

    const STORAGE_KEY = "selected_dashboard_modules";
    const DEFAULT_SELECTED = ["verification", "migration", "provisional", "student_search"];
    const [navigationModules, setNavigationModules] = useState([]);

    const availableModules = useMemo(
        () => MODULES.filter((m) => !m.requiresAdmin || isAdmin).filter((m) => isAdmin || canAccessDashboardModule(m.key, navigationModules)),
        [isAdmin, navigationModules]
    );

    const authFetch = async (url, opts = {}) => {
        const token = localStorage.getItem("access_token");
        const headers = Object.assign({}, opts.headers || {}, {
            Authorization: token ? `Bearer ${token}` : "",
        });
        return fetch(url, Object.assign({}, opts, { headers }));
    };

    const [selectedModuleKeys, setSelectedModuleKeys] = useState(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const merged = Array.from(new Set([...parsed, ...DEFAULT_SELECTED]));
                    return merged.slice(0, 4);
                }
            }
        } catch (e) {}
        return DEFAULT_SELECTED.slice(0, 4);
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedModuleKeys));
        } catch (e) {}
    }, [selectedModuleKeys]);

    useEffect(() => {
        let cancelled = false;
        const loadNavigation = async () => {
            if (isAdmin) {
                setNavigationModules([]);
                return;
            }

            try {
                const res = await authFetch("/api/my-navigation/");
                if (!res || !res.ok) return;
                const data = await res.json().catch(() => null);
                if (cancelled) return;
                setNavigationModules(Array.isArray(data?.modules) ? data.modules : []);
            } catch (e) {
                if (!cancelled) {
                    setNavigationModules([]);
                }
            }
        };

        loadNavigation();
        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    useEffect(() => {
        let cancelled = false;
        const loadPrefs = async () => {
            try {
                const res = await authFetch("/api/dashboard-preferences/");
                if (!res || !res.ok) return;
                const data = await res.json().catch(() => null);
                if (!data || !Array.isArray(data.selected_modules)) return;
                if (cancelled) return;
                const merged = Array.from(new Set([...data.selected_modules, ...DEFAULT_SELECTED]));
                setSelectedModuleKeys(merged.slice(0, 4));
            } catch (e) {}
        };
        loadPrefs();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const allowed = new Set(availableModules.map((m) => m.key));
        setSelectedModuleKeys((prev) => {
            const filtered = prev.filter((k) => allowed.has(k));
            const fallback = DEFAULT_SELECTED.filter((k) => allowed.has(k));
            const firstAvailable = availableModules.map((m) => m.key).slice(0, 4);
            const next = (filtered.length ? filtered : fallback.length ? fallback : firstAvailable).slice(0, 4);
            return next;
        });
    }, [availableModules]);

    useEffect(() => {
        const savePrefs = async () => {
            try {
                await authFetch("/api/dashboard-preferences/", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ selected_modules: selectedModuleKeys }),
                });
            } catch (e) {}
        };
        if (selectedModuleKeys && selectedModuleKeys.length) {
            savePrefs();
        }
    }, [selectedModuleKeys]);

    const handleOpenModule = (openMenuLabel) => {
        setSelectedMenuItem(openMenuLabel);
    };

    const selectedCount = selectedModuleKeys.length;
    let gridClass = "grid grid-cols-1";
    if (selectedCount === 1) gridClass = "grid grid-cols-1";
    else if (selectedCount === 2) gridClass = "grid grid-cols-1 sm:grid-cols-2";
    else if (selectedCount === 3) gridClass = "grid grid-cols-1 md:grid-cols-3";
    else if (selectedCount >= 4) gridClass = "grid grid-cols-1 sm:grid-cols-2";

    return (
        <div className="flex flex-col bg-white" style={{ paddingRight: "var(--chat-rail-width, 0px)" }}>
            <div className="h-[10px] bg-white" />
            <div className="p-4 overflow-auto">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white mb-6">
                    <div className="px-6 py-6 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
                                <img src={LOGO_URL} alt="logo" className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-wide">{INSTITUTION_NAME}</h1>
                                <p className="text-white/80 text-sm">Welcome back{user?.first_name ? `, ${user.first_name}` : ""}</p>
                            </div>
                        </div>
                        <div className="text-right text-white">
                            <Clock showDate compact className="items-end" />
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-lg font-semibold text-gray-800">Quick Status</h2>
                        <div className="text-sm text-gray-500">Select up to 4 modules</div>
                    </div>
                    <ModuleSelector selected={selectedModuleKeys} setSelected={setSelectedModuleKeys} modules={availableModules} />
                </div>

                <div className={`${gridClass} gap-4 pb-2`}>
                    {availableModules.filter((m) => selectedModuleKeys.includes(m.key)).map((mod) => (
                        <ModuleCard key={mod.key} mod={mod} authFetch={authFetch} onOpen={() => handleOpenModule(mod.openMenuLabel)} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const Dashboard = () => {
  const { verifyPassword } = useAuth();
        const [isSidebarOpen, setSidebarOpen] = useState(true);
        const [isChatboxOpen, setChatboxOpen] = useState(false);
        // Default to Dashboard so that, after login, the Quick Status dashboard is shown first
        const [selectedMenuItem, setSelectedMenuItem] = useState('Dashboard');
    const [selectedSubmenu, setSelectedSubmenu] = useState(null);
    const [chatNotificationCount, setChatNotificationCount] = useState(0);

    const handleSecureNavigation = async (menuItem) => {
      const password = prompt("Please confirm your password to access this section:");
  
      if (password) {
        const isVerified = await verifyPassword(password);

          if (isVerified) {
              setSelectedMenuItem(menuItem);
          } else {
              alert("Password verification failed.");
          }
      } else {
          // Password prompt cancelled
      }
  };

    return (
        <div className={`flex h-screen w-screen transition-all duration-300 ${isSidebarOpen ? "pl-0" : "pl-1"}`}>
            {/* Sidebar (left) */}
            <Sidebar
                isOpen={isSidebarOpen}
                setSidebarOpen={setSidebarOpen}
                setSelectedMenuItem={setSelectedMenuItem}
                handleSecureNavigation={handleSecureNavigation} 
            />

            {/* Main content area (center) */}
            <div className="flex-grow flex flex-col bg-white ml-[1rem]">
                <div className="h-[1rem] bg-white"></div>
                <div className="flex-grow p-4 overflow-auto bg-gray-100">
                                <WorkArea
                                    selectedMenuItem={selectedMenuItem}
                                    setSelectedMenuItem={setSelectedMenuItem}
                                    selectedSubmenu={selectedSubmenu}
                                    isSidebarOpen={isSidebarOpen}
                                    setSidebarOpen={setSidebarOpen}
                                    DashboardComponent={CustomDashboard}
                                />

                </div>
            </div>

            {/* Chatbox (right side) */}
            <ChatBox />
        </div>
    );
};

export default Dashboard;
