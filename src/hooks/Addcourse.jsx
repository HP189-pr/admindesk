import React, { useEffect, useState } from "react";
import API from "../api/axiosInstance";

const Addcourse = () => {
  const [mainCourses, setMainCourses] = useState([]);
  const [subCourses, setSubCourses] = useState([]);
  const [allSubCourses, setAllSubCourses] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [offerings, setOfferings] = useState([]);

  // Forms state
  const [mainForm, setMainForm] = useState({
    maincourse_id: "",
    course_code: "",
    course_name: "",
  });

  const [subForm, setSubForm] = useState({
    subcourse_id: "",
    maincourse_id: "",
    subcourse_name: "",
  });

  const [offerForm, setOfferForm] = useState({
    institute_id: "",
    maincourse_id: "",
    subcourse_id: "",
    campus: "",
    start_date: "",
    end_date: "",
  });
  const [activeTab, setActiveTab] = useState("main");

  // =========================
  // Load all required data
  // =========================
  const loadData = async () => {
    try {
      const [mainRes, subRes, instRes, offRes] = await Promise.all([
        API.get("/api/mainbranch/"),
        API.get("/api/subbranch/?page_size=5000"),
        API.get("/api/institutes/"),
        API.get("/api/institute-course-offerings/"),
      ]);

      const toArray = (d) =>
        Array.isArray(d?.results) ? d.results : d || [];

      setMainCourses(toArray(mainRes.data));
      const subList = toArray(subRes.data);
      setSubCourses(subList);
      setAllSubCourses(subList);
      setInstitutes(toArray(instRes.data));
      setOfferings(toArray(offRes.data));
    } catch (err) {
      console.error("❌ Failed to load course data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const normalizeList = (data) =>
    Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

  const matchSubToMain = (sub, selectedMainCandidates = []) => {
    const targetSet = new Set(
      selectedMainCandidates
        .filter((v) => v !== undefined && v !== null)
        .map((v) => String(v).trim())
        .filter(Boolean)
    );
    if (targetSet.size === 0) return false;

    const candidates = [
      sub?.maincourse_id,
      sub?.maincourse,
      sub?.maincourse?.maincourse_id,
      sub?.maincourse?.id,
      sub?.maincourse?.course_code,
    ]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v).trim());

    return candidates.some((v) => targetSet.has(v));
  };

  const loadSubCoursesForMain = async (selectedMain) => {
    const target = String(selectedMain || '').trim();
    if (!target) {
      setSubCourses([]);
      return;
    }

    const selectedMainObj = mainCourses.find(
      (mc) =>
        String(mc?.maincourse_id || '').trim() === target ||
        String(mc?.id || '').trim() === target ||
        String(mc?.course_code || '').trim() === target
    );

    const selectedMainCandidates = [
      target,
      selectedMainObj?.id,
      selectedMainObj?.maincourse_id,
      selectedMainObj?.course_code,
    ];

    if (Array.isArray(allSubCourses) && allSubCourses.length > 0) {
      const filteredLocal = allSubCourses.filter((sc) =>
        matchSubToMain(sc, selectedMainCandidates)
      );
      if (filteredLocal.length > 0) {
        setSubCourses(filteredLocal);
        return;
      }
    }

    try {
      let list = [];

      const byMainCourseId = await API.get(
        `/api/subbranch/?maincourse_id=${encodeURIComponent(target)}`
      );
      list = normalizeList(byMainCourseId.data);

      if (!Array.isArray(list) || list.length === 0) {
        const byMainCourse = await API.get(
          `/api/subbranch/?maincourse=${encodeURIComponent(target)}`
        );
        list = normalizeList(byMainCourse.data);
      }

      if (!Array.isArray(list) || list.length === 0) {
        const allSub = await API.get('/api/subbranch/');
        const allList = normalizeList(allSub.data);
        list = allList.filter((sc) => matchSubToMain(sc, selectedMainCandidates));
      }

      setSubCourses(Array.isArray(list) ? list : []);
    } catch {
      setSubCourses([]);
    }
  };

  // =========================
  // Create Main Course
  // =========================
  const createMain = async () => {
    try {
      await API.post("/api/mainbranch/", mainForm);
      setMainForm({ maincourse_id: "", course_code: "", course_name: "" });
      loadData();
    } catch (err) {
      console.error("❌ Failed to create main course:", err);
    }
  };

  // =========================
  // Create Sub Course
  // =========================
  const createSub = async () => {
    try {
      await API.post("/api/subbranch/", subForm);
      setSubForm({ subcourse_id: "", maincourse_id: "", subcourse_name: "" });
      loadData();
    } catch (err) {
      console.error("❌ Failed to create sub course:", err);
    }
  };

  // =========================
  // Create Offering
  // =========================
  const createOffering = async () => {
    try {
      const selectedMain = mainCourses.find(
        (mc) =>
          String(mc?.id) === String(offerForm.maincourse_id) ||
          String(mc?.maincourse_id) === String(offerForm.maincourse_id)
      );

      const selectedSub = subCourses.find(
        (sc) =>
          String(sc?.id) === String(offerForm.subcourse_id) ||
          String(sc?.subcourse_id) === String(offerForm.subcourse_id)
      );

      const payload = {
        ...offerForm,
        maincourse_id: selectedMain?.id ?? offerForm.maincourse_id,
        subcourse_id: offerForm.subcourse_id
          ? (selectedSub?.id ?? offerForm.subcourse_id)
          : "",
      };
      if (!payload.end_date) delete payload.end_date;
      if (!payload.subcourse_id) delete payload.subcourse_id;

      await API.post("/api/institute-course-offerings/", payload);
      setOfferForm({
        institute_id: "",
        maincourse_id: "",
        subcourse_id: "",
        campus: "",
        start_date: "",
        end_date: "",
      });
      loadData();
    } catch (err) {
      console.error("❌ Offering payload:", offerForm);
      console.error("❌ Offering response:", err?.response?.data);
      console.error("❌ Failed to create offering:", err);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        Add Course (Main & Sub) and Institute-wise Offering
      </h2>

      <div className="flex flex-wrap gap-2">
        <button
          className={`px-4 py-2 rounded border ${activeTab === "main" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800"}`}
          onClick={() => setActiveTab("main")}
        >
          Main Course
        </button>
        <button
          className={`px-4 py-2 rounded border ${activeTab === "sub" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800"}`}
          onClick={() => setActiveTab("sub")}
        >
          Sub Course
        </button>
        <button
          className={`px-4 py-2 rounded border ${activeTab === "offering" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800"}`}
          onClick={() => setActiveTab("offering")}
        >
          Course Offering
        </button>
      </div>

      {activeTab === "main" && (
        <>
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Main Course</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                className="border p-2"
                placeholder="Main Course ID"
                value={mainForm.maincourse_id}
                onChange={(e) =>
                  setMainForm((v) => ({ ...v, maincourse_id: e.target.value }))
                }
              />
              <input
                className="border p-2"
                placeholder="Course Code"
                value={mainForm.course_code}
                onChange={(e) =>
                  setMainForm((v) => ({ ...v, course_code: e.target.value }))
                }
              />
              <input
                className="border p-2"
                placeholder="Course Name"
                value={mainForm.course_name}
                onChange={(e) =>
                  setMainForm((v) => ({ ...v, course_name: e.target.value }))
                }
              />
            </div>
            <button
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
              onClick={createMain}
            >
              Add Main Course
            </button>
          </div>

          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Current Main Courses</h3>
            <div className="overflow-auto">
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Main Course ID</th>
                    <th className="border p-2">Course Code</th>
                    <th className="border p-2">Course Name</th>
                  </tr>
                </thead>
                <tbody>
                  {mainCourses.map((mc) => (
                    <tr key={mc.id || mc.maincourse_id}>
                      <td className="border p-2">{mc.maincourse_id || "-"}</td>
                      <td className="border p-2">{mc.course_code || "-"}</td>
                      <td className="border p-2">{mc.course_name || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "sub" && (
        <>
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Sub Course</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                className="border p-2"
                placeholder="Sub Course ID"
                value={subForm.subcourse_id}
                onChange={(e) =>
                  setSubForm((v) => ({ ...v, subcourse_id: e.target.value }))
                }
              />
              <select
                className="border p-2"
                value={subForm.maincourse_id}
                onChange={(e) =>
                  setSubForm((v) => ({ ...v, maincourse_id: e.target.value }))
                }
              >
                <option value="">Select Main Course</option>
                {mainCourses.map((mc) => (
                  <option key={mc.id || mc.maincourse_id} value={mc.maincourse_id || mc.id}>
                    {mc.course_name || mc.maincourse_id}
                  </option>
                ))}
              </select>
              <input
                className="border p-2"
                placeholder="Sub Course Name"
                value={subForm.subcourse_name}
                onChange={(e) =>
                  setSubForm((v) => ({ ...v, subcourse_name: e.target.value }))
                }
              />
            </div>
            <button
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
              onClick={createSub}
            >
              Add Sub Course
            </button>
          </div>

          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Current Sub Courses</h3>
            <div className="overflow-auto">
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Sub Course ID</th>
                    <th className="border p-2">Sub Course Name</th>
                    <th className="border p-2">Main Course ID</th>
                  </tr>
                </thead>
                <tbody>
                  {subCourses.map((sc) => (
                    <tr key={sc.id || sc.subcourse_id}>
                      <td className="border p-2">{sc.subcourse_id || "-"}</td>
                      <td className="border p-2">{sc.subcourse_name || "-"}</td>
                      <td className="border p-2">{sc.maincourse_id || sc.maincourse || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "offering" && (
        <>
          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">
              Institute-wise Course Offering
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                className="border p-2"
                value={offerForm.institute_id}
                onChange={(e) => {
                  const institute_id = e.target.value;
                  setOfferForm((v) => ({ ...v, institute_id }));

                  const inst = institutes.find(
                    (i) => String(i.institute_id) === String(institute_id)
                  );
                  if (inst?.institute_campus) {
                    setOfferForm((v) => ({
                      ...v,
                      campus: inst.institute_campus,
                    }));
                  }
                }}
              >
                <option value="">Select Institute</option>
                {institutes.map((inst) => (
                  <option key={inst.institute_id} value={inst.institute_id}>
                    {inst.institute_name} ({inst.institute_code})
                  </option>
                ))}
              </select>

              <select
                className="border p-2"
                value={offerForm.maincourse_id}
                onChange={async (e) => {
                  const selectedMainId = e.target.value;
                  const selectedMain = mainCourses.find(
                    (mc) => String(mc.id) === String(selectedMainId)
                  );
                  const maincourseFilterKey = selectedMain?.maincourse_id || selectedMainId;

                  setOfferForm((v) => ({
                    ...v,
                    maincourse_id: selectedMainId,
                    subcourse_id: "",
                  }));
                  await loadSubCoursesForMain(maincourseFilterKey);
                }}
              >
                <option value="">Select Main Course</option>
                {mainCourses.map((mc) => (
                  <option key={mc.id || mc.maincourse_id} value={mc.maincourse_id || mc.id || ""}>
                    {mc.course_name || mc.maincourse_id}
                  </option>
                ))}
              </select>

              <select
                className="border p-2"
                value={offerForm.subcourse_id}
                onChange={(e) =>
                  setOfferForm((v) => ({ ...v, subcourse_id: e.target.value }))
                }
                disabled={!offerForm.maincourse_id}
              >
                <option value="">
                  {offerForm.maincourse_id
                    ? "Optional: Select Sub Course"
                    : "Select main course first"}
                </option>
                {subCourses.map((sc) => (
                  <option
                    key={sc.id || sc.subcourse_id}
                    value={sc.subcourse_id || sc.id || ""}
                  >
                    {sc.subcourse_name || sc.subcourse_id}
                  </option>
                ))}
              </select>

              <input
                className="border p-2"
                placeholder="Campus / Place"
                value={offerForm.campus}
                onChange={(e) =>
                  setOfferForm((v) => ({ ...v, campus: e.target.value }))
                }
              />
              <input
                type="date"
                className="border p-2"
                value={offerForm.start_date}
                onChange={(e) =>
                  setOfferForm((v) => ({ ...v, start_date: e.target.value }))
                }
              />
              <input
                type="date"
                className="border p-2"
                value={offerForm.end_date}
                onChange={(e) =>
                  setOfferForm((v) => ({ ...v, end_date: e.target.value }))
                }
              />
            </div>

            <button
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
              onClick={createOffering}
            >
              Add Offering
            </button>
          </div>

          <div className="p-4 border rounded">
            <h3 className="font-semibold mb-2">Current Offerings</h3>
            <div className="overflow-auto">
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2">Institute</th>
                    <th className="border p-2">Main Course</th>
                    <th className="border p-2">Sub Course</th>
                    <th className="border p-2">Campus</th>
                    <th className="border p-2">Start</th>
                    <th className="border p-2">End</th>
                  </tr>
                </thead>
                <tbody>
                  {offerings.map((off) => (
                    <tr key={off.id}>
                      <td className="border p-2">{off.institute?.name}</td>
                      <td className="border p-2">
                        {off.maincourse?.name || off.maincourse?.maincourse_id}
                      </td>
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
        </>
      )}
    </div>
  );
};

export default Addcourse;
