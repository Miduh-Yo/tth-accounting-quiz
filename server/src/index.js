import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { prisma } from './db.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { questionsRouter } from './routes/questions.js';
import { examsRouter } from './routes/exams.js';
import { auditRouter } from './routes/audit.js';
import { attachRealtime } from './realtime.js';
import { groupsRouter } from './routes/groups.js';
import { reportsRouter } from './routes/reports.js';
import { documentsRouter } from './routes/documents.js';

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1); // sau reverse proxy của nền tảng đám mây
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TTH Accounting Quiz API', version: '0.8.0' });
});
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/exams', examsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/documents', documentsRouter);

// Production: phục vụ giao diện đã build cùng origin với API (cookie phiên hoạt động không cần CORS).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((_req, res) => res.status(404).json({ error: 'Không tìm thấy' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

// Socket.io chỉ nhận kết nối đã đăng nhập (dùng chung cookie phiên).
const io = new Server(httpServer, { cors: { origin: config.clientOrigin, credentials: true } });
io.use(async (socket, next) => {
  try {
    const token = cookie.parse(socket.handshake.headers.cookie || '')[config.cookieName];
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.v) throw new Error('unauthorized');
    socket.data.user = { id: user.id, role: user.role, fullName: user.fullName };
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
attachRealtime(io);
io.on('connection', socket => {
  socket.emit('system:connected', { message: 'Connected to TTH Quiz realtime service' });
});

httpServer.listen(config.port, () => {
  console.log(`TTH Quiz API listening on http://localhost:${config.port}`);
});
