import crypto from 'crypto';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

/**
 * OtpService abstraction (spec section 57).
 * sendOtp()/verifyOtp() are the only two methods callers use - swapping the
 * MOCK provider for a real SMS/WhatsApp provider (Twilio, MSG91, Gupshup...)
 * only requires changing deliverCode() below. Nothing else in the app
 * needs to change.
 */

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return String(crypto.randomInt(1000, 10000)); // 4-digit code
}

async function deliverCode(channel: string, code: string): Promise<void> {
  if (env.otp.provider === 'MOCK') {
    // Development-only: never do this in production. Real providers must
    // be called here instead (SMS/WhatsApp API) and must NEVER log the code.
    // eslint-disable-next-line no-console
    console.log(`[MOCK OTP] Sending code ${code} to ${channel}`);
    return;
  }
  // TODO: integrate a real provider using env.otp.apiKey / apiSecret / serviceId
  throw new AppError(`OTP provider "${env.otp.provider}" is not configured yet.`, 500);
}

export async function sendOtp(identifier: string): Promise<{ customerId: string; devCode?: string }> {
  const isEmail = identifier.includes('@');

  let customer = await prisma.customer.findFirst({
    where: isEmail ? { email: identifier } : { phone: identifier },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: isEmail ? { email: identifier } : { phone: identifier },
    });
  }

  const cooldownWindow = new Date(Date.now() - env.otp.resendCooldownSeconds * 1000);
  const recent = await prisma.otpCode.findFirst({
    where: { customerId: customer.id, createdAt: { gt: cooldownWindow } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    throw new AppError('Please wait before requesting another OTP.', 429);
  }

  const code = generateCode();
  await prisma.otpCode.create({
    data: {
      customerId: customer.id,
      codeHash: hashCode(code),
      channel: identifier,
      expiresAt: new Date(Date.now() + env.otp.ttlSeconds * 1000),
    },
  });

  await deliverCode(identifier, code);

  // devCode is only returned when running the mock provider, so local
  // development / this demo works without a real SMS account. A real
  // provider path never returns the code to the API response.
  return { customerId: customer.id, devCode: env.otp.provider === 'MOCK' ? code : undefined };
}

export async function verifyOtp(customerId: string, code: string): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { customerId, consumed: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) throw new AppError('OTP not found. Please request a new one.', 400);
  if (otp.expiresAt < new Date()) throw new AppError('OTP has expired. Please request a new OTP.', 400);
  if (otp.attempts >= env.otp.maxAttempts) throw new AppError('Too many incorrect attempts. Request a new OTP.', 429);

  if (hashCode(code) !== otp.codeHash) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError('Invalid OTP.', 400);
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });
}
