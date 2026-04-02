// src/utils/mediaUrl.js
import { API_BASE_URL } from "../api/axiosInstance";

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value);

export const normalizeMediaUrl = (value) => {
  if (!value) return value;

  if (isAbsoluteUrl(value) || value.startsWith("data:")) {
    if (value.startsWith("data:")) return value;
    try {
      const url = new URL(value);
      // Rewrite any absolute media URL to go through the current backend origin.
      // This handles URLs stored with a different server IP (e.g. 160.160.160.130)
      // as well as localhost/127.0.0.1 dev URLs.
      if (url.pathname.startsWith("/media/")) {
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

  if (value.startsWith("/profile_pictures/")) {
    return `${API_BASE_URL}/media${value}`;
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
    source?.profile_picture_path ||
    source?.usrpic ||
    source?.photoUrl ||
    source?.avatar ||
    source?.avatar_url ||
    source?.profilePictureUrl ||
    source?.picture ||
    source?.image ||
    source?.user_profile?.profile_picture ||
    source?.user_profile?.profile_picture_url ||
    source?.profile?.profile_picture ||
    source?.profile?.profile_picture_url ||
    source?.profilePicture ||
    "";

  return normalizeMediaUrl(raw) || DEFAULT_PROFILE_PIC;
};
