# TTH Accounting Quiz – Phiên bản 0.4

Có đăng nhập thật (JWT trong cookie httpOnly), phân quyền phía máy chủ (RBAC), quản lý tài khoản, khởi tạo Super Admin an toàn, Socket.io yêu cầu đăng nhập.

## Yêu cầu
- Node.js 20 trở lên, npm
- PostgreSQL 14+ (bắt buộc từ bản 0.2)

## Cài đặt lần đầu (Windows)
1. Tạo database rỗng, ví dụ `tth_quiz`, **bắt buộc mã hoá UTF8** (bản PostgreSQL cài trên Windows có thể mặc định WIN1252 → lỗi 500 khi lưu tiếng Việt):
   `CREATE DATABASE tth_quiz ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';`.
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

## Chức năng (0.4)
- **Ngân hàng câu hỏi** (ADMIN trở lên): chủ đề, loại (một/nhiều đáp án, Đúng/Sai), độ khó, giải thích, căn cứ. Không xoá cứng, chỉ "Lưu trữ".
- **Đề thi**: tạo từ câu hỏi "Đang dùng", mở/đóng thi. Nhân viên làm bài có đồng hồ, mỗi người một lượt/đề; server tự tính hạn nộp (+30 giây bù mạng) và chấm điểm; đáp án đúng chỉ lộ sau khi nộp.
- **Nhập câu hỏi từ CSV** (tối đa 500 câu/lần, có file mẫu): kiểm tra trước, chỉ nhập khi toàn bộ file hợp lệ; câu vào ở trạng thái Nháp. Nhận dấu phân cách `,` hoặc `;`.
- **Nhóm & giao đề**: ADMIN tạo nhóm nhân viên; khi tạo đề chọn "giao cho tất cả" hoặc một số nhóm. Server chỉ cho thấy/cho làm đề được giao (hoặc đề người đó đã có bài làm). Không xoá được nhóm đang được giao đề.
- **Báo cáo**: xem kết quả từng đề, tải CSV (an toàn với Excel, chống CSV injection).
- **Nhật ký hoạt động** (SUPER_ADMIN): đăng nhập, quản lý tài khoản/câu hỏi/đề thi, nộp bài, xuất báo cáo.
- Test tự động: `npm test -w server` (chấm điểm, CSV, nhập CSV). Test tích hợp với PostgreSQL thật (RBAC, giao đề theo nhóm, làm bài, chấm điểm, báo cáo, nhật ký) chạy khi đặt `TEST_DATABASE_URL` trỏ tới một database RỖNG dành riêng cho test (dữ liệu sẽ bị xoá) đã chạy `prisma migrate deploy`.
- Mỗi lần thêm bảng cần chạy `npm run db:migrate` (Render tự chạy khi deploy).

## Chưa làm
- Tài liệu/quy định gắn với câu hỏi.
- Phòng thi đồng bộ thời gian thực (Socket.io).
- Báo cáo tổng hợp theo chủ đề/nhân viên, nhập trực tiếp file .xlsx (hiện cần lưu thành CSV UTF-8).

## Logo
`client/src/assets/tth-logo.jpg`.
