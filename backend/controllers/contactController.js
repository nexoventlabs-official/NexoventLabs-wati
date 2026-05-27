const Contact = require('../models/Contact');
const Message = require('../models/Message');
const { emit } = require('../services/socketService');
const { deleteFolder } = require('../config/cloudinary');

exports.listContacts = async (req, res) => {
  const { q, from, to } = req.query;
  const filter = {};
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { waId: re }, { profileName: re }];
  }
  if (from || to) {
    filter.lastMessageAt = {};
    if (from) filter.lastMessageAt.$gte = new Date(from);
    if (to) filter.lastMessageAt.$lte = new Date(to);
  }
  const contacts = await Contact.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(500);
  res.json(contacts);
};

exports.getContact = async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(contact);
};

exports.createContact = async (req, res) => {
  const { waId, name } = req.body;
  if (!waId) return res.status(400).json({ error: 'waId required' });
  const normalized = String(waId).replace(/\D/g, '');
  let contact = await Contact.findOne({ waId: normalized });
  if (!contact) contact = await Contact.create({ waId: normalized, name: name || '' });
  else if (name) { contact.name = name; await contact.save(); }
  emit('contact:upsert', contact);
  res.json(contact);
};

exports.updateContact = async (req, res) => {
  const { name, callStatus, comment } = req.body;
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  if (name !== undefined) contact.name = name;
  // When callStatus actually changes, append an entry to the audit log so
  // the admin panel + details panel can render a full history.
  if (callStatus !== undefined && callStatus !== contact.callStatus) {
    contact.callStatus = callStatus;
    contact.callStatusHistory.push({ status: callStatus });
  }
  if (comment !== undefined) contact.comment = comment;
  await contact.save();
  emit('contact:upsert', contact);
  res.json(contact);
};

// Append a new note to the contact's history. Each note carries its own
// createdAt timestamp so the frontend can render a full audit log.
exports.addNote = async (req, res) => {
  const { text } = req.body || {};
  const trimmed = String(text || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'text required' });
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  contact.notes.push({ text: trimmed });
  // Keep the legacy `comment` field in sync with the latest note so any
  // older UI that still reads it stays consistent.
  contact.comment = trimmed;
  await contact.save();
  emit('contact:upsert', contact);
  res.json(contact);
};

// Remove a note entry by its sub-document id. The legacy `comment` field is
// re-synced to whatever is now the most recent note (or cleared if none remain).
exports.deleteNote = async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  const before = contact.notes.length;
  contact.notes = contact.notes.filter(n => String(n._id) !== String(req.params.noteId));
  if (contact.notes.length === before) {
    return res.status(404).json({ error: 'Note not found' });
  }
  const latest = contact.notes[contact.notes.length - 1];
  contact.comment = latest ? latest.text : '';
  await contact.save();
  emit('contact:upsert', contact);
  res.json(contact);
};

exports.markRead = async (req, res) => {
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  contact.unreadCount = 0;
  await contact.save();
  emit('contact:upsert', contact);
  res.json({ ok: true });
};

// Wipe all messages for this contact and delete their Cloudinary folder.
// Keeps the contact record (waId, name, profileName) intact.
exports.clearChat = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Not found' });

    const del = await Message.deleteMany({ contact: contact._id });

    // Clear Cloudinary folder named by waId (best effort - never block response)
    deleteFolder(`wati_panel/${contact.waId}`).catch(e =>
      console.error('[clearChat] cloudinary folder delete failed', e.message)
    );

    // Reset derived fields and history on contact, but keep identity
    // (waId, name, profileName, profilePicUrl, source, referral).
    contact.lastMessageAt = null;
    contact.lastMessagePreview = '';
    contact.unreadCount = 0;
    contact.callStatus = 'none';
    contact.callStatusHistory = [];
    contact.notes = [];
    contact.comment = '';
    contact.welcomeSentAt = null;
    contact.lastCustomerMessageAt = null;
    await contact.save();

    emit('chat:cleared', { contactId: contact._id });
    emit('contact:upsert', contact);
    res.json({ ok: true, deletedMessages: del.deletedCount });
  } catch (e) {
    console.error('[clearChat]', e.message);
    res.status(500).json({ error: 'Failed', details: e.message });
  }
};
