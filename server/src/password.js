import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const passwordSchema = z.string()
  .min(10, 'Mật khẩu tối thiểu 10 ký tự')
  .max(72, 'Mật khẩu tối đa 72 ký tự')
  .regex(/[a-z]/, 'Cần có chữ thường')
  .regex(/[A-Z]/, 'Cần có chữ hoa')
  .regex(/[0-9]/, 'Cần có chữ số');

export const hashPassword = pw => bcrypt.hash(pw, 12);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
// Hash giả để thời gian phản hồi không lộ việc tài khoản có tồn tại hay không.
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
