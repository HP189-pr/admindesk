import React, { useMemo, useState, useEffect } from "react";
import PageTopbar from "../components/PageTopbar";
import { dmyToISO, isoToDMY } from "../utils/date";

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

const InstitutionalVerification = ({ onToggleSidebar, onToggleChatbox }) => {
	const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
	const [panelOpen, setPanelOpen] = useState(true);

	// Main form (inst_verification_main)
	const [mform, setMForm] = useState({
		id: null,
		doc_rec: "", // public id string
		doc_rec_key: "", // write-only param name for API
		inst_veri_number: "",
		inst_veri_date: "",
		institute: "",
		doc_rec_date: "",
		rec_by: "",
		rec_inst_name: "",
		rec_inst_address_1: "",
		rec_inst_address_2: "",
		rec_inst_location: "",
		rec_inst_city: "",
		rec_inst_pin: "",
		rec_inst_email: "",
		inst_ref_no: "",
		ref_date: "",
		ref_phone: "",
	});

	// Student sub-rows (inst_verification_student)
	const [srows, setSRows] = useState([]);
	const [activeStudent, setActiveStudent] = useState({
		id: null,
		doc_rec: "",
		doc_rec_key: "",
		sr_no: "",
		enrollment: "", // will hold enrollment_no
		student_name: "",
		institute: "",
		sub_course: "",
		main_course: "",
		type_of_credential: "",
		month_year: "",
		verification_status: "",
	});

	const [list, setList] = useState([]);
	const [loading, setLoading] = useState(false);
	const [q, setQ] = useState("");
	const [currentRow, setCurrentRow] = useState(null);

	const authHeaders = () => {
		const token = localStorage.getItem("access_token");
		return token ? { Authorization: `Bearer ${token}` } : {};
	};

	// Load main rows
	const loadList = async () => {
		setLoading(true);
		try {
			const url = q ? `/api/inst-verification-main/?search=${encodeURIComponent(q)}` : `/api/inst-verification-main/`;
			const res = await fetch(url, { headers: { ...authHeaders() } });
			const data = await res.json();
			setList(Array.isArray(data) ? data : data.results || []);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadList();
	}, []);

	const onSelectTopbar = (action) => {
		if (action === selectedTopbarMenu) {
			setPanelOpen((o) => !o);
		} else {
			setSelectedTopbarMenu(action);
			setPanelOpen(true);
		}
	};

	const setMF = (k, v) => setMForm((f) => ({ ...f, [k]: v }));
	const setSF = (k, v) => setActiveStudent((f) => ({ ...f, [k]: v }));

	const saveMain = async () => {
		const payload = {
			doc_rec_key: mform.doc_rec_key || mform.doc_rec || undefined,
			inst_veri_number: mform.inst_veri_number || null,
			inst_veri_date: dmyToISO(mform.inst_veri_date) || null,
			institute: mform.institute || null,
			doc_rec_date: mform.doc_rec_date || null,
			rec_by: mform.rec_by || null,
			rec_inst_name: mform.rec_inst_name || null,
			rec_inst_address_1: mform.rec_inst_address_1 || null,
			rec_inst_address_2: mform.rec_inst_address_2 || null,
			rec_inst_location: mform.rec_inst_location || null,
			rec_inst_city: mform.rec_inst_city || null,
			rec_inst_pin: mform.rec_inst_pin || null,
			rec_inst_email: mform.rec_inst_email || null,
			inst_ref_no: mform.inst_ref_no || null,
			ref_date: dmyToISO(mform.ref_date) || null,
			ref_phone: mform.ref_phone || null,
		};
		if (mform.id) {
			const res = await fetch(`/api/inst-verification-main/${mform.id}/`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error(await res.text());
		} else {
			const res = await fetch(`/api/inst-verification-main/`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error(await res.text());
			const row = await res.json();
			setMForm((f) => ({ ...f, id: row.id, doc_rec: row.doc_rec }));
		}
	};

	const saveStudent = async () => {
		const payload = {
			doc_rec_key: mform.doc_rec || mform.doc_rec_key || undefined,
			sr_no: activeStudent.sr_no || null,
			enrollment: activeStudent.enrollment || null,
			student_name: activeStudent.student_name || null,
			institute: activeStudent.institute || null,
			sub_course: activeStudent.sub_course || null,
			main_course: activeStudent.main_course || null,
			type_of_credential: activeStudent.type_of_credential || null,
			month_year: activeStudent.month_year || null,
			verification_status: activeStudent.verification_status || null,
		};
		if (activeStudent.id) {
			const res = await fetch(`/api/inst-verification-student/${activeStudent.id}/`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error(await res.text());
		} else {
			const res = await fetch(`/api/inst-verification-student/`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...authHeaders() },
				body: JSON.stringify(payload),
			});
			if (!res.ok) throw new Error(await res.text());
		}
	};

	const openEdit = async (row) => {
		setCurrentRow(row);
		setMForm({
			id: row.id,
			doc_rec: row.doc_rec,
			inst_veri_number: row.inst_veri_number || "",
			inst_veri_date: row.inst_veri_date || "",
			institute: row.institute || "",
			doc_rec_date: row.doc_rec_date || "",
			rec_by: row.rec_by || "",
			rec_inst_name: row.rec_inst_name || "",
			rec_inst_address_1: row.rec_inst_address_1 || "",
			rec_inst_address_2: row.rec_inst_address_2 || "",
			rec_inst_location: row.rec_inst_location || "",
			rec_inst_city: row.rec_inst_city || "",
			rec_inst_pin: row.rec_inst_pin || "",
			rec_inst_email: row.rec_inst_email || "",
			inst_ref_no: row.inst_ref_no || "",
			ref_date: row.ref_date || "",
			ref_phone: row.ref_phone || "",
		});
		try {
			const res = await fetch(`/api/inst-verification-student/?doc_rec=${encodeURIComponent(row.doc_rec)}`, { headers: { ...authHeaders() } });
			const data = await res.json();
			setSRows(Array.isArray(data) ? data : data.results || []);
		} catch (e) {
			setSRows([]);
		}
		setSelectedTopbarMenu("✏️ Edit");
		setPanelOpen(true);
	};

	return (
		<div className="p-4 md:p-6 space-y-4 h-full">
			<PageTopbar
				titleSlot={
					<div className="mr-2 select-none">
						<h2 className="text-lg md:text-xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
							Institutional Verification
						</h2>
					</div>
				}
				actions={ACTIONS}
				selected={selectedTopbarMenu}
				onSelect={onSelectTopbar}
				actionsOnLeft
				rightSlot={
					<a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">
						🏠 Home
					</a>
				}
			/>

			{/* Collapsible Action Box */}
			<div className="border rounded-2xl overflow-hidden shadow-sm">
				<div className="flex items-center justify-between p-3 bg-gray-50 border-b">
					<div className="font-semibold">{selectedTopbarMenu || "Panel"}</div>
					<button onClick={() => setPanelOpen((o) => !o)} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50">
						{panelOpen ? "Collapse" : "Expand"}
					</button>
				</div>

				{panelOpen && (selectedTopbarMenu === "➕" || selectedTopbarMenu === "✏️ Edit") && (
					<div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
						{/* Main fields */}
						<div>
							<label className="text-sm">Doc Rec</label>
							<input className="w-full border rounded-lg p-2" placeholder="iv_25_0001" value={mform.doc_rec} onChange={(e) => setMF("doc_rec", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Inst Veri No</label>
							<input className="w-full border rounded-lg p-2" value={mform.inst_veri_number} onChange={(e) => setMF("inst_veri_number", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Inst Veri Date</label>
							<input className="w-full border rounded-lg p-2" placeholder="dd-mm-yyyy" value={mform.inst_veri_date} onChange={(e) => setMF("inst_veri_date", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Institute</label>
							<input className="w-full border rounded-lg p-2" value={mform.institute} onChange={(e) => setMF("institute", e.target.value)} />
						</div>

						<div>
							<label className="text-sm">Rec By</label>
							<select className="w-full border rounded-lg p-2" value={mform.rec_by} onChange={(e)=>setMF("rec_by", e.target.value)}>
								<option value="">--</option>
								<option value="Mail">Mail</option>
								<option value="Post">Post</option>
								<option value="Self">Self</option>
							</select>
						</div>
						<div>
							<label className="text-sm">Rec Inst Name</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_name} onChange={(e) => setMF("rec_inst_name", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Ref No</label>
							<input className="w-full border rounded-lg p-2" value={mform.inst_ref_no} onChange={(e) => setMF("inst_ref_no", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Ref Date</label>
							<input className="w-full border rounded-lg p-2" placeholder="dd-mm-yyyy" value={mform.ref_date} onChange={(e) => setMF("ref_date", e.target.value)} />
						</div>

						<div className="md:col-span-2">
							<label className="text-sm">Address 1</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_address_1} onChange={(e) => setMF("rec_inst_address_1", e.target.value)} />
						</div>
						<div className="md:col-span-2">
							<label className="text-sm">Address 2</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_address_2} onChange={(e) => setMF("rec_inst_address_2", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Location</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_location} onChange={(e) => setMF("rec_inst_location", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">City</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_city} onChange={(e) => setMF("rec_inst_city", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">PIN</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_pin} onChange={(e) => setMF("rec_inst_pin", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Email</label>
							<input className="w-full border rounded-lg p-2" value={mform.rec_inst_email} onChange={(e) => setMF("rec_inst_email", e.target.value)} />
						</div>
						<div>
							<label className="text-sm">Phone</label>
							<input className="w-full border rounded-lg p-2" value={mform.ref_phone} onChange={(e) => setMF("ref_phone", e.target.value)} />
						</div>

						{/* Save */}
						<div className="md:col-span-4 flex justify-end">
							<button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={async()=>{
								try {
									await saveMain();
									alert('Saved main');
									await loadList();
								} catch(e){ alert(e.message || 'Failed'); }
							}}>Save Main</button>
						</div>

						{/* Student subpanel */}
						<div className="md:col-span-4 border-t pt-3">
							<div className="font-semibold mb-2">Add Students for Inst Ref</div>
							<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
								<div>
									<label className="text-sm">Sr No</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.sr_no} onChange={(e)=>setSF('sr_no', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Enrollment No</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.enrollment} onChange={(e)=>setSF('enrollment', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Student Name</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.student_name} onChange={(e)=>setSF('student_name', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Institute Id</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.institute} onChange={(e)=>setSF('institute', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Main Course</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.main_course} onChange={(e)=>setSF('main_course', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Sub Course</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.sub_course} onChange={(e)=>setSF('sub_course', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Type of Credential</label>
									<input className="w-full border rounded-lg p-2" placeholder="Passing Year / Awarded Year / SEM-1..8" value={activeStudent.type_of_credential} onChange={(e)=>setSF('type_of_credential', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Month/Year</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.month_year} onChange={(e)=>setSF('month_year', e.target.value)} />
								</div>
								<div>
									<label className="text-sm">Verification Status</label>
									<input className="w-full border rounded-lg p-2" value={activeStudent.verification_status} onChange={(e)=>setSF('verification_status', e.target.value)} />
								</div>
								<div className="md:col-span-4 flex justify-end">
									<button className="px-4 py-2 rounded-lg bg-sky-600 text-white" onClick={async()=>{
										try{ await saveStudent(); alert('Student saved'); openEdit({ id: mform.id, doc_rec: mform.doc_rec }); }catch(e){ alert(e.message||'Failed'); }
									}}>Add Student</button>
								</div>
							</div>

							{/* Existing students list */}
							{Array.isArray(srows) && srows.length>0 && (
								<div className="mt-3 overflow-auto">
									<table className="min-w-[900px] w-full text-sm">
										<thead className="bg-gray-50">
											<tr>
												<th className="text-left py-2 px-3">#</th>
												<th className="text-left py-2 px-3">Sr</th>
												<th className="text-left py-2 px-3">Enroll</th>
												<th className="text-left py-2 px-3">Name</th>
												<th className="text-left py-2 px-3">Inst</th>
												<th className="text-left py-2 px-3">Main</th>
												<th className="text-left py-2 px-3">Sub</th>
												<th className="text-left py-2 px-3">Type</th>
												<th className="text-left py-2 px-3">Month/Year</th>
												<th className="text-left py-2 px-3">Status</th>
											</tr>
										</thead>
										<tbody>
											{srows.map((r, idx) => (
												<tr key={r.id} className="border-b">
													<td className="py-2 px-3">{idx+1}</td>
													<td className="py-2 px-3">{r.sr_no || '-'}</td>
													<td className="py-2 px-3">{r.enrollment || '-'}</td>
													<td className="py-2 px-3">{r.student_name || '-'}</td>
													<td className="py-2 px-3">{r.institute || '-'}</td>
													<td className="py-2 px-3">{r.main_course || '-'}</td>
													<td className="py-2 px-3">{r.sub_course || '-'}</td>
													<td className="py-2 px-3">{r.type_of_credential || '-'}</td>
													<td className="py-2 px-3">{r.month_year || '-'}</td>
													<td className="py-2 px-3">{r.verification_status || '-'}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
				)}

				{panelOpen && selectedTopbarMenu === "🔍" && (
					<div className="p-4 flex gap-2">
						<input className="flex-1 border rounded-lg p-2" placeholder="Search by Doc Rec / Inst Name / Ref no…" value={q} onChange={(e)=>setQ(e.target.value)} />
						<button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={loadList}>Search</button>
					</div>
				)}
			</div>

			{/* Records Section */}
					<div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-260px)] overflow-auto">
						<div className="overflow-auto">
					<table className="min-w-[1100px] w-full text-sm">
						<thead className="bg-gray-50">
							<tr>
								<th className="text-left py-2 px-3">Doc Rec</th>
								<th className="text-left py-2 px-3">Inst Veri No</th>
								<th className="text-left py-2 px-3">Date</th>
								<th className="text-left py-2 px-3">Institute</th>
								<th className="text-left py-2 px-3">Rec By</th>
								<th className="text-left py-2 px-3">Rec Inst Name</th>
								<th className="text-left py-2 px-3">Ref No</th>
								<th className="text-left py-2 px-3">Ref Date</th>
								<th className="text-left py-2 px-3">City</th>
								<th className="text-left py-2 px-3">Email</th>
							</tr>
						</thead>
						<tbody>
							{list.length === 0 && !loading && (
								<tr><td className="py-6 px-3 text-center text-gray-500" colSpan={10}>No records</td></tr>
							)}
							{list.map((r) => (
								<tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(r)}>
									<td className="py-2 px-3">{r.doc_rec || '-'}</td>
									<td className="py-2 px-3">{r.inst_veri_number || '-'}</td>
									<td className="py-2 px-3">{r.inst_veri_date || '-'}</td>
									<td className="py-2 px-3">{r.institute || '-'}</td>
									<td className="py-2 px-3">{r.rec_by || '-'}</td>
									<td className="py-2 px-3">{r.rec_inst_name || '-'}</td>
									<td className="py-2 px-3">{r.inst_ref_no || '-'}</td>
									<td className="py-2 px-3">{r.ref_date || '-'}</td>
									<td className="py-2 px-3">{r.rec_inst_city || '-'}</td>
									<td className="py-2 px-3">{r.rec_inst_email || '-'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};

export default InstitutionalVerification;
