import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type EmployeeTokenPayload = {
  kind: 'employee';
  employeeId: string;
  role: string;
  branchId: string | null;
};

export type CustomerTokenPayload = {
  kind: 'customer';
  customerId: string;
};
export type QrOrderTokenPayload = {
  kind: 'qr_order';
  orderId: string;
};
export type TokenPayload =
  | EmployeeTokenPayload
  | CustomerTokenPayload
  | QrOrderTokenPayload;
export function signEmployeeToken(payload: Omit<EmployeeTokenPayload, 'kind'>): string {
  return jwt.sign({ kind: 'employee', ...payload }, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function signCustomerToken(payload: Omit<CustomerTokenPayload, 'kind'>): string {
  return jwt.sign({ kind: 'customer', ...payload }, env.jwtSecret, { expiresIn: env.customerJwtExpiresIn } as jwt.SignOptions);
}
export function signQrOrderToken(
  payload: Omit<QrOrderTokenPayload, 'kind'>
): string {
  return jwt.sign(
    { kind: 'qr_order', ...payload },
    env.jwtSecret,
    { expiresIn: '12h' }
  );
}
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}
