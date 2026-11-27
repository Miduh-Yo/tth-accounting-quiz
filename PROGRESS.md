# PROGRESS – Tiến độ TTH Accounting Quiz

> Cập nhật cuối mỗi buổi làm việc. Mở file này trước khi làm tiếp (ở bất kỳ máy nào, kể cả điện thoại).
> Quy ước nhánh: `main` = bản Render đang chạy thật (tự triển khai khi push). Việc mới làm trên `dev`, kiểm tra xong mới gộp vào `main`.
> Không ghi mật khẩu, khóa API, dữ liệu thật vào file này.

**Cập nhật lần cuối:** 2026-11-27 (làm lại giao diện trên nhánh dev) · **Phiên bản phần mềm:** 0.11 (theo README)

## Đã xong (theo README 0.11)
- Đăng nhập JWT, phân quyền SUPER_ADMIN / ADMIN / EMPLOYEE ở máy chủ
- Ngân hàng câu hỏi, đề thi, nhóm & giao đề, chấm điểm tự động
- Phòng thi trực tiếp (Socket.io), cảnh báo rời tab
- Thư viện tài liệu & quy định, nhập câu hỏi từ Excel/CSV
- Sinh câu hỏi bằng AI (cần `ANTHROPIC_API_KEY` đặt trong Render Dashboard)
- Báo cáo kết quả, báo cáo tổng hợp theo chủ đề, nhật ký hoạt động
- Commit gần nhất trên `main`: script đệm số 0 cho tên đăng nhập dạng số (2026-11-27)

## Đã làm trên nhánh dev: làm lại giao diện (chưa gộp vào main)
- Hệ thống thiết kế: `client/src/styles/` (tokens.css, base.css, layout.css, components.css), font Inter tự host (@fontsource-variable/inter), chip trạng thái dùng chung ở `client/src/ui.jsx`
- Khung sidebar trái (gom nhóm Làm bài / Quản trị, theo vai trò), thanh trên + menu trượt cho điện thoại
- Đăng nhập / đổi mật khẩu: một thẻ căn giữa, bỏ phần quảng cáo
- Màn làm bài: thanh cố định (tên đề, tiến độ, đồng hồ đổi màu khi còn < 5 phút), đáp án dạng hàng chọn lớn, bảng số câu; màn kết quả có điểm lớn + đúng/sai từng câu
- Các màn quản trị: bảng có chip trạng thái, số căn phải, trạng thái trống; bỏ emoji
- Không đổi logic, API, server. Đã chụp thử 1440px và 390px (API giả), không tràn ngang; build sạch; `npm test -w server` 21/22 pass (1 test bỏ qua, cần DB)

## Đang dở
- Chưa chạy thử với dữ liệu và server thật; chưa thay `window.confirm/prompt` bằng hộp thoại xác nhận riêng; form soạn câu hỏi chưa chia nhóm trường

## Bước tiếp theo
- Chạy thử `npm run dev` với PostgreSQL thật, duyệt giao diện trên máy; sửa chi tiết rồi mới gộp dev vào main
- Hộp thoại xác nhận cho hành động nguy hiểm, toast thông báo, chia nhóm trường trong form câu hỏi/đề thi

## Chưa làm (theo README)
- Tải file tài liệu lên (hiện chỉ lưu liên kết; ổ đĩa Render gói free không bền)
- Phòng thi trực tiếp: chat, camera giám sát, nhiều instance máy chủ (Redis adapter)

## Lỗi đã biết
- (chưa có)

## Việc nhắc khi làm ở máy khác
1. `git pull` trước khi bắt đầu; `git push` khi xong.
2. Chạy thử: `npm install`, rồi `npm run dev` (cần PostgreSQL + `server/.env`, xem README).
3. Cuối buổi nhờ Claude: "Cập nhật PROGRESS.md rồi commit và push lên nhánh dev."
