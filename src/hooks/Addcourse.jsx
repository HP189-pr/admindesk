import React, { useEffect, useState } from "react";
import API from "../api/axiosInstance";

const Addcourse = () => {
  const [mainCourses, setMainCourses] = useState([]);
  const [subCourses, setSubCourses] = useState([]);
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

  // =========================
  // Load all required data
  // =========================
  const loadData = async () => {
    try {
      const [mainRes, subRes, instRes, offRes] = await Promise.all([
        API.get("/api/mainbranch/"),
        API.get("/api/subbranch/"),
        API.get("/api/institutes/"),
        API.get("/api/institute-course-offerings/"),
      ]);

      const toArray = (d) =>
        Array.isArray(d?.results) ? d.results : d || [];

      setMainCourses(toArray(mainRes.data));
      setSubCourses(toArray(subRes.data));
      setInstitutes(toArray(instRes.data));
      setOfferings(toArray(offRes.data));
    } catch (err) {
      console.error("❌ Failed to load course data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      const payload = { ...offerForm };
      if (!payload.end_date) delete payload.end_date;

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
      console.error("❌ Failed to create offering:", err);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">
        Add Course (Main & Sub) and Institute-wise Offering
      </h2>

      {/* ================= MAIN COURSE ================= */}
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

      {/* ================= SUB COURSE ================= */}
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
              <option key={mc.id} value={mc.maincourse_id}>
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

      {/* ================= OFFERING ================= */}
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
              const maincourse_id = e.target.value;
              setOfferForm((v) => ({
                ...v,
                maincourse_id,
                subcourse_id: "",
              }));

              if (maincourse_id) {
                try {
                  const res = await API.get(
                    `/api/subbranch/?maincourse_id=${encodeURIComponent(
                      maincourse_id
                    )}`
                  );
                  const list = Array.isArray(res.data?.results)
                    ? res.data.results
                    : res.data || [];
                  setSubCourses(list);
                } catch {
                  setSubCourses([]);
                }
              } else {
                setSubCourses([]);
              }
            }}
          >
            <option value="">Select Main Course</option>
            {mainCourses.map((mc) => (
              <option key={mc.id} value={mc.maincourse_id}>
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
                value={sc.subcourse_id}
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

      {/* ================= OFFERINGS TABLE ================= */}
      <div className="p-4 border rounded">
        <h3 className="font-semibold mb-2">Offerings</h3>
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
                  <td className="border p-2">
                    {off.institute?.name}
                  </td>
                  <td className="border p-2">
                    {off.maincourse?.name ||
                      off.maincourse?.maincourse_id}
                  </td>
                  <td className="border p-2">
                    {off.subcourse?.name || "-"}
                  </td>
                  <td className="border p-2">{off.campus || "-"}</td>
                  <td className="border p-2">{off.start_date}</td>
                  <td className="border p-2">
                    {off.end_date || "Running"}
                  </td>
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
