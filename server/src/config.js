import 'dotenv/config';

const secret = process.env.JWT_SECRET || '';
if (secret.length < 32) {
  console.error('Thiếu JWT_SECRET hoặc quá ngắn (cần >= 32 ký tự). Xem server/.env.example.');
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: secret,
  jwtExpiresHours: Number(process.env.JWT_EXPIRES_HOURS || 8),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieName: 'tth_session',
  maxFailedLogins: 5,
  lockMinutes: 15
};
