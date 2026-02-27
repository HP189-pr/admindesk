import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiChevronLeft,
  FiChevronRight,
  FiSend,
  FiPaperclip,
  FiFolder,
  FiDownload,
  FiSmile,
} from 'react-icons/fi';
import { useAuth } from '../hooks/AuthContext';
import ChatBoxService from '../services/chatboxservice';
import { API_BASE_URL } from '../api/axiosInstance';

const decodeUserId = () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.user_id || decoded.userId || null;
  } catch {
    return null;
  }
};

const CHAT_PREF_DB = 'admindesk-chat-prefs';
const CHAT_PREF_STORE = 'kv';

const openChatPrefDb = () =>
  new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }
    const req = indexedDB.open(CHAT_PREF_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHAT_PREF_STORE)) {
        db.createObjectStore(CHAT_PREF_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });

const setPrefHandle = async (key, value) => {
  const db = await openChatPrefDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_PREF_STORE, 'readwrite');
    tx.objectStore(CHAT_PREF_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Failed to store preference'));
  });
  db.close();
};

const getPrefHandle = async (key) => {
  const db = await openChatPrefDb();
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction(CHAT_PREF_STORE, 'readonly');
    const req = tx.objectStore(CHAT_PREF_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('Failed to read preference'));
  });
  db.close();
  return value;
};

const ChatBox = ({ isOpen: controlledIsOpen, onToggle }) => {
  const { fetchUsers, token, user } = useAuth();
  const isAuthenticated = useMemo(() => {
    return !!(token || localStorage.getItem('access_token') || user);
  }, [token, user]);
  const selfId = useMemo(() => decodeUserId(), []);

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState({}); // { userId: [msgs] }
  const [filesTab, setFilesTab] = useState({}); // { userId: [files] }
  const [lastMessages, setLastMessages] = useState({}); // { userId: last }
  const [onlineMap, setOnlineMap] = useState({}); // { userId: bool }
  const [unreadCounts, setUnreadCounts] = useState({});
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [userQuery, setUserQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloadDirHandle, setDownloadDirHandle] = useState(null);
  const [downloadDirLabel, setDownloadDirLabel] = useState('Not set');
  const [autoDownload, setAutoDownload] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const EMOJIS = useMemo(() => ['😀', '😁', '😂', '🥰', '😍', '👍', '👏', '🙏', '🎉', '✅', '❌', '🔥', '⭐', '📝', '📎', '📁', '💬'], []);

  const historyTimer = useRef(null);
  const usersTimer = useRef(null);
  const presenceTimer = useRef(null);
  const latestSeenMessageRef = useRef({});
  const latestUsersPollRef = useRef(null);
  const bottomRef = useRef(null);
  const downloadedFilesRef = useRef({});
  const prefsHydratedRef = useRef(false);

  const isOpen = typeof controlledIsOpen === 'boolean' ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (val) => {
    if (typeof onToggle === 'function') onToggle(val);
    else setInternalIsOpen(val);
  };

  const userKey = (u) => u?.id || u?.userid || u?.user_id || u?.pk || u?.usercode;
  const autoDownloadKey = 'chat:auto:common';
  const folderLabelKey = 'chat:folder-label:common';
  const folderHandleKey = 'chat:folder-handle:common';
  const isNumericOnly = (v) => /^\d+$/.test(String(v || '').trim());
  const formatName = (u) => {
    const full = `${u?.first_name || ''} ${u?.last_name || ''}`.trim();
    const fullAlt = (u?.full_name || u?.name || '').trim();
    const username = (u?.username || '').trim();
    const emailName = (u?.email || '').split('@')[0]?.trim();
    const usercode = (u?.usercode || '').toString().trim();

    if (full) return full;
    if (fullAlt && !isNumericOnly(fullAlt)) return fullAlt;
    if (username && !isNumericOnly(username)) return username;
    if (emailName && !isNumericOnly(emailName)) return emailName;
    if (usercode && !isNumericOnly(usercode)) return usercode;
    return `User ${userKey(u) || ''}`.trim();
  };
  const userAvatar = (u) => {
    const raw =
      u?.profile_picture ||
      u?.profile_picture_url ||
      u?.profilePic ||
      u?.avatar ||
      u?.avatar_url ||
      u?.photo ||
      u?.image ||
      u?.user_profile?.profile_picture ||
      u?.profile?.profile_picture ||
      null;
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value) return null;
    if (/^data:image\//i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/media/')) return `${API_BASE_URL}${value}`;
    if (value.startsWith('media/')) return `${API_BASE_URL}/${value}`;
    if (value.startsWith('/')) return `${API_BASE_URL}${value}`;
    if (/^(profile_pictures|profilepics|uploads|user_photos)\//i.test(value)) {
      return `${API_BASE_URL}/media/${value}`;
    }
    return `${API_BASE_URL}/media/${value}`;
  };

  /* =================== DATA LOADERS =================== */
  const loadUsers = async () => {
    if (!isAuthenticated) return;
    try {
      const list = await fetchUsers();
      const arr = Array.isArray(list)
        ? list
        : Array.isArray(list?.results)
        ? list.results
        : Array.isArray(list?.data)
        ? list.data
        : [];

      const normalized = arr
        .map((u) => ({
          ...u,
          id: userKey(u),
        }))
        .filter((u) => !!u.id);

      setUsers(normalized.filter((u) => String(userKey(u)) !== String(selfId)));
    } catch (e) {
      console.warn('Failed to load users', e);
    }
  };

  const loadPresence = async () => {
    if (!isAuthenticated) return;
    try {
      await ChatBoxService.ping();
      const res = await ChatBoxService.presence();
      const map = {};
      for (const row of res.data?.presence || []) {
        map[row.userid] = !!row.online;
      }
      setOnlineMap(map);
    } catch (e) {
      console.warn('Presence error', e?.message || e);
    }
  };

  const loadHistory = async (u) => {
    if (!u) return;
    try {
      const res = await ChatBoxService.history(u.id, 200);
      const list = (res.data?.messages || []).map((m) => ({
        id: m.id,
        text: m.text,
        fileUrl: m.file_url || (m.file_path ? `${API_BASE_URL}/media/${m.file_path}` : null),
        fileName: m.file_name,
        file_mime: m.file_mime,
        delivered: !!m.delivered,
        seen: !!m.seen,
        senderName: m.sender_name,
        fileDelivered: !!m.file_delivered,
        fileDownloaded: !!m.file_downloaded,
        from: m.from_userid,
        time: m.createdat || m.created_at || m.time || null,
      }));
      setMessages((prev) => ({ ...prev, [u.id]: list }));
      const last = res.data?.messages?.[res.data.messages.length - 1];
      if (last) {
        setLastMessages((prev) => ({ ...prev, [u.id]: last }));
        latestSeenMessageRef.current[u.id] = last.id;
      }
      setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));
    } catch (e) {
      console.warn('History error', e?.message || e);
    }
  };

  const loadFiles = async (u) => {
    if (!u) return;
    try {
      const res = await ChatBoxService.files(u.id);
      const list = res.data?.files || [];
      setFilesTab((prev) => ({ ...prev, [u.id]: list }));
    } catch (e) {
      console.warn('Files error', e?.message || e);
    }
  };

  /* =================== EFFECTS =================== */
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    loadUsers();
    usersTimer.current = setInterval(loadUsers, 10000);
    return () => {
      if (usersTimer.current) clearInterval(usersTimer.current);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    loadPresence();
    presenceTimer.current = setInterval(loadPresence, 12000);
    return () => {
      if (presenceTimer.current) clearInterval(presenceTimer.current);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedUser || !isAuthenticated) return undefined;
    loadHistory(selectedUser);
    loadFiles(selectedUser);

    const tick = async () => {
      await loadHistory(selectedUser);
      await loadFiles(selectedUser);
    };
    historyTimer.current = setInterval(tick, 8000);
    return () => {
      if (historyTimer.current) clearInterval(historyTimer.current);
    };
  }, [selectedUser, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || users.length === 0) return undefined;

    let cancelled = false;
    const tick = async () => {
      const subset = users.slice(0, 40);
      const results = await Promise.all(
        subset.map(async (u) => {
          try {
            const r = await ChatBoxService.history(u.id, 200);
            const list = r?.data?.messages || [];
            const latest = list[list.length - 1];
            return { uid: u.id, latest };
          } catch {
            return { uid: u.id, latest: null };
          }
        })
      );

      if (cancelled) return;

      const previewMap = {};
      const unreadDelta = {};

      for (const row of results) {
        if (!row?.uid || !row.latest) continue;
        previewMap[row.uid] = row.latest;

        const prevId = latestSeenMessageRef.current[row.uid];
        if (!prevId) {
          latestSeenMessageRef.current[row.uid] = row.latest.id;
          continue;
        }

        if (row.latest.id !== prevId) {
          latestSeenMessageRef.current[row.uid] = row.latest.id;
          const isIncoming = row.latest.from_userid !== selfId;
          const isCurrentOpen = selectedUser?.id === row.uid;
          if (isIncoming && !isCurrentOpen) {
            unreadDelta[row.uid] = (unreadDelta[row.uid] || 0) + 1;
          }
        }
      }

      if (Object.keys(previewMap).length) {
        setLastMessages((prev) => ({ ...prev, ...previewMap }));
      }
      if (Object.keys(unreadDelta).length) {
        setUnreadCounts((prev) => {
          const next = { ...prev };
          for (const [uid, add] of Object.entries(unreadDelta)) {
            next[uid] = (next[uid] || 0) + add;
          }
          return next;
        });
      }
    };

    tick();
    latestUsersPollRef.current = setInterval(tick, 12000);
    return () => {
      cancelled = true;
      if (latestUsersPollRef.current) clearInterval(latestUsersPollRef.current);
    };
  }, [isAuthenticated, users, selectedUser, selfId]);

  useEffect(() => {
    if (!selectedUser) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedUser, messages]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let mounted = true;
    const loadPersistedPrefs = async () => {
      try {
        prefsHydratedRef.current = false;
        const savedAuto = localStorage.getItem(autoDownloadKey);
        if (mounted && savedAuto !== null) {
          setAutoDownload(savedAuto === '1');
        }

        const savedLabel = localStorage.getItem(folderLabelKey);
        if (mounted && savedLabel) {
          setDownloadDirLabel(savedLabel);
        }

        const handle = await getPrefHandle(folderHandleKey);
        if (mounted && handle) {
          setDownloadDirHandle(handle);
          if (!savedLabel) setDownloadDirLabel(handle.name || 'Selected');
        }
      } catch (e) {
        console.warn('Failed to restore download preferences', e?.message || e);
      } finally {
        if (mounted) prefsHydratedRef.current = true;
      }
    };

    loadPersistedPrefs();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!prefsHydratedRef.current) return;
    localStorage.setItem(autoDownloadKey, autoDownload ? '1' : '0');
  }, [isAuthenticated, autoDownload]);

  useEffect(() => {
    if (!selectedUser || !isAuthenticated) return;
    const markSeenNow = async () => {
      try {
        await ChatBoxService.markSeen(selectedUser.id);
        await loadHistory(selectedUser);
      } catch (e) {
        console.warn('Mark seen failed', e?.message || e);
      }
    };
    markSeenNow();
  }, [selectedUser, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !autoDownload || !downloadDirHandle) return undefined;

    let mounted = true;
    const checkPendingFiles = async () => {
      try {
        const res = await ChatBoxService.getPendingFiles();
        const files = Array.isArray(res.data) ? res.data : [];
        for (const row of files) {
          if (!mounted) return;
          await autoDownloadFileIfNeeded({
            id: row.id,
            fileUrl: row.file_url,
            fileName: row.file_name,
            senderName: row.sender_name,
          });
        }
      } catch (e) {
        console.warn('Pending file check failed', e?.message || e);
      }
    };

    checkPendingFiles();
    const id = setInterval(checkPendingFiles, 8000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isAuthenticated, autoDownload, downloadDirHandle]);

  /* =================== SEND / CLEAR =================== */
  const sendMessage = async () => {
    if (!selectedUser) return;
    if (!input.trim() && !file) return;
    setUploading(true);
    try {
      const res = await ChatBoxService.send(
        {
          to_userid: selectedUser.id,
          text: input.trim(),
          file,
        },
        () => {}
      );

      const m = res.data;
      const msg = {
        id: m.id,
        text: m.text,
        fileUrl: m.file_url || (m.file_path ? `${API_BASE_URL}/media/${m.file_path}` : null),
        fileName: m.file_name,
        file_mime: m.file_mime,
        delivered: !!m.delivered,
        seen: !!m.seen,
        senderName: m.sender_name,
        fileDelivered: !!m.file_delivered,
        fileDownloaded: !!m.file_downloaded,
        from: m.from_userid,
        time: m.createdat || m.created_at || m.time || null,
      };
      setMessages((prev) => {
        const list = prev[selectedUser.id] ? [...prev[selectedUser.id]] : [];
        return { ...prev, [selectedUser.id]: [...list, msg] };
      });
      if (m.file_path) {
        setFilesTab((prev) => {
          const list = prev[selectedUser.id] ? [...prev[selectedUser.id]] : [];
          return { ...prev, [selectedUser.id]: [m, ...list] };
        });
      }
      setLastMessages((prev) => ({ ...prev, [selectedUser.id]: m }));
      setInput('');
      setFile(null);
    } catch (e) {
      console.error('Send failed', e?.response?.data || e?.message || e);
      alert('Failed to send message');
    } finally {
      setUploading(false);
    }
  };

  const clearHistory = async (type = 'all') => {
    if (!selectedUser) return;
    try {
      await ChatBoxService.clear(selectedUser.id, type);
      if (type === 'all' || type === 'messages') {
        setMessages((prev) => ({ ...prev, [selectedUser.id]: [] }));
      }
      if (type === 'all' || type === 'files') {
        setFilesTab((prev) => ({ ...prev, [selectedUser.id]: [] }));
      }
    } catch (e) {
      console.warn('Clear failed', e?.message || e);
    }
  };

  /* =================== FILE DOWNLOAD HELPERS =================== */
  const chooseDownloadFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support choosing folders (Chromium browsers only).');
        return;
      }
      const handle = await window.showDirectoryPicker();
      setDownloadDirHandle(handle);
      setDownloadDirLabel(handle.name || 'Selected');
      await setPrefHandle(folderHandleKey, handle);
      localStorage.setItem(folderLabelKey, handle.name || 'Selected');
    } catch (e) {
      console.warn('Folder pick cancelled', e?.message || e);
    }
  };

  const ensureDirPermission = async () => {
    if (!downloadDirHandle) return false;
    if (downloadDirHandle.queryPermission) {
      const p = await downloadDirHandle.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') return true;
    }
    if (downloadDirHandle.requestPermission) {
      const p = await downloadDirHandle.requestPermission({ mode: 'readwrite' });
      return p === 'granted';
    }
    return false;
  };

  const downloadToFolder = async (fileUrl, fileName, senderName = 'General') => {
    try {
      if (!downloadDirHandle) return false;
      const allowed = await ensureDirPermission();
      if (!allowed) return false;
      const safeFolder = String(senderName || 'General').trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '_');
      const senderFolder = await downloadDirHandle.getDirectoryHandle(safeFolder || 'General', { create: true });
      const res = await fetch(fileUrl);
      if (!res.ok || !res.body) throw new Error('Download failed');
      const fileHandle = await senderFolder.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const blob = await res.blob();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      console.warn('Download error', e?.message || e);
      return false;
    }
  };

  const autoDownloadFileIfNeeded = async (msg) => {
    if (!msg?.id || !msg?.fileUrl || !msg?.fileName) return;
    if (!autoDownload || !downloadDirHandle) return;
    if (downloadedFilesRef.current[msg.id]) return;

    const fullUrl = msg.fileUrl.startsWith('http') ? msg.fileUrl : `${API_BASE_URL}${msg.fileUrl}`;
    const senderName = msg.senderName || formatName(selectedUser) || 'General';
    const ok = await downloadToFolder(fullUrl, msg.fileName, senderName);
    if (ok) {
      downloadedFilesRef.current[msg.id] = true;
      try {
        await ChatBoxService.markDownloaded(msg.id);
      } catch (e) {
        console.warn('Mark downloaded failed', e?.message || e);
      }
    }
  };

  const resolveFileUrl = (url) => (url?.startsWith('http') ? url : `${API_BASE_URL}${url || ''}`);

  const tryOpenInDefaultApp = (fullUrl, fileName) => {
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    const encoded = encodeURIComponent(fullUrl);
    const officeMap = {
      doc: `ms-word:ofe|u|${fullUrl}`,
      docx: `ms-word:ofe|u|${fullUrl}`,
      xls: `ms-excel:ofe|u|${fullUrl}`,
      xlsx: `ms-excel:ofe|u|${fullUrl}`,
      xlsm: `ms-excel:ofe|u|${fullUrl}`,
      csv: `ms-excel:ofe|u|${fullUrl}`,
      ppt: `ms-powerpoint:ofe|u|${fullUrl}`,
      pptx: `ms-powerpoint:ofe|u|${fullUrl}`,
      pdf: `microsoft-edge:${fullUrl}`,
      jpg: `microsoft-edge:${fullUrl}`,
      jpeg: `microsoft-edge:${fullUrl}`,
      png: `microsoft-edge:${fullUrl}`,
      gif: `microsoft-edge:${fullUrl}`,
      webp: `microsoft-edge:${fullUrl}`,
    };

    const appUrl = officeMap[ext];
    if (!appUrl) return false;
    try {
      window.open(appUrl, '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      try {
        window.open(`microsoft-edge:${decodeURIComponent(encoded)}`, '_blank', 'noopener,noreferrer');
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleOpenFile = (e, msg) => {
    e.preventDefault();
    if (!msg?.fileUrl) return;
    const fullUrl = resolveFileUrl(msg.fileUrl);
    const openedByProtocol = tryOpenInDefaultApp(fullUrl, msg.fileName);
    if (!openedByProtocol) {
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
    }
  };

  /* =================== DERIVED =================== */
  const formatLastTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const today = new Date();
      const isSameDay = d.toDateString() === today.toDateString();
      return isSameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const previewText = (lm) => {
    if (!lm) return '';
    if (lm.text) return lm.text;
    if (lm.file_name) return `[File] ${lm.file_name}`;
    return '';
  };

  const formatMessageTime = (msg) => {
    const raw = msg?.time || msg?.createdat || msg?.created_at;
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    let arr = users;
    if (q) {
      arr = users.filter((u) => (formatName(u) || '').toLowerCase().includes(q));
    }
    return [...arr].sort((a, b) => {
      const oa = onlineMap[userKey(a)] ? 1 : 0;
      const ob = onlineMap[userKey(b)] ? 1 : 0;
      if (oa !== ob) return ob - oa;

      const ua = unreadCounts[userKey(a)] ? 1 : 0;
      const ub = unreadCounts[userKey(b)] ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return formatName(a).localeCompare(formatName(b));
    });
  }, [users, userQuery, unreadCounts, onlineMap]);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((acc, v) => acc + (v || 0), 0),
    [unreadCounts]
  );

  const onlineCount = useMemo(
    () => users.reduce((acc, u) => acc + (onlineMap[userKey(u)] ? 1 : 0), 0),
    [users, onlineMap]
  );

  const toggleOpen = () => setIsOpen((s) => !s);

  /* =================== RENDER =================== */
  return (
    <div className="fixed top-0 right-0 h-screen flex z-50 pointer-events-none" aria-hidden={!isAuthenticated}>
      <div
        className={`
          relative h-screen bg-gray-800 text-white flex flex-col shadow-xl
          w-[20rem] sm:w-[22rem] rounded-l-xl overflow-hidden
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-[16rem] sm:translate-x-[18rem]'}
          pointer-events-auto
        `}
      >
        <div className="sticky top-0 bg-gray-900 text-white h-12 flex items-center justify-between pl-14 pr-3 border-b border-gray-700 z-10">
          <div className="font-semibold">Team Chat</div>
          {totalUnread > 0 && <div className="text-xs bg-red-500 px-2 py-0.5 rounded">{totalUnread} new</div>}
        </div>

        {!isOpen && (
          <div className="flex flex-col items-start pl-2 py-3 space-y-3 overflow-auto mt-12">
            {filteredUsers.map((u) => {
              const code = formatName(u);
              const uid = userKey(u);
              const avatar = userAvatar(u);
              return (
                <button
                  key={uid}
                  onClick={() => {
                    setSelectedUser(u);
                    setIsOpen(true);
                    setUnreadCounts((prev) => ({ ...prev, [uid]: 0 }));
                  }}
                  className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  aria-label={`Open chat with ${code}`}
                >
                  {avatar ? (
                    <img src={avatar} alt={code} className="w-10 h-10 rounded-full object-cover border border-gray-500" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-500 rounded-full flex items-center justify-center text-sm font-semibold">
                      {(code || 'U').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                      onlineMap[uid] ? 'bg-sky-400' : 'bg-gray-400'
                    }`}
                  />
                  {unreadCounts[uid] > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs flex items-center justify-center rounded-full">
                      {unreadCounts[uid]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {isOpen && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {!selectedUser && (
              <div className="flex-1 bg-gray-800 flex flex-col">
                <div className="p-2 bg-gray-900 flex items-center gap-2">
                  <h3 className="text-lg font-semibold flex-1">Users</h3>
                  <span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded">Online {onlineCount}</span>
                </div>

                <div className="p-2">
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search"
                    className="w-full text-black rounded px-2 py-1 text-sm"
                    aria-label="Search users"
                  />
                </div>

                <div className="flex-1 overflow-auto px-2 pb-2">
                  {filteredUsers.map((u) => {
                    const uid = userKey(u);
                    const code = formatName(u);
                    const avatar = userAvatar(u);
                    const isOnline = !!onlineMap[uid];
                    const hasUnread = (unreadCounts[uid] || 0) > 0;
                    return (
                      <button
                        key={uid}
                        onClick={() => {
                          setSelectedUser(u);
                          setUnreadCounts((prev) => ({ ...prev, [uid]: 0 }));
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded text-left transition ${
                          hasUnread ? 'bg-blue-900/50 border-l-4 border-blue-400' : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="relative">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={code}
                              className={`w-10 h-10 rounded-full object-cover border-2 ${
                                isOnline ? 'border-sky-400' : 'border-gray-500'
                              }`}
                            />
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                                isOnline ? 'bg-gray-600 border-2 border-sky-400' : 'bg-gray-500 border-2 border-gray-500'
                              }`}
                            >
                              {(code || 'U').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                              isOnline ? 'bg-sky-400' : 'bg-gray-500'
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`truncate ${
                              hasUnread
                                ? 'font-bold text-white'
                                : isOnline
                                ? 'text-sky-300 font-semibold'
                                : 'text-gray-400'
                            }`}
                          >
                            {code}
                          </div>
                        </div>
                        {hasUnread && (
                          <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {unreadCounts[uid]}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && <div className="text-gray-400 p-2">No users found.</div>}
                </div>

                <div className="p-3 border-t border-gray-700 bg-gray-900/70">
                  <div className="text-[11px] text-gray-300 mb-2">Default Save Folder</div>
                  <div className="border border-gray-500 rounded p-2 bg-gray-800 text-[12px] text-gray-100 truncate" title={downloadDirLabel}>
                    {downloadDirLabel || 'Not set'}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      onClick={chooseDownloadFolder}
                      className="text-xs px-2 py-1 rounded border border-white/70 hover:bg-white/10"
                      title="Select default save folder"
                    >
                      Select Folder
                    </button>
                    <label className="text-xs inline-flex items-center gap-1" title="Auto save received files">
                      <input
                        type="checkbox"
                        checked={autoDownload}
                        onChange={(e) => setAutoDownload(e.target.checked)}
                      />
                      Auto Save
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedUser && (
              <div className="flex-1 min-h-0 bg-gray-50 text-black flex flex-col">
                <div className="p-3 bg-gray-900 text-white flex items-center gap-3">
                  <button onClick={() => setSelectedUser(null)} className="text-xl" aria-label="Back to user list">
                    <FiChevronLeft />
                  </button>

                  {userAvatar(selectedUser) ? (
                    <img
                      src={userAvatar(selectedUser)}
                      alt={formatName(selectedUser)}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center font-semibold">
                      {formatName(selectedUser).slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="font-semibold text-lg flex-1 truncate">{formatName(selectedUser)}</div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-3 bg-gradient-to-b from-gray-100 to-gray-200">
                  {(messages[selectedUser.id] || []).map((msg) => {
                    const mine = msg.from === selfId;
                    return (
                      <div key={msg.id} className={`w-full flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`
                            relative inline-block w-fit
                            max-w-[94%] sm:max-w-[89%]
                            px-5 py-1
                            rounded-2xl shadow-sm
                            break-words break-all whitespace-pre-wrap
                            ${mine ? 'bg-blue-400 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md'}
                          `}
                        >
                          {msg.text}

                        

                          {msg.fileUrl && (
                            <a
                              href={resolveFileUrl(msg.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => handleOpenFile(e, msg)}
                              className={`block mt-2 text-xs underline ${mine ? 'text-white/90' : 'text-blue-600'}`}
                            >
                              📎 {msg.fileName || 'Attachment'}
                            </a>
                          )}

                          {mine && msg.fileUrl && (
                            <div className="text-[10px] mt-1 text-white/80">
                              {msg.fileDelivered ? '✓ Delivered' : 'Sending to receiver...'}
                            </div>
                          )}
                          {!mine && msg.fileUrl && msg.fileDownloaded && (
                            <div className="text-[10px] mt-1 text-green-600">Saved to folder</div>
                          )}

                          <div
                            className={`flex items-center justify-end gap-1 text-[11px] mt-1 ${
                              mine ? 'text-white/80' : 'text-gray-500'
                            }`}
                          >
                            <span>{formatMessageTime(msg)}</span>
                            {mine && (
                              <>
                                {!msg.delivered && <span className="text-gray-300">✓</span>}
                                {msg.delivered && !msg.seen && <span className="text-gray-300">✓✓</span>}
                                {msg.seen && (
                                  <>
                                    <span className="text-blue-800">✓✓</span>
                                    <span className="text-blue-900 font-bold">Seen</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="p-3 bg-white border-t flex items-center gap-2 relative">
                  <input
                    type="text"
                    className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-200"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    className="w-10 h-10 rounded-full border text-gray-700 hover:bg-gray-100 flex items-center justify-center"
                    title="Emoji"
                  >
                    <FiSmile />
                  </button>
                  {emojiOpen && (
                    <div className="absolute bottom-14 right-24 bg-white text-black rounded shadow p-2 w-40 grid grid-cols-6 gap-1 z-20 border">
                      {EMOJIS.map((em) => (
                        <button
                          key={em}
                          onClick={() => {
                            setInput((prev) => prev + em);
                            setEmojiOpen(false);
                          }}
                          className="hover:bg-gray-100 rounded text-lg"
                          type="button"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    id="chat-file-upload-bottom"
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <label
                    htmlFor="chat-file-upload-bottom"
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center cursor-pointer transition ${
                      file
                        ? 'border-orange-400 bg-orange-100 text-orange-600'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                    title={file ? `Attachment attached: ${file.name}` : 'Attach file'}
                  >
                    <FiPaperclip />
                  </label>
                  <button
                    onClick={sendMessage}
                    className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow flex items-center justify-center"
                    disabled={!input.trim() && !file}
                    title={uploading ? 'Sending...' : 'Send'}
                  >
                    <FiSend className={uploading ? 'animate-pulse' : ''} />
                  </button>
                </div>
                {file?.name && (
                  <div className="px-3 pb-2 text-xs text-orange-700 bg-white border-t border-orange-200">
                    Attachment attached: <span className="font-semibold">{file.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={toggleOpen}
          className="absolute top-0.5 left-1 w-[30px] h-[30px] rounded-full bg-gray-800 text-white hover:bg-gray-600 transition text-3xl flex items-center justify-center leading-none z-50"
          aria-pressed={isOpen}
          aria-label={isOpen ? 'Collapse chat' : 'Open chat'}
          title={isOpen ? 'Collapse chat' : 'Open chat'}
        >
          {isOpen ? '«' : '»'}
        </button>
      </div>
    </div>
  );
};

export default ChatBox;