import useEnrollmentLookup from '../hooks/useEnrollmentLookup';
import React, { useCallback, useEffect, useRef, useState } from "react";
import PageTopbar from "../components/PageTopbar";
import { isoToDMY, dmyToISO } from "../utils/date";
import InstVerReport from "../report/InstVerReport";
import {
	deleteInstLetterStudent,
	fetchInstLetterMainDetail,
	fetchInstLetterMains,
	fetchInstLetterStudents,
	saveInstLetterMain,
	saveInstLetterStudent,
	suggestInstLetterDocRec,
} from "../services/inst-letterservice";

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];
const IV_STATUS_OPTIONS = ["", "Pending", "Done", "Correction", "Post", "Mail"];
const SEARCH_FIELDS = [
	{ value: "all", label: "All Fields" },
	{ value: "enrollment", label: "Enrollment No" },
	{ value: "iv_record_no", label: "IV Record No" },
	{ value: "inst_veri_number", label: "Inst Veri Number" },
	{ value: "doc_rec", label: "Doc Rec ID" },
	{ value: "student_name", label: "Student Name" },
	{ value: "rec_inst_name", label: "Recipient Institute" },
];

const DEFAULT_RIGHTS = { can_view: true, can_create: true, can_edit: true, can_delete: true };

const apiBase = "/api";

const createMainForm = () => ({
	id: null,
	doc_rec: "",
	doc_rec_date: "",
	inst_veri_number: "",
	inst_veri_date: "",
	iv_record_no: "",
	rec_inst_sfx_name: "",
	rec_inst_name: "",
	rec_inst_address_1: "",
	rec_inst_address_2: "",
	rec_inst_location: "",
	rec_inst_city: "",
	rec_inst_pin: "",
	rec_inst_email: "",
	doc_types: "",
	iv_status: "",
	rec_by: "",
	inst_ref_no: "",
	ref_date: "",
	study_mode: "",
	doc_remark: "",
});

const createStudentForm = () => ({
	id: null,
	sr_no: "",
	enrollment: "",
	student_name: "",
	type_of_credential: "",
	month_year: "",
	verification_status: "",
	iv_degree_name: "",
});

const computeIvRecordNumber = (value) => {
	if (!value) return "";
	const str = String(value).trim();
	const match = str.match(/(\d{2,4})\D*0*([0-9]+)$/);
	if (!match) {
		const digits = str.replace(/\D/g, "");
		if (digits.length >= 3) {
			const yearPart = digits.slice(0, -3);
			const seq = digits.slice(-3);
			if (yearPart.length >= 2) {
				return `${yearPart.slice(-2)}${seq}`;
			}
			return digits;
		}
		return "";
	}
	const year = match[1];
	const seqMatch = str.match(/(\d+)\s*$/);
	const seq = seqMatch ? seqMatch[1] : match[2];
	return `${year.slice(-2)}${seq}`;
};

const formatMainRecord = (record) => {
	if (!record) return createMainForm();
	const docRecId = typeof record.doc_rec === "string" ? record.doc_rec : record.doc_rec?.doc_rec_id || "";
	return {
		id: record.id ?? null,
		doc_rec: docRecId || "",
		doc_rec_date: record.doc_rec_date ? isoToDMY(record.doc_rec_date) : "",
		inst_veri_number: record.inst_veri_number || "",
		inst_veri_date: record.inst_veri_date ? isoToDMY(record.inst_veri_date) : "",
		iv_record_no: record.iv_record_no ? String(record.iv_record_no) : "",
		rec_inst_sfx_name: record.rec_inst_sfx_name || "",
		rec_inst_name: record.rec_inst_name || "",
		rec_inst_address_1: record.rec_inst_address_1 || "",
		rec_inst_address_2: record.rec_inst_address_2 || "",
		rec_inst_location: record.rec_inst_location || "",
		rec_inst_city: record.rec_inst_city || "",
		rec_inst_pin: record.rec_inst_pin || "",
		rec_inst_email: record.rec_inst_email || "",
		doc_types: record.doc_types || "",
		iv_status: record.iv_status || "",
		rec_by: record.rec_by || "",
		inst_ref_no: record.inst_ref_no || "",
		ref_date: record.ref_date ? isoToDMY(record.ref_date) : "",
		study_mode: record.study_mode || "",
		doc_remark: record.doc_remark || "",
	};
};

const buildMainPayload = (form) => ({
	doc_rec: form.doc_rec?.trim() || null,
	doc_rec_date: form.doc_rec_date ? dmyToISO(form.doc_rec_date) : null,
	inst_veri_number: form.inst_veri_number?.trim() || "",
	inst_veri_date: form.inst_veri_date ? dmyToISO(form.inst_veri_date) : null,
	iv_record_no: form.iv_record_no ? Number(form.iv_record_no) : null,
	rec_inst_sfx_name: form.rec_inst_sfx_name?.trim() || "",
	rec_inst_name: form.rec_inst_name?.trim() || "",
	rec_inst_address_1: form.rec_inst_address_1?.trim() || "",
	rec_inst_address_2: form.rec_inst_address_2?.trim() || "",
	rec_inst_location: form.rec_inst_location?.trim() || "",
	rec_inst_city: form.rec_inst_city?.trim() || "",
	rec_inst_pin: form.rec_inst_pin?.trim() || "",
	rec_inst_email: form.rec_inst_email?.trim() || "",
	doc_types: form.doc_types?.trim() || "",
	iv_status: form.iv_status || "",
	rec_by: form.rec_by?.trim() || "",
	inst_ref_no: form.inst_ref_no?.trim() || "",
	ref_date: form.ref_date ? dmyToISO(form.ref_date) : null,
	study_mode: form.study_mode?.trim() || "",
	doc_remark: form.doc_remark?.trim() || "",
});

const buildStudentPayload = (form, docRec) => ({
	doc_rec: docRec || null,
	sr_no: form.sr_no ? Number(form.sr_no) : null,
	enrollment: form.enrollment?.trim() || null,
	enrollment_no_text: form.enrollment?.trim() || null,
	student_name: form.student_name?.trim() || "",
	type_of_credential: form.type_of_credential?.trim() || "",
	month_year: form.month_year?.trim() || "",
	verification_status: form.verification_status || "",
	iv_degree_name: form.iv_degree_name?.trim() || "",
});

const NoAccessState = () => (
	<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
		<p className="text-base font-semibold">You do not have permission to view Institutional Verification.</p>
		<p className="text-sm text-slate-500">Please contact the administrator to enable access.</p>
	</div>
);

const InstitutionalLetter = ({ rights = DEFAULT_RIGHTS, onToggleSidebar, onToggleChatbox }) => {
	const [selectedAction, setSelectedAction] = useState("➕");
	const [mform, setMForm] = useState(createMainForm());
	const [sform, setSForm] = useState(createStudentForm());
	const [editingStudentId, setEditingStudentId] = useState(null);
	const [list, setList] = useState([]);
	const [listError, setListError] = useState("");
	const [loadingList, setLoadingList] = useState(false);
	const [detailLoading, setDetailLoading] = useState(false);
	const [studentsLoading, setStudentsLoading] = useState(false);
	const [srows, setSRows] = useState([]);
	const [q, setQ] = useState("");
	const [statusMessage, setStatusMessage] = useState("");
	const [showInstitutePanel, setShowInstitutePanel] = useState(true);
	const [showRecordsPanel, setShowRecordsPanel] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [searchField, setSearchField] = useState("all");
	const [searchResults, setSearchResults] = useState([]);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [hasSearchRun, setHasSearchRun] = useState(false);
	const [recInstSuggestions, setRecInstSuggestions] = useState([]);
	const [docRecCandidates, setDocRecCandidates] = useState([]);
	const suggestionHideTimer = useRef(null);
	const recInstDebounce = useRef(null);
	const docRecDebounce = useRef(null);
	const selectedRecordId = mform.id;
	const [savingMain, setSavingMain] = useState(false);
	const [savingStudent, setSavingStudent] = useState(false);

	// Auto-fetch student name when enrollment is typed
	useEnrollmentLookup(sform.enrollment, (enr) => {
		if (enr) {
			setSForm((prev) => ({
				...prev,
				enrollment: enr.enrollment_no || prev.enrollment,
				student_name: enr.student_name || '',
			}));
		} else {
			setSForm((prev) => ({
				...prev,
				student_name: '',
			}));
		}
	});

	const isSearchMode = selectedAction === "🔍";
	const isReportMode = selectedAction === "📄 Report";

	const authHeaders = useCallback(() => {
		try {
			const token = localStorage.getItem("access_token");
			return token ? { Authorization: `Bearer ${token}` } : {};
		} catch (err) {
			console.warn("authHeaders", err);
			return {};
		}
	}, []);

	const setStatus = useCallback((message, timeout = 4000) => {
		setStatusMessage(message);
		if (!message) return;
		if (timeout) {
			setTimeout(() => setStatusMessage(""), timeout);
		}
	}, []);

	const loadList = useCallback(
		async (queryOverride = "") => {
			if (!rights.can_view) return;
			const query = typeof queryOverride === "string" ? queryOverride : "";
			setLoadingList(true);
			setListError("");
			try {
				const trimmed = query.trim();
				const searchParams = {
					search: "",
					ivRecordNo: "",
					limit: 50,
				};
				if (trimmed) {
					if (/^\d+$/.test(trimmed)) {
						searchParams.ivRecordNo = trimmed;
					} else {
						searchParams.search = trimmed;
					}
				}
				const records = await fetchInstLetterMains(searchParams);
				records.sort((a, b) => (b?.id || 0) - (a?.id || 0));
				setList(records);
			} catch (err) {
				console.error(err);
				setList([]);
				setListError(err.message || "Unable to load records");
			} finally {
				setLoadingList(false);
			}
		},
		[rights.can_view]
	);

	const loadStudents = useCallback(
		async (docRecId) => {
			if (!docRecId) {
				setSRows([]);
				return;
			}
			setStudentsLoading(true);
			try {
				const rows = await fetchInstLetterStudents({ docRec: docRecId });
				setSRows(rows);
			} catch (err) {
				console.error(err);
				setSRows([]);
				setStatus(err.message || "Unable to load students");
			} finally {
				setStudentsLoading(false);
			}
		},
		[setStatus]
	);

	const resetStudentForm = useCallback(() => {
		setSForm(createStudentForm());
		setEditingStudentId(null);
	}, []);

	useEffect(() => {
		if (rights.can_view) {
			loadList();
		}
	}, [rights.can_view, loadList]);

	useEffect(() => {
		return () => {
			if (recInstDebounce.current) clearTimeout(recInstDebounce.current);
			if (suggestionHideTimer.current) clearTimeout(suggestionHideTimer.current);
			if (docRecDebounce.current) clearTimeout(docRecDebounce.current);
		};
	}, []);

	useEffect(() => {
		if (docRecDebounce.current) clearTimeout(docRecDebounce.current);
		const raw = mform.iv_record_no?.trim();
		if (!raw || raw.length < 4) {
			setDocRecCandidates([]);
			return;
		}
		docRecDebounce.current = setTimeout(async () => {
			try {
				const data = await suggestInstLetterDocRec({ number: raw, apiBase });
				setDocRecCandidates(data?.candidates || []);
			} catch (err) {
				console.warn("doc rec suggestion", err);
				setDocRecCandidates([]);
			}
		}, 400);
	}, [mform.iv_record_no]);

	const handleRecInstNameChange = (value) => {
		setMForm((prev) => ({ ...prev, rec_inst_name: value }));
		if (recInstDebounce.current) clearTimeout(recInstDebounce.current);
		if (!value || value.trim().length < 3) {
			setRecInstSuggestions([]);
			return;
		}
		recInstDebounce.current = setTimeout(async () => {
			try {
				const res = await fetch(`${apiBase}/inst-verification-main/search-rec-inst/?q=${encodeURIComponent(value.trim())}`, {
					headers: { Accept: "application/json", ...authHeaders() },
					credentials: "include",
				});
				if (!res.ok) throw new Error("Unable to search institutes");
				const data = await res.json();
				const shaped = Array.isArray(data)
					? data.map((item) => ({
						id: item.id,
						institute_name: item.name || item.rec_inst_name || value,
						institute_city: item.city || item.rec_inst_city || "",
					}))
					: [];
				setRecInstSuggestions(shaped);
			} catch (err) {
				console.warn("rec inst search", err);
				setRecInstSuggestions([]);
			}
		}, 300);
	};

	const hideSuggestionsWithDelay = () => {
		suggestionHideTimer.current = setTimeout(() => setRecInstSuggestions([]), 150);
	};

	const applyRecInstSuggestion = (item) => {
		setRecInstSuggestions([]);
		setMForm((prev) => ({
			...prev,
			rec_inst_name: item.institute_name || prev.rec_inst_name,
		}));
	};

	const handleRecordSelect = useCallback(
		async (record) => {
			if (!record?.id) return;
			setDetailLoading(true);
			try {
				const detail = await fetchInstLetterMainDetail(record.id);
				setMForm(formatMainRecord(detail));
				await loadStudents(detail.doc_rec?.doc_rec_id || detail.doc_rec || "");
				resetStudentForm();
				setSelectedAction("✏️ Edit");
				setShowInstitutePanel(true);
			} catch (err) {
				console.error(err);
				setStatus(err.message || "Unable to open record");
			} finally {
				setDetailLoading(false);
			}
		},
		[loadStudents, resetStudentForm, setStatus]
	);

	const handleSaveMain = async (event) => {
		event?.preventDefault();
		if (!rights.can_create && !rights.can_edit) {
			setStatus("You do not have permission to save main record.");
			return;
		}
		if (!mform.doc_rec?.trim()) {
			setStatus("Doc Rec ID is required before saving.");
			return;
		}
		const payload = buildMainPayload(mform);
		if (!payload.doc_rec) {
			setStatus("Doc Rec ID is required.");
			return;
		}
		setSavingMain(true);
		try {
			const data = await saveInstLetterMain(payload, { id: mform.id, apiBase });
			setMForm(formatMainRecord(data));
			setStatus("Main record saved successfully.");
			loadList(q);
		} catch (err) {
			console.error(err);
			setStatus(err.message || "Unable to save main record", 6000);
		} finally {
			setSavingMain(false);
		}
	};

	const handleStudentSave = async () => {
		if (!mform.doc_rec) {
			setStatus("Save or select a main record before adding students.");
			return;
		}
		if (!rights.can_create && !rights.can_edit) {
			setStatus("You do not have permission to save student rows.");
			return;
		}
		if (!sform.student_name.trim() && !sform.enrollment.trim()) {
			setStatus("Provide at least a student name or enrollment number.");
			return;
		}
		const payload = buildStudentPayload(sform, mform.doc_rec);
		setSavingStudent(true);
		try {
			await saveInstLetterStudent(payload, { id: editingStudentId, apiBase });
			setStatus(editingStudentId ? "Student updated successfully." : "Student added successfully.");
			resetStudentForm();
			loadStudents(mform.doc_rec);
		} catch (err) {
			console.error(err);
			setStatus(err.message || "Unable to save student.", 6000);
		} finally {
			setSavingStudent(false);
		}
	};

	const startEditStudent = (row) => {
		setEditingStudentId(row.id);
		setSForm({
			id: row.id,
			sr_no: row.sr_no ? String(row.sr_no) : "",
			enrollment: row.enrollment || row.enrollment_no_text || "",
			student_name: row.student_name || "",
			type_of_credential: row.type_of_credential || "",
			month_year: row.month_year || "",
			verification_status: row.verification_status || "",
			iv_degree_name: row.iv_degree_name || "",
		});
	};

	const deleteStudent = async (row) => {
		if (!rights.can_delete) {
			setStatus("You do not have permission to delete students.");
			return;
		}
		if (!row?.id) return;
		if (!window.confirm("Delete this student row?")) return;
		try {
			await deleteInstLetterStudent(row.id, { apiBase });
			setStatus("Student removed.");
			loadStudents(mform.doc_rec);
		} catch (err) {
			console.error(err);
			setStatus(err.message || "Unable to delete student", 6000);
		}
	};

	const handleAdvancedSearch = async (event) => {
		event.preventDefault();
		if (!rights.can_view) return;
		const term = searchTerm.trim();
		if (!term) {
			setSearchError("Enter a value to search.");
			return;
		}
		setSearchError("");
		setSearching(true);
		const field = searchField;
		const searchParams = { limit: 100 };
		if (field === "iv_record_no") {
			searchParams.ivRecordNo = term.replace(/\D/g, "");
		} else if (field === "inst_veri_number") {
			searchParams.instVeriNumber = term;
		} else if (field === "doc_rec") {
			searchParams.docRec = term;
		} else {
			searchParams.search = term;
		}
		try {
			const records = await fetchInstLetterMains(searchParams);
			setSearchResults(records);
			setHasSearchRun(true);
			if (!records.length) {
				setSearchError("No matching records found.");
			}
		} catch (err) {
			console.error(err);
			setSearchResults([]);
			setSearchError(err.message || "Search failed.");
		} finally {
			setSearching(false);
		}
	};

	const resetSearchPanel = () => {
		setSearchTerm("");
		setSearchField("all");
		setSearchResults([]);
		setHasSearchRun(false);
		setSearchError("");
	};

	const resetMainForm = () => {
		setMForm(createMainForm());
		setSRows([]);
		resetStudentForm();
		setSelectedAction("➕");
	};

	const renderSearchPanel = () => (
		<>
			<section className="rounded-2xl border bg-white p-4 shadow-sm">
				<form className="space-y-4" onSubmit={handleAdvancedSearch}>
					<div className="grid gap-4 md:grid-cols-12">
						<div className="md:col-span-6">
							<label className="label">Search Value</label>
							<input
								className="input"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								placeholder="Enrollment, IV record no, Doc Rec, institute…"
							/>
						</div>
						<div className="md:col-span-3">
							<label className="label">Field</label>
							<select className="input" value={searchField} onChange={(e) => setSearchField(e.target.value)}>
								{SEARCH_FIELDS.map((field) => (
									<option key={field.value} value={field.value}>
										{field.label}
									</option>
								))}
							</select>
						</div>
						<div className="md:col-span-3 flex items-end gap-2">
							<button
								type="submit"
								disabled={searching}
								className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
							>
								{searching ? "Searching…" : "Search"}
							</button>
							<button
								type="button"
								onClick={resetSearchPanel}
								className="rounded border px-4 py-2"
								disabled={searching}
							>
								Clear
							</button>
						</div>
					</div>
					<p className="text-xs text-slate-500">
						Enrollment and student-level searches currently use the best-effort search vector on main records.
					</p>
					{searchError && (
						<div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{searchError}</div>
					)}
				</form>
			</section>
			<section className="rounded-2xl border bg-white p-4 shadow-sm">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-lg font-semibold">Search Results</h3>
					{hasSearchRun && <span className="text-sm text-slate-500">{searchResults.length} record(s)</span>}
				</div>
				<RecordsTable
					records={searchResults}
					loading={searching}
					emptyLabel={hasSearchRun ? "No matches." : "Run a search to see results."}
					onRowClick={handleRecordSelect}
					clickable
				/>
			</section>
		</>
	);

	const renderMainPanels = () => (
		<>
			<section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-lg font-semibold">Institutional Verification</h3>
					<div className="flex gap-2">
						<button type="button" onClick={resetMainForm} className="rounded border px-3 py-1 text-sm">
							Reset
						</button>
						<button
							type="button"
							onClick={handleSaveMain}
							disabled={savingMain || (!rights.can_create && !rights.can_edit)}
							className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
						>
							{savingMain ? "Saving…" : "Save"}
						</button>
					</div>
				</div>
				<fieldset className="grid gap-4 md:grid-cols-12" disabled={detailLoading}>
					<div className="md:col-span-3">
						<label className="label">Doc Rec ID</label>
						<input
							className="input"
							value={mform.doc_rec}
							onChange={(e) => setMForm((prev) => ({ ...prev, doc_rec: e.target.value.trim() }))}
							placeholder="iv_25_0001"
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Doc Rec Date</label>
						<input
							type="date"
							className="input"
							value={mform.doc_rec_date ? dmyToISO(mform.doc_rec_date) : ""}
							onChange={(e) => setMForm((prev) => ({ ...prev, doc_rec_date: isoToDMY(e.target.value) }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Inst Veri No</label>
						<input
							className="input"
							value={mform.inst_veri_number}
							onChange={(e) => {
								const value = e.target.value;
								const autoIv = computeIvRecordNumber(value);
								setMForm((prev) => ({ ...prev, inst_veri_number: value, iv_record_no: autoIv || prev.iv_record_no }));
							}}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Inst Veri Date</label>
						<input
							type="date"
							className="input"
							value={mform.inst_veri_date ? dmyToISO(mform.inst_veri_date) : ""}
							onChange={(e) => setMForm((prev) => ({ ...prev, inst_veri_date: isoToDMY(e.target.value) }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">IV Record No</label>
						<input
							className="input"
							inputMode="numeric"
							value={mform.iv_record_no}
							onChange={(e) => setMForm((prev) => ({ ...prev, iv_record_no: e.target.value.replace(/\D/g, "") }))}
						/>
						{docRecCandidates.length > 0 && (
							<div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
								{docRecCandidates.map((cand) => (
									<button
										type="button"
										key={cand}
										onClick={() => setMForm((prev) => ({ ...prev, doc_rec: cand }))}
										className="rounded border px-2 py-0.5 hover:bg-slate-50"
									>
										{cand}
									</button>
								))}
							</div>
						)}
					</div>
					<div className="md:col-span-3">
						<label className="label">IV Status</label>
						<select
							className="input"
							value={mform.iv_status}
							onChange={(e) => setMForm((prev) => ({ ...prev, iv_status: e.target.value }))}
						>
							{IV_STATUS_OPTIONS.map((opt) => (
								<option key={opt} value={opt}>
									{opt || "--"}
								</option>
							))}
						</select>
					</div>
					<div className="md:col-span-3">
						<label className="label">Recipient Suffix</label>
						<input
							className="input"
							value={mform.rec_inst_sfx_name}
							onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_sfx_name: e.target.value }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Study Mode</label>
						<input
							className="input"
							maxLength={1}
							value={mform.study_mode}
							onChange={(e) => setMForm((prev) => ({ ...prev, study_mode: e.target.value.slice(0, 1) }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Inst Reference</label>
						<input
							className="input"
							value={mform.inst_ref_no}
							onChange={(e) => setMForm((prev) => ({ ...prev, inst_ref_no: e.target.value }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Reference Date</label>
						<input
							type="date"
							className="input"
							value={mform.ref_date ? dmyToISO(mform.ref_date) : ""}
							onChange={(e) => setMForm((prev) => ({ ...prev, ref_date: isoToDMY(e.target.value) }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Doc Types</label>
						<input
							className="input"
							value={mform.doc_types}
							onChange={(e) => setMForm((prev) => ({ ...prev, doc_types: e.target.value }))}
						/>
					</div>
					<div className="md:col-span-3">
						<label className="label">Received By</label>
						<input className="input" value={mform.rec_by} onChange={(e) => setMForm((prev) => ({ ...prev, rec_by: e.target.value }))} />
					</div>
					<div className="md:col-span-6">
						<label className="label">Recipient Institute</label>
						<div className="relative">
							<input
								className="input"
								value={mform.rec_inst_name}
								onChange={(e) => handleRecInstNameChange(e.target.value)}
								onBlur={hideSuggestionsWithDelay}
								onFocus={() => suggestionHideTimer.current && clearTimeout(suggestionHideTimer.current)}
							/>
							{recInstSuggestions.length > 0 && (
								<div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border bg-white shadow">
									{recInstSuggestions.map((item) => (
										<button
											type="button"
											key={item.id}
											className="block w-full px-3 py-2 text-left hover:bg-slate-50"
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => applyRecInstSuggestion(item)}
										>
											<div className="font-medium">{item.institute_name}</div>
											{item.institute_city && <div className="text-xs text-slate-500">{item.institute_city}</div>}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
					<div className="md:col-span-3">
						<label className="label">Address Line 1</label>
						<input className="input" value={mform.rec_inst_address_1} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_address_1: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">Address Line 2</label>
						<input className="input" value={mform.rec_inst_address_2} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_address_2: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">City</label>
						<input className="input" value={mform.rec_inst_city} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_city: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">Location</label>
						<input className="input" value={mform.rec_inst_location} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_location: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">PIN</label>
						<input className="input" value={mform.rec_inst_pin} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_pin: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">Email</label>
						<input className="input" value={mform.rec_inst_email} onChange={(e) => setMForm((prev) => ({ ...prev, rec_inst_email: e.target.value }))} />
					</div>
					<div className="md:col-span-6">
						<label className="label">Doc Remark</label>
						<textarea
							className="input min-h-[38px]"
							value={mform.doc_remark}
							onChange={(e) => setMForm((prev) => ({ ...prev, doc_remark: e.target.value }))}
						/>
					</div>
				</fieldset>
			</section>

			<section className="rounded-2xl border bg-white p-4 shadow-sm space-y-5">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Students</h3>
					<div className="flex gap-2">
						{editingStudentId && (
							<button type="button" onClick={resetStudentForm} className="rounded border px-3 py-1 text-sm">
								Cancel Edit
							</button>
						)}
						<button
							type="button"
							onClick={handleStudentSave}
							disabled={savingStudent || (!rights.can_create && !rights.can_edit)}
							className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
						>
							{savingStudent ? "Saving…" : editingStudentId ? "Update Student" : "Add Student"}
						</button>
					</div>
				</div>

				<div className="grid gap-4 md:grid-cols-12">
					<div className="md:col-span-2">
						<label className="label">Sr No</label>
						<input className="input" value={sform.sr_no} onChange={(e) => setSForm((prev) => ({ ...prev, sr_no: e.target.value.replace(/\D/g, "") }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">Enrollment</label>
						<input className="input" value={sform.enrollment} onChange={(e) => setSForm((prev) => ({ ...prev, enrollment: e.target.value }))} />
					</div>
					<div className="md:col-span-3">
						<label className="label">Student Name</label>
						<input className="input" value={sform.student_name} onChange={(e) => setSForm((prev) => ({ ...prev, student_name: e.target.value }))} />
					</div>
					<div className="md:col-span-2">
						<label className="label">Credential</label>
						<input className="input" value={sform.type_of_credential} onChange={(e) => setSForm((prev) => ({ ...prev, type_of_credential: e.target.value }))} />
					</div>
					<div className="md:col-span-2">
						<label className="label">Month / Year</label>
						<input className="input" value={sform.month_year} onChange={(e) => setSForm((prev) => ({ ...prev, month_year: e.target.value }))} />
					</div>
					<div className="md:col-span-2">
						<label className="label">Status</label>
						<input className="input" value={sform.verification_status} onChange={(e) => setSForm((prev) => ({ ...prev, verification_status: e.target.value }))} />
					</div>
					<div className="md:col-span-4">
						<label className="label">Degree Name</label>
						<input className="input" value={sform.iv_degree_name} onChange={(e) => setSForm((prev) => ({ ...prev, iv_degree_name: e.target.value }))} />
					</div>
				</div>

				<div className="overflow-auto rounded border">
					{studentsLoading ? (
						<div className="p-6 text-center text-slate-500">Loading students…</div>
					) : srows.length ? (
						<table className="min-w-full text-sm">
							<thead className="bg-slate-50">
								<tr>
									<th className="px-2 py-1 text-left">Sr</th>
									<th className="px-2 py-1 text-left">Enrollment</th>
									<th className="px-2 py-1 text-left">Student</th>
									<th className="px-2 py-1 text-left">Credential</th>
									<th className="px-2 py-1 text-left">Month/Year</th>
									<th className="px-2 py-1 text-left">Status</th>
									<th className="px-2 py-1 text-left">Degree</th>
									<th className="px-2 py-1 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{srows.map((row) => (
									<tr key={row.id || row.sr_no} className="border-t">
										<td className="px-2 py-1">{row.sr_no || "-"}</td>
										<td className="px-2 py-1">{row.enrollment || row.enrollment_no_text || "-"}</td>
										<td className="px-2 py-1">{row.student_name || "-"}</td>
										<td className="px-2 py-1">{row.type_of_credential || "-"}</td>
										<td className="px-2 py-1">{row.month_year || "-"}</td>
										<td className="px-2 py-1">{row.verification_status || "-"}</td>
										<td className="px-2 py-1">{row.iv_degree_name || "-"}</td>
										<td className="px-2 py-1 text-right">
											<div className="flex justify-end gap-2">
												<button type="button" className="text-indigo-600" onClick={() => startEditStudent(row)}>
													Edit
												</button>
												<button type="button" className="text-red-600" onClick={() => deleteStudent(row)}>
													Delete
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<div className="p-6 text-center text-slate-500">No students for this record.</div>
					)}
				</div>
			</section>

			<section className="rounded-2xl border bg-white p-4 shadow-sm">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-lg font-semibold">Records</h3>
					<button
						type="button"
						onClick={() => setShowRecordsPanel((prev) => !prev)}
						className="rounded border px-3 py-1 text-sm"
					>
						{showRecordsPanel ? "Collapse" : "Expand"}
					</button>
				</div>
				{showRecordsPanel && (
					<>
						<div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
							<input
								className="input flex-1"
								placeholder="Search by Doc Rec / Inst Name / IV number"
								value={q}
								onChange={(e) => setQ(e.target.value)}
							/>
							<button
								type="button"
								onClick={() => loadList(q)}
								disabled={loadingList}
								className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
							>
								{loadingList ? "Searching…" : "Search"}
							</button>
						</div>
						{listError && (
							<div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</div>
						)}
						<RecordsTable
							records={list}
							loading={loadingList || detailLoading}
							emptyLabel="No records available"
							onRowClick={handleRecordSelect}
							clickable
							activeId={selectedRecordId}
						/>
					</>
				)}
			</section>
		</>
	);

	const renderReportPanel = () => (
		<InstVerReport
			apiBase={apiBase}
			authHeadersFn={authHeaders}
			defaultIvRecordNo={mform.iv_record_no || ""}
			defaultInstVeriNumber={mform.inst_veri_number || ""}
			records={list}
		/>
	);

	const renderContent = () => {
		if (isSearchMode) return renderSearchPanel();
		if (isReportMode) return renderReportPanel();
		return renderMainPanels();
	};

	return (
		<div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
			<PageTopbar
				title="Institutional Verification"
				actions={ACTIONS}
				selected={selectedAction}
				onSelect={setSelectedAction}
				onToggleSidebar={onToggleSidebar}
				onToggleChatbox={onToggleChatbox}
			/>
			{!rights.can_view ? (
				<NoAccessState />
			) : (
				<div className="space-y-4">
					{statusMessage && (
						<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
							{statusMessage}
						</div>
					)}
					{renderContent()}
				</div>
			)}
		</div>
	);
};

const RecordsTable = ({ records = [], loading, emptyLabel = "No records", onRowClick, clickable = false, activeId = null }) => {
	if (loading) {
		return <div className="rounded-2xl border bg-white p-6 text-center text-slate-500">Loading records…</div>;
	}
	if (!records.length) {
		return <div className="rounded-2xl border bg-white p-6 text-center text-slate-500">{emptyLabel}</div>;
	}
	return (
		<div className="overflow-auto rounded-2xl border">
			<table className="min-w-full text-sm">
				<thead className="bg-slate-50 text-xs uppercase text-slate-500">
					<tr>
						<th className="px-3 py-2 text-left">Doc Rec</th>
						<th className="px-3 py-2 text-left">Inst Veri No</th>
						<th className="px-3 py-2 text-left">IV Record</th>
						<th className="px-3 py-2 text-left">Recipient</th>
						<th className="px-3 py-2 text-left">Status</th>
						<th className="px-3 py-2 text-left">Doc Types</th>
					</tr>
				</thead>
				<tbody>
					{records.map((row) => {
						const docRec = typeof row.doc_rec === "string" ? row.doc_rec : row.doc_rec?.doc_rec_id || "";
						return (
							<tr
								key={row.id || docRec}
								className={`border-t ${clickable ? "cursor-pointer hover:bg-slate-50" : ""} ${activeId && activeId === row.id ? "bg-indigo-50" : ""}`}
								onClick={() => clickable && onRowClick && onRowClick(row)}
							>
								<td className="px-3 py-2">{docRec || "-"}</td>
								<td className="px-3 py-2">{row.inst_veri_number || "-"}</td>
								<td className="px-3 py-2">{row.iv_record_no || "-"}</td>
								<td className="px-3 py-2">{row.rec_inst_name || "-"}</td>
								<td className="px-3 py-2">{row.iv_status || "-"}</td>
								<td className="px-3 py-2">{row.doc_types || "-"}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
};

export default InstitutionalLetter;
export { InstitutionalLetter };
