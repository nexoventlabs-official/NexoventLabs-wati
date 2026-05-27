// One-shot cleanup: removes the empty `templateData` subdoc that Mongoose
// auto-created on every Message before we set `default: undefined`.
// Safe to re-run; only touches messages where templateData is empty/no-op.
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection('messages');

  // Pass 1: any non-template message with a templateData blob -> remove it.
  const r1 = await col.updateMany(
    { $and: [
      { $or: [{ templateName: '' }, { templateName: null }, { templateName: { $exists: false } }] },
      { templateData: { $exists: true } },
    ] },
    { $unset: { templateData: '' } }
  );
  console.log('[cleanup] removed templateData from non-template messages:', r1.modifiedCount);

  // Pass 2: template messages but the snapshot is effectively empty -> remove it.
  const r2 = await col.updateMany(
    { $and: [
      { templateData: { $exists: true } },
      { $or: [
        { 'templateData.header.type': 'NONE' },
        { 'templateData.header': { $exists: false } },
      ] },
      { $or: [{ 'templateData.body': '' }, { 'templateData.body': null }, { 'templateData.body': { $exists: false } }] },
      { $or: [{ 'templateData.footer': '' }, { 'templateData.footer': null }, { 'templateData.footer': { $exists: false } }] },
      { $or: [{ 'templateData.buttons': { $size: 0 } }, { 'templateData.buttons': { $exists: false } }] },
    ] },
    { $unset: { templateData: '' } }
  );
  console.log('[cleanup] removed empty templateData on template messages:', r2.modifiedCount);

  await mongoose.disconnect();
})();
