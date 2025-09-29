import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

const Addcourse = () => {
	const token = localStorage.getItem("access_token");
	const authHeader = { headers: { Authorization: `Bearer ${token}` } };

	const [mainCourses, setMainCourses] = useState([]);
	const [subCourses, setSubCourses] = useState([]);
	const [institutes, setInstitutes] = useState([]);
	const [offerings, setOfferings] = useState([]);

	// Forms state
	const [mainForm, setMainForm] = useState({ maincourse_id: "", course_code: "", course_name: "" });
	const [subForm, setSubForm] = useState({ subcourse_id: "", maincourse_id: "", subcourse_name: "" });
	const [offerForm, setOfferForm] = useState({ institute_id: "", maincourse_id: "", subcourse_id: "", campus: "", start_date: "", end_date: "" });

	const api = axios.create({ baseURL: `${API_BASE}/api` });

	const loadData = async () => {
		if (!token) return;
			const [mainRes, subRes, instRes, offRes] = await Promise.all([
				api.get("/mainbranch/", authHeader).catch(() => ({ data: [] })),
				api.get("/subbranch/", authHeader).catch(() => ({ data: [] })),
				api.get("/institutes/", authHeader).catch(() => ({ data: [] })),
				api.get("/institute-course-offerings/", authHeader).catch(() => ({ data: [] })),
			]);
			const toArray = (d) => (d && Array.isArray(d.results) ? d.results : d) || [];
			setMainCourses(toArray(mainRes.data));
			setSubCourses(toArray(subRes.data));
			setInstitutes(toArray(instRes.data));
			setOfferings(toArray(offRes.data));
	};

	useEffect(() => { loadData(); }, []);

	// Create Main Course
	const createMain = async () => {
		await api.post("/mainbranch/", mainForm, authHeader);
		setMainForm({ maincourse_id: "", course_code: "", course_name: "" });
		loadData();
	};

	// Create Sub Course
	const createSub = async () => {
		await api.post("/subbranch/", subForm, authHeader);
		setSubForm({ subcourse_id: "", maincourse_id: "", subcourse_name: "" });
		loadData();
	};

	// Create Offering (institute-wise placement with time range)
	const createOffering = async () => {
		const payload = { ...offerForm };
		if (!payload.end_date) delete payload.end_date; // running course
		await api.post("/institute-course-offerings/", payload, authHeader);
		setOfferForm({ institute_id: "", maincourse_id: "", subcourse_id: "", campus: "", start_date: "", end_date: "" });
		loadData();
	};

	return (
		<div className="space-y-6">
			<h2 className="text-xl font-semibold">Add Course (Main & Sub) and Institute-wise Offering</h2>

			{/* Main Course */}
			<div className="p-4 border rounded">
				<h3 className="font-semibold mb-2">Main Course</h3>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
					<input className="border p-2" placeholder="Main Course ID" value={mainForm.maincourse_id} onChange={(e)=>setMainForm(v=>({...v, maincourse_id:e.target.value}))} />
					<input className="border p-2" placeholder="Course Code" value={mainForm.course_code} onChange={(e)=>setMainForm(v=>({...v, course_code:e.target.value}))} />
					<input className="border p-2" placeholder="Course Name" value={mainForm.course_name} onChange={(e)=>setMainForm(v=>({...v, course_name:e.target.value}))} />
				</div>
				<button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded" onClick={createMain}>Add Main Course</button>
			</div>

			{/* Sub Course */}
			<div className="p-4 border rounded">
				<h3 className="font-semibold mb-2">Sub Course</h3>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
					<input className="border p-2" placeholder="Sub Course ID" value={subForm.subcourse_id} onChange={(e)=>setSubForm(v=>({...v, subcourse_id:e.target.value}))} />
					<select className="border p-2" value={subForm.maincourse_id} onChange={(e)=>setSubForm(v=>({...v, maincourse_id:e.target.value}))}>
						<option value="">Select Main Course</option>
						{mainCourses.map(mc => (
							<option key={mc.id} value={mc.maincourse_id}>{mc.course_name || mc.maincourse_id}</option>
						))}
					</select>
					<input className="border p-2" placeholder="Sub Course Name" value={subForm.subcourse_name} onChange={(e)=>setSubForm(v=>({...v, subcourse_name:e.target.value}))} />
				</div>
				<button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded" onClick={createSub}>Add Sub Course</button>
			</div>

			{/* Institute-wise Offering */}
			<div className="p-4 border rounded">
				<h3 className="font-semibold mb-2">Institute-wise Course Offering</h3>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
								<select
									className="border p-2"
									value={offerForm.institute_id}
									onChange={(e)=>{
										const institute_id = e.target.value;
										setOfferForm(v=>({ ...v, institute_id }));
										const inst = institutes.find(i=> String(i.institute_id) === String(institute_id));
										if (inst && inst.institute_campus) {
											setOfferForm(v=>({ ...v, campus: inst.institute_campus }));
										}
									}}
								>
						<option value="">Select Institute</option>
						{institutes.map(inst => (
							<option key={inst.institute_id} value={inst.institute_id}>{inst.institute_name} ({inst.institute_code})</option>
						))}
					</select>
								<select
									className="border p-2"
									value={offerForm.maincourse_id}
									onChange={(e)=>{
										const maincourse_id = e.target.value;
										// reset dependent subcourse when main changes
										setOfferForm(v=>({ ...v, maincourse_id, subcourse_id: "" }));
										// Fetch only sub-courses that belong to this main course
										if (maincourse_id) {
											api.get(`/subbranch/?maincourse_id=${encodeURIComponent(maincourse_id)}`, authHeader)
												.then(res => {
													const data = res.data;
													const list = data && Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
													setSubCourses(list);
												})
												.catch(() => {
													// fallback: clear to force user to reselect
													setSubCourses([]);
												});
										} else {
											// If cleared, load all or clear; prefer clear to avoid mismatch
											setSubCourses([]);
										}
									}}
								>
						<option value="">Select Main Course</option>
						{mainCourses.map(mc => (
							<option key={mc.id} value={mc.maincourse_id}>{mc.course_name || mc.maincourse_id}</option>
						))}
					</select>
								{(() => {
									const hasMain = !!offerForm.maincourse_id;
									const list = hasMain ? subCourses : [];
									return (
										<select
											className="border p-2"
											value={offerForm.subcourse_id}
											onChange={(e)=>setOfferForm(v=>({...v, subcourse_id:e.target.value}))}
											disabled={!hasMain}
										>
											<option value="">{hasMain ? "Optional: Select Sub Course" : "Select a main course first"}</option>
											{list.map(sc => (
												<option key={sc.id || sc.subcourse_id} value={sc.subcourse_id}>{sc.subcourse_name || sc.subcourse_id}</option>
											))}
										</select>
									);
								})()}
								<input className="border p-2" placeholder="Campus / Place (A, B, ...)" value={offerForm.campus} onChange={(e)=>setOfferForm(v=>({...v, campus:e.target.value}))} />
					<input type="date" className="border p-2" value={offerForm.start_date} onChange={(e)=>setOfferForm(v=>({...v, start_date:e.target.value}))} />
					<input type="date" className="border p-2" value={offerForm.end_date} onChange={(e)=>setOfferForm(v=>({...v, end_date:e.target.value}))} placeholder="Leave blank if running" />
				</div>
				<button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded" onClick={createOffering}>Add Offering</button>
			</div>

			{/* Offerings Table */}
			<div className="p-4 border rounded">
				<h3 className="font-semibold mb-2">Offerings</h3>
				<div className="overflow-auto">
					<table className="min-w-full border">
						<thead>
							<tr className="bg-gray-100">
								<th className="border p-2 text-left">Institute</th>
								<th className="border p-2 text-left">Main Course</th>
								<th className="border p-2 text-left">Sub Course</th>
								<th className="border p-2 text-left">Campus/Place</th>
								<th className="border p-2 text-left">Start</th>
								<th className="border p-2 text-left">End</th>
							</tr>
						</thead>
						<tbody>
							{offerings.map(off => (
								<tr key={off.id}>
									<td className="border p-2">{off.institute?.name}</td>
									<td className="border p-2">{off.maincourse?.name || off.maincourse?.maincourse_id}</td>
									<td className="border p-2">{off.subcourse?.name || "-"}</td>
									<td className="border p-2">{off.campus || "-"}</td>
									<td className="border p-2">{off.start_date}</td>
									<td className="border p-2">{off.end_date || "Running"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
};

export default Addcourse;
