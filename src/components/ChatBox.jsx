// src/components/ChatBox.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiChevronLeft,
  FiSend,
  FiPaperclip,
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
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const FRONTEND_PROXY_PORTS = new Set(['3000', '5173', '5174', '8081']);
const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const toWebSocketProtocol = (protocol) => {
  if (protocol === 'https:') return 'wss:';
  if (protocol === 'http:') return 'ws:';
  return protocol;
};

const addWsBaseCandidate = (acc, baseLike) => {
  try {
    const base = baseLike instanceof URL ? new URL(baseLike.toString()) : new URL(String(baseLike));
    const key = `${base.protocol}//${base.host}`;
    if (!acc.some((row) => row.key === key)) {
      acc.push({ key, base });
    }
  } catch {
    // Ignore invalid candidate values.
  }
};

const resolveChatWsBases = (fallbackOrigin) => {
  const candidates = [];
  const envWsBase = import.meta?.env?.VITE_WS_BASE_URL?.trim();

  if (typeof window !== 'undefined') {
    const page = new URL(window.location.href);
    if (LOCAL_HOSTS.has(page.hostname) && FRONTEND_PROXY_PORTS.has(page.port)) {
      // Local frontend ports often proxy to backend on 8001/8000. Add both
      // direct backend targets before trying the frontend origin.
      const local8001 = new URL(page.origin);
      local8001.port = '8001';
      addWsBaseCandidate(candidates, local8001);

      const local8000 = new URL(page.origin);
      local8000.port = '8000';
      addWsBaseCandidate(candidates, local8000);
    }
  }

  if (envWsBase) addWsBaseCandidate(candidates, envWsBase);
  addWsBaseCandidate(candidates, fallbackOrigin);

  if (typeof window !== 'undefined') {
    const page = new URL(window.location.href);
    if (LOCAL_HOSTS.has(page.hostname)) {
      addWsBaseCandidate(candidates, page.origin);
    }
  }

  return candidates.map((row) => row.base);
};

const toWsUrl = (base, tokenValue) => {
  const wsProto = toWebSocketProtocol(base.protocol);
  return `${wsProto}//${base.host}/ws/chat/?token=${encodeURIComponent(tokenValue)}`;
};

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
  const [isPageVisible, setIsPageVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );

  const usersTimer = useRef(null);
  const wsRef = useRef(null);
  const wsReconnectTimerRef = useRef(null);
  const wsPingTimerRef = useRef(null);
  const wsRetryAttemptRef = useRef(0);
  const selectedUserRef = useRef(null);
  const bottomRef = useRef(null);
  const downloadedFilesRef = useRef({});
  const prefsHydratedRef = useRef(false);
  const peerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const isOpen = typeof controlledIsOpen === 'boolean' ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (val) => {
    if (typeof onToggle === 'function') onToggle(val);
    else setInternalIsOpen(val);
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const userKey = (u) => u?.id || u?.userid || u?.user_id || u?.pk || u?.usercode;
  const preferenceUserId = useMemo(
    () => userKey(user) || decodeUserId() || 'common',
    [user, token]
  );
  const autoDownloadKey = `chat:auto:${preferenceUserId}`;
  const folderLabelKey = 'chat:folder-label:common';
  const folderHandleKey = 'chat:folder-handle:common';
  const isNumericOnly = (v) => /^\d+$/.test(String(v || '').trim());
  const isChatEnabled = (u) => {
    const raw = u?.shotchat ?? u?.chat_enabled;
    if (raw === undefined || raw === null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    const value = String(raw).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(value);
  };
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
  const getInitials = (name) => {
    const safeName = String(name || '').trim();
    if (!safeName) return 'U';

    const words = safeName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
    }

    const single = words[0] || '';
    return single.slice(0, 2).toUpperCase() || 'U';
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
        .filter((u) => !!u.id)
        .filter((u) => isChatEnabled(u));

      setUsers(normalized.filter((u) => String(userKey(u)) !== String(selfId)));
    } catch (e) {
      console.warn('Failed to load users', e);
    }
  };

  const normalizeMessage = (m) => ({
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
    to: m.to_userid,
    time: m.createdat || m.created_at || m.time || null,
  });

  const getWsUrls = () => {
    try {
      const tokenValue = token || localStorage.getItem('access_token');
      if (!tokenValue) return [];
      const bases = resolveChatWsBases(API_BASE_URL);
      return bases.map((base) => toWsUrl(base, tokenValue));
    } catch {
      return [];
    }
  };

  const loadHistory = async (u) => {
    if (!u) return;
    try {
      const res = await ChatBoxService.history(u.id, 200);
      const list = (res.data?.messages || []).map((m) => normalizeMessage(m));
      setMessages((prev) => ({ ...prev, [u.id]: list }));
      const last = res.data?.messages?.[res.data.messages.length - 1];
      if (last) {
        setLastMessages((prev) => ({ ...prev, [u.id]: last }));
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
    const intervalMs = isPageVisible ? 60000 : 180000;
    usersTimer.current = setInterval(loadUsers, intervalMs);
    return () => {
      if (usersTimer.current) clearInterval(usersTimer.current);
    };
  }, [isAuthenticated, isPageVisible]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser || !isAuthenticated) return undefined;
    if (!isPageVisible && !isOpen) return undefined;
    loadHistory(selectedUser);
    loadFiles(selectedUser);
    return undefined;
  }, [selectedUser, isAuthenticated, isPageVisible, isOpen]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const socketUrls = getWsUrls();
    if (!socketUrls.length) return undefined;

    let closedByCleanup = false;

    const applyMessageStatus = (withUserId, messageIds, mutate) => {
      if (!withUserId || !Array.isArray(messageIds) || messageIds.length === 0) return;
      setMessages((prev) => {
        const key = String(withUserId);
        const list = (prev[key] || []).map((msg) => (messageIds.includes(msg.id) ? mutate(msg) : msg));
        if (!prev[key]) return prev;
        return { ...prev, [key]: list };
      });
    };

    const onSocketMessage = async (event) => {
      let packet;
      try {
        packet = JSON.parse(event.data || '{}');
      } catch {
        return;
      }

      const eventType = packet?.event;
      const data = packet?.data || {};

      if (eventType === 'presence_snapshot') {
        const map = {};
        for (const row of data?.presence || []) {
          map[row.userid] = !!row.online;
        }
        setOnlineMap((prev) => ({ ...prev, ...map }));
        return;
      }

      if (eventType === 'presence_update') {
        if (typeof data.userid !== 'undefined') {
          setOnlineMap((prev) => ({ ...prev, [data.userid]: !!data.online }));
        }
        return;
      }

      if (eventType === 'webrtc_offer' && data?.offer) {
        const fromUserId = data.from || data.from_userid || data.userid || data.sender;
        if (!fromUserId) return;

        if (peerRef.current) {
          try {
            peerRef.current.close();
          } catch {
            // Ignore close errors while replacing the peer connection.
          }
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerRef.current = pc;

        pc.ontrack = (trackEvent) => {
          if (remoteVideoRef.current) {
            const stream = trackEvent.streams?.[0] || null;
            if (stream) remoteVideoRef.current.srcObject = stream;
          }
        };

        pc.onicecandidate = (candidateEvent) => {
          if (candidateEvent.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                event: 'webrtc_ice',
                to: fromUserId,
                from: selfId,
                candidate: candidateEvent.candidate,
              })
            );
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              event: 'webrtc_answer',
              to: fromUserId,
              from: selfId,
              answer,
            })
          );
        }
        return;
      }

      if (eventType === 'webrtc_answer' && data?.answer) {
        if (peerRef.current) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        return;
      }

      if (eventType === 'webrtc_ice' && data?.candidate) {
        if (peerRef.current) {
          try {
            await peerRef.current.addIceCandidate(data.candidate);
          } catch (err) {
            console.warn('ICE error', err);
          }
        }
        return;
      }

      if (eventType === 'new_message' && data?.id) {
        const normalized = normalizeMessage(data);
        const partnerId = String(normalized.from) === String(selfId) ? normalized.to : normalized.from;
        setMessages((prev) => {
          const key = String(partnerId);
          const existing = prev[key] || [];
          if (existing.some((row) => row.id === normalized.id)) return prev;
          return { ...prev, [key]: [...existing, normalized] };
        });
        setLastMessages((prev) => ({ ...prev, [partnerId]: data }));

        const selectedPartner = selectedUserRef.current?.id;
        const incoming = String(normalized.from) !== String(selfId);
        if (incoming && String(selectedPartner) !== String(partnerId)) {
          setUnreadCounts((prev) => ({ ...prev, [partnerId]: (prev[partnerId] || 0) + 1 }));
        }

        if (incoming && String(selectedPartner) === String(partnerId)) {
          try {
            await ChatBoxService.markSeen(partnerId);
          } catch (e) {
            console.warn('Auto mark seen failed', e?.message || e);
          }
        }

        if (normalized.fileUrl) {
          await autoDownloadFileIfNeeded({
            id: normalized.id,
            fileUrl: normalized.fileUrl,
            fileName: normalized.fileName,
            senderName: normalized.senderName,
          });
        }
        return;
      }

      if (eventType === 'message_delivered') {
        applyMessageStatus(data.with_userid, data.message_ids, (msg) => ({ ...msg, delivered: true }));
        return;
      }

      if (eventType === 'message_seen') {
        applyMessageStatus(data.with_userid, data.message_ids, (msg) => ({ ...msg, delivered: true, seen: true }));
        return;
      }

      if (eventType === 'file_downloaded' && data.with_userid && data.message_id) {
        applyMessageStatus(data.with_userid, [data.message_id], (msg) => ({
          ...msg,
          fileDelivered: true,
          fileDownloaded: true,
        }));
      }
    };

    const connect = () => {
      if (wsRef.current && [WebSocket.CONNECTING, WebSocket.OPEN].includes(wsRef.current.readyState)) {
        return;
      }
      const candidateIndex = Math.min(wsRetryAttemptRef.current, socketUrls.length - 1);
      const socketUrl = socketUrls[candidateIndex];
      const ws = new WebSocket(socketUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsRetryAttemptRef.current = 0;
        if (wsReconnectTimerRef.current) {
          clearTimeout(wsReconnectTimerRef.current);
          wsReconnectTimerRef.current = null;
        }
        if (wsPingTimerRef.current) clearInterval(wsPingTimerRef.current);
        wsPingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = onSocketMessage;

      ws.onclose = () => {
        if (wsPingTimerRef.current) {
          clearInterval(wsPingTimerRef.current);
          wsPingTimerRef.current = null;
        }
        if (!closedByCleanup) {
          if (ws.code === 4401) {
            return;
          }
          const attempt = wsRetryAttemptRef.current;
          const fallbackAttempts = Math.max(0, socketUrls.length - 1);
          const exploringFallbacks = attempt < fallbackAttempts;
          const backoffAttempt = Math.max(0, attempt - fallbackAttempts);
          const delayMs = exploringFallbacks ? 400 : Math.min(30000, 3000 * Math.pow(2, backoffAttempt));
          wsRetryAttemptRef.current = attempt + 1;
          wsReconnectTimerRef.current = setTimeout(connect, delayMs);
        }
      };
    };

    const initialConnectDelayMs = import.meta.env.DEV ? 120 : 0;
    wsReconnectTimerRef.current = setTimeout(connect, initialConnectDelayMs);

    return () => {
      closedByCleanup = true;
      if (wsPingTimerRef.current) {
        clearInterval(wsPingTimerRef.current);
        wsPingTimerRef.current = null;
      }
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
      if (peerRef.current) {
        try {
          peerRef.current.close();
        } catch {
          // Ignore close errors during cleanup.
        }
        peerRef.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      wsRetryAttemptRef.current = 0;
    };
  }, [isAuthenticated, token, selfId]);

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
        const savedAuto = await getPrefHandle(autoDownloadKey);
        if (mounted && typeof savedAuto === 'boolean') {
          setAutoDownload(savedAuto);
        }

        if (savedAuto === null) {
          const legacyAuto = localStorage.getItem('chat:auto:common');
          if (legacyAuto !== null) {
            const migrated = legacyAuto === '1';
            if (mounted) setAutoDownload(migrated);
            await setPrefHandle(autoDownloadKey, migrated);
          } else if (mounted) {
            setAutoDownload(false);
          }
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
  }, [isAuthenticated, autoDownloadKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!prefsHydratedRef.current) return;
    const persistAutoDownload = async () => {
      try {
        await setPrefHandle(autoDownloadKey, !!autoDownload);
      } catch (e) {
        console.warn('Failed to persist auto-save preference', e?.message || e);
      }
    };
    persistAutoDownload();
  }, [isAuthenticated, autoDownload, autoDownloadKey]);

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
    return () => {
      mounted = false;
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
      const msg = normalizeMessage(m);
      setMessages((prev) => {
        const list = prev[selectedUser.id] ? [...prev[selectedUser.id]] : [];
        if (list.some((row) => row.id === msg.id)) return prev;
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

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.close();
      } catch {
        // Ignore close errors during manual stop.
      }
      peerRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const startScreenShare = async () => {
    if (!selectedUser) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }

    try {
      stopScreenShare();

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      screenStreamRef.current = stream;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              event: 'webrtc_ice',
              to: selectedUser.id,
              from: selfId,
              candidate: event.candidate,
            })
          );
        }
      };

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            event: 'webrtc_offer',
            to: selectedUser.id,
            from: selfId,
            offer,
          })
        );
      }
    } catch (err) {
      console.error('Screen share failed', err);
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
                      {getInitials(code)}
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
                              {getInitials(code)}
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
                  <button
                    onClick={() => {
                      stopScreenShare();
                      setSelectedUser(null);
                    }}
                    className="text-xl"
                    aria-label="Back to user list"
                  >
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
                      {getInitials(formatName(selectedUser))}
                    </div>
                  )}

                  <div className="font-semibold text-lg flex-1 truncate">{formatName(selectedUser)}</div>
                </div>

                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-[300px] bg-black rounded mb-2"
                />

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
                  <button
                    onClick={startScreenShare}
                    className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center"
                    title="Share Screen"
                    type="button"
                  >
                    {'\u{1F5A5}'}
                  </button>
                  <button
                    onClick={stopScreenShare}
                    className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center"
                    title="Stop Sharing"
                    type="button"
                  >
                    ■
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