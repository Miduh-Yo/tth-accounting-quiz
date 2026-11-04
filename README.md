# TTH Accounting Quiz – Phiên bản 0.2

Có đăng nhập thật (JWT trong cookie httpOnly), phân quyền phía máy chủ (RBAC), quản lý tài khoản, khởi tạo Super Admin an toàn, Socket.io yêu cầu đăng nhập.

## Yêu cầu
- Node.js 20 trở lên, npm
- PostgreSQL 14+ (bắt buộc từ bản 0.2)

## Cài đặt lần đầu (Windows)
1. Tạo database rỗng, ví dụ `tth_quiz`.
2. Mở PowerShell tại thư mục `tth-accounting-quiz`, chạy `npm install`.
3. Sao chép `server/.env.example` thành `server/.env`, điền:
   - `DATABASE_URL` (mật khẩu PostgreSQL của bạn)
   - `JWT_SECRET` (>= 32 ký tự ngẫu nhiên; lệnh tạo có trong file mẫu)
4. Tạo bảng: `npm run db:migrate` (đặt tên migration, ví dụ `init`).
5. Tạo Super Admin: `npm run seed:super-admin -w server`.
   Nếu để trống `SEED_SUPER_ADMIN_PASSWORD`, mật khẩu tạm ngẫu nhiên được in ra **một lần**. Lệnh chỉ chạy khi chưa có Super Admin.
6. `npm run dev`, mở `http://localhost:5173`, đăng nhập và đổi mật khẩu tạm (bắt buộc).

API kiểm tra: `http://localhost:4000/api/health`.

## Phân quyền
| Vai trò | Quyền |
|---|---|
| SUPER_ADMIN | Tạo/khoá/đặt lại mật khẩu ADMIN và EMPLOYEE |
| ADMIN | Tạo/khoá/đặt lại mật khẩu EMPLOYEE |
| EMPLOYEE | Chỉ dùng chức năng của chính mình |

Mọi kiểm tra quyền thực hiện ở server (`server/src/auth.js`), không dựa vào giao diện.

## Bảo mật đã có
- Mật khẩu băm bcrypt (cost 12), yêu cầu >= 10 ký tự gồm hoa, thường, số.
- Cookie phiên `httpOnly`, `SameSite=Lax`; bật `COOKIE_SECURE=true` khi chạy HTTPS.
- Khoá tài khoản 15 phút sau 5 lần sai; giới hạn tần suất đăng nhập theo IP; thông báo lỗi chung, chống dò tài khoản.
- Khoá/đổi mật khẩu làm mất hiệu lực các phiên cũ (`tokenVersion`).
- `helmet`, giới hạn kích thước body, kiểm tra dữ liệu bằng `zod`.
- Không có tài khoản/mật khẩu mặc định trong mã nguồn.

## Chưa làm
- Ngân hàng câu hỏi, tài liệu/quy định, phòng thi, chấm điểm, báo cáo.
- Nhật ký kiểm toán (audit log), test tự động.
- Khi triển khai thật: chạy sau HTTPS/reverse proxy, đặt `trust proxy` cho Express để rate limit đúng IP.

## Logo
`client/src/assets/tth-logo.jpg`.
