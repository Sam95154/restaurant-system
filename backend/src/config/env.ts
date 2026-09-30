import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/restaurant_system',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  customerJwtExpiresIn: process.env.CUSTOMER_JWT_EXPIRES_IN || '12h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  otp: {
    provider: process.env.OTP_PROVIDER || 'MOCK',
    apiKey: process.env.OTP_API_KEY || '',
    apiSecret: process.env.OTP_API_SECRET || '',
    serviceId: process.env.OTP_SERVICE_ID || '',
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10),
  },
};
