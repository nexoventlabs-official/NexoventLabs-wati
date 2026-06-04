import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 30000 });

// Attach the admin JWT to /admin/* and /categories/* requests when present in
// localStorage so the rest of the app's calls remain unauthenticated.
api.interceptors.request.use((config) => {
  if (config.url && config.url.startsWith('/staff/')) {
    const token = localStorage.getItem('vanigan:staffToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  if (config.url && (config.url.startsWith('/admin/') || config.url.startsWith('/categories') || config.url.startsWith('/flows') || config.url.startsWith('/flow-images') || config.url.startsWith('/welcome') || config.url.startsWith('/campaigns'))) {
    const token = localStorage.getItem('vanigan:adminToken');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const Contacts = {
  list: (params) => api.get('/contacts', { params }).then((r) => r.data),
  create: (body) => api.post('/contacts', body).then((r) => r.data),
  get: (id) => api.get(`/contacts/${id}`).then((r) => r.data),
  update: (id, body) => api.patch(`/contacts/${id}`, body).then((r) => r.data),
  markRead: (id) => api.post(`/contacts/${id}/read`).then((r) => r.data),
  pin: (id, pinned) => api.post(`/contacts/${id}/pin`, { pinned }).then((r) => r.data),
  clearChat: (id) => api.delete(`/contacts/${id}/chat`).then((r) => r.data),
  remove: (id) => api.delete(`/contacts/${id}`).then((r) => r.data),
  addNote: (id, text) => api.post(`/contacts/${id}/notes`, { text }).then((r) => r.data),
  deleteNote: (id, noteId) => api.delete(`/contacts/${id}/notes/${noteId}`).then((r) => r.data),
};

export const Messages = {
  list: (contactId, params) => api.get(`/messages/${contactId}`, { params }).then((r) => r.data),
  sendText: (contactId, body) => api.post(`/messages/${contactId}/text`, body).then((r) => r.data),
  sendMedia: (contactId, body) => api.post(`/messages/${contactId}/media`, body).then((r) => r.data),
  sendReaction: (contactId, body) => api.post(`/messages/${contactId}/reaction`, body).then((r) => r.data),
  sendTemplate: (contactId, body) => api.post(`/messages/${contactId}/template`, body).then((r) => r.data),
  delete: (id) => api.delete(`/messages/${id}`).then((r) => r.data),
};

export const Templates = {
  list: () => api.get('/templates').then((r) => r.data),
  sync: () => api.post('/templates/sync').then((r) => r.data),
  create: (body) => api.post('/templates', body).then((r) => r.data),
  submit: (id) => api.post(`/templates/${id}/submit`).then((r) => r.data),
  refresh: (id) => api.post(`/templates/${id}/refresh`).then((r) => r.data),
  // Update only the per-button auto-reply texts. Local-only - does not touch Meta.
  // body: { replies: { "<button text>": "<reply text>", ... } }
  updateReplies: (id, replies) => api.patch(`/templates/${id}/replies`, { replies }).then((r) => r.data),
  delete: (id) => api.delete(`/templates/${id}`).then((r) => r.data),
};

export const Uploads = {
  // waId is optional - when provided, file is saved to Cloudinary under wati_panel/<waId>/
  upload: (file, waId, onProgress) => {
    const fd = new FormData();
    fd.append('file', file);
    if (waId) fd.append('waId', String(waId));
    return api.post('/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / (e.total || 1))),
    }).then((r) => r.data);
  },
};

// --- Admin API -------------------------------------------------------------
// All admin requests (except `login`) get a Bearer token attached by the
// interceptor above when `vanigan:adminToken` is set in localStorage.

// --- Categories API (admin-only) -------------------------------------------
// Promotable categories shown in the WhatsApp welcome menu. Each one can be
// mirrored to a Meta template for proactive broadcasts.
export const Categories = {
  list: () => api.get('/categories').then((r) => r.data),
  get: (id) => api.get(`/categories/${id}`).then((r) => r.data),
  create: (body) => api.post('/categories', body).then((r) => r.data),
  update: (id, body) => api.patch(`/categories/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/categories/${id}`).then((r) => r.data),
  sendTest: (id, waId) => api.post(`/categories/${id}/send-test`, { waId }).then((r) => r.data),
};

// --- WhatsApp Flow API (admin-only) ----------------------------------------
// Create / update / publish the category-picker flow on Meta.
export const Flows = {
  status: () => api.get('/flows/status').then((r) => r.data),
  publish: () => api.post('/flows/publish').then((r) => r.data),
};

// --- Flow Images API (admin-only) ------------------------------------------
// Welcome-flow header + banner image slots.
export const FlowImages = {
  list: () => api.get('/flow-images').then((r) => r.data),
  set: (key, url, publicId) => api.put(`/flow-images/${key}`, { url, publicId }).then((r) => r.data),
  remove: (key) => api.delete(`/flow-images/${key}`).then((r) => r.data),
};

// --- Welcome API (admin-only) ----------------------------------------------
export const Welcome = {
  get: () => api.get('/welcome').then((r) => r.data),
  update: (body) => api.patch('/welcome', body).then((r) => r.data),
  // slot = 'header' | 'banner'
  setImage: (slot, url, publicId) => api.put(`/welcome/image/${slot}`, { url, publicId }).then((r) => r.data),
  removeImage: (slot) => api.delete(`/welcome/image/${slot}`).then((r) => r.data),
  // Meta template (send welcome to brand-new users outside the 24h window).
  submitTemplate: () => api.post('/welcome/template/submit').then((r) => r.data),
  refreshTemplate: () => api.post('/welcome/template/refresh').then((r) => r.data),
  sendTemplate: (waId) => api.post('/welcome/template/send', { waId }).then((r) => r.data),
  // Follow-up (Interested / Not Interested) config.
  getFollowUp: () => api.get('/welcome/followup').then((r) => r.data),
  updateFollowUp: (body) => api.patch('/welcome/followup', body).then((r) => r.data),
};

// --- Campaigns API (admin-only) --------------------------------------------
// Add numbers (deduped) and send the approved welcome template to selected ones.
export const Campaigns = {
  list: () => api.get('/campaigns').then((r) => r.data),
  add: (body) => api.post('/campaigns', body).then((r) => r.data),
  remove: (id) => api.delete(`/campaigns/${id}`).then((r) => r.data),
  removeMany: (ids) => api.post('/campaigns/delete-many', { ids }).then((r) => r.data),
  send: (ids) => api.post('/campaigns/send', { ids }).then((r) => r.data),
};

export const Admin = {
  login: (username, password) =>
    api.post('/admin/login', { username, password }).then((r) => r.data),
  me: () => api.get('/admin/me').then((r) => r.data),
  getStaffCredentials: () => api.get('/admin/staff-credentials').then((r) => r.data),
  updateStaffCredentials: (body) => api.put('/admin/staff-credentials', body).then((r) => r.data),
  listContacts: (params) =>
    api.get('/admin/contacts', { params }).then((r) => r.data),
  getContact: (id) =>
    api.get(`/admin/contacts/${id}`).then((r) => r.data),
  // Returns a Blob - caller is responsible for triggering the download.
  reportUrl: ({ format = 'xlsx', preset = 'monthly', from, to }) => {
    const params = new URLSearchParams({ format, preset });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `${API_URL}/api/admin/report?${params.toString()}`;
  },
  downloadReport: async ({ format = 'xlsx', preset = 'monthly', from, to }) => {
    const params = { format, preset };
    if (from) params.from = from;
    if (to) params.to = to;
    const r = await api.get('/admin/report', { params, responseType: 'blob' });
    return r.data;
  },
};

export const Staff = {
  login: (mobile, password) =>
    api.post('/staff/login', { mobile, password }).then((r) => r.data),
  me: () => api.get('/staff/me').then((r) => r.data),
};

export default api;
