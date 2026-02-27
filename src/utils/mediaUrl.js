import { API_BASE_URL } from "../api/axiosInstance";

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

export const normalizeMediaUrl = (value) => {
  if (!value) return value;

  if (isAbsoluteUrl(value) || value.startsWith("data:")) {
    try {
      const url = new URL(value);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return `${API_BASE_URL}${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return value;
    }
    return value;
  }

  if (value.startsWith("/media/")) {
    return `${API_BASE_URL}${value}`;
  }

  if (value.startsWith("media/")) {
    return `${API_BASE_URL}/${value}`;
  }

  if (value.startsWith("profile_pictures/")) {
    return `${API_BASE_URL}/media/${value}`;
  }

  return value;
};

export const DEFAULT_PROFILE_PIC = "/profilepic/default-profile.png";

export const resolveProfilePicture = (source) => {
  const raw =
    source?.profile_picture ||
    source?.profile_picture_url ||
    source?.usrpic ||
    source?.photoUrl ||
    source?.avatar ||
    source?.avatar_url ||
    source?.user_profile?.profile_picture ||
    source?.profile?.profile_picture ||
    source?.profilePicture ||
    "";

  return normalizeMediaUrl(raw) || DEFAULT_PROFILE_PIC;
};
