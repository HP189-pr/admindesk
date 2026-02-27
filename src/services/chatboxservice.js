import API from '../api/axiosInstance';

const ChatBoxService = {
  ping: () => API.post('/api/chat/ping/'),
  presence: () => API.get('/api/chat/presence/'),
  history: (userId, limit = 200) => API.get(`/api/chat/history/${userId}/`, { params: { limit } }),
  files: (userId) => API.get(`/api/chat/files/${userId}/`),
  getPendingFiles: () => API.get('/api/chat/pending-files/'),
  markDownloaded: (messageId) => API.post('/api/chat/mark-downloaded/', { message_id: messageId }),
  markSeen: (senderId) => API.post('/api/chat/mark-seen/', { sender_id: senderId }),
  clear: (userId, type = 'all') => API.post(`/api/chat/clear/${userId}/`, { type }),
  send: (payload, onUploadProgress) => {
    const form = new FormData();
    if (payload.to_userid) form.append('to_userid', payload.to_userid);
    if (payload.text) form.append('text', payload.text);
    if (payload.file) form.append('file', payload.file);
    return API.post('/api/chat/send/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
};

export default ChatBoxService;
