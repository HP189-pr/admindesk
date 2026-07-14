//src/services/courseService.js
import API from "../api/axiosInstance";

export const fetchInstituteCodes = async () => {
    const { data } = await API.get("/api/institutes/");
    return data.results || data;
};

export const fetchCourseCodes = async () => {
    const { data } = await API.get("/api/mainbranch/");
    return data.results || data;
};

export const fetchSubcourseNames = async (maincourse_id = "") => {
    const { data } = await API.get("/api/subbranch/", {
        params: maincourse_id ? { maincourse_id } : {},
    });

    return data.results || data;
};