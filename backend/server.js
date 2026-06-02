require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const { setIO } = require('./services/socketService');
const redis = require('./services/redisService');

const contactsRoutes = require('./routes/contacts');
const messagesRoutes = require('./routes/messages');
const templatesRoutes = require('./routes/templates');
const uploadRoutes = require('./routes/upload');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');
const categoriesRoutes = require('./routes/categories');
const flowsRoutes = require('./routes/flows');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (_, res) => res.json({ ok: true, service: 'wati-panel-backend' }));
app.get('/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api/webhook', webhookRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/flows', flowsRoutes);

// 404 & error
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, _next) => {
  console.error('[err]', err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// Socket.IO
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  path: '/socket.io',
});
setIO(io);

io.on('connection', (socket) => {
  socket.on('join', (room) => room && socket.join(room));
  socket.on('agent:typing', ({ contactId, typing }) => {
    // Relay to other agents
    socket.broadcast.emit('agent:typing', { contactId, typing });
  });
});

const PORT = process.env.PORT || 5000;

// Init Redis (non-blocking - app works without it, just no tiebreak ordering)
redis.init();

connectDB()
  .then(() => {
    server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('[db error]', err.message);
    // Still start the server so health endpoint works (helps debugging)
    server.listen(PORT, () => console.log(`[server] (no db) http://localhost:${PORT}`));
  });
