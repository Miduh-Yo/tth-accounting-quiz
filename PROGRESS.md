# PROGRESS – Tiến độ TTH Accounting Quiz

> Cập nhật cuối mỗi buổi làm việc. Mở file này trước khi làm tiếp (ở bất kỳ máy nào, kể cả điện thoại).
> Quy ước nhánh: `main` = bản Render đang chạy thật (tự triển khai khi push). Việc mới làm trên `dev`, kiểm tra xong mới gộp vào `main`.
> Không ghi mật khẩu, khóa API, dữ liệu thật vào file này.

**Cập nhật lần cuối:** 2026-11-27 · **Phiên bản phần mềm:** 0.11 (theo README)

## Đã xong (theo README 0.11)
- Đăng nhập JWT, phân quyền SUPER_ADMIN / ADMIN / EMPLOYEE ở máy chủ
- Ngân hàng câu hỏi, đề thi, nhóm & giao đề, chấm điểm tự động
- Phòng thi trực tiếp (Socket.io), cảnh báo rời tab
- Thư viện tài liệu & quy định, nhập câu hỏi từ Excel/CSV
- Sinh câu hỏi bằng AI (cần `ANTHROPIC_API_KEY` đặt trong Render Dashboard)
- Báo cáo kết quả, báo cáo tổng hợp theo chủ đề, nhật ký hoạt động
- Commit gần nhất trên `main`: script đệm số 0 cho tên đăng nhập dạng số (2026-11-27)

## Đang dở
- (chưa có – ghi vào đây việc làm dở cuối buổi)

## Bước tiếp theo
- (chưa có)

## Chưa làm (theo README)
- Tải file tài liệu lên (hiện chỉ lưu liên kết; ổ đĩa Render gói free không bền)
- Phòng thi trực tiếp: chat, camera giám sát, nhiều instance máy chủ (Redis adapter)

## Lỗi đã biết
- (chưa có)

## Việc nhắc khi làm ở máy khác
1. `git pull` trước khi bắt đầu; `git push` khi xong.
2. Chạy thử: `npm install`, rồi `npm run dev` (cần PostgreSQL + `server/.env`, xem README).
3. Cuối buổi nhờ Claude: "Cập nhật PROGRESS.md rồi commit và push lên nhánh dev."
