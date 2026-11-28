# PROGRESS – Tiến độ TTH Accounting Quiz

> Cập nhật cuối mỗi buổi làm việc. Mở file này trước khi làm tiếp (ở bất kỳ máy nào, kể cả điện thoại).
> Quy ước nhánh: `main` = bản Render đang chạy thật (tự triển khai khi push). Việc mới làm trên `dev`, kiểm tra xong mới gộp vào `main`.
> Không ghi mật khẩu, khóa API, dữ liệu thật vào file này.

**Cập nhật lần cuối:** 2026-11-28 (giao diện người chơi "Luyện mỗi ngày" trên nhánh dev) · **Phiên bản phần mềm:** 0.11 (theo README)

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
- Hộp thoại xác nhận/nhập liệu và toast riêng (`DialogProvider` trong `ui.jsx`) thay `window.confirm/prompt`; khoá tài khoản nay có xác nhận; mọi form (câu hỏi, đề thi, tài liệu, nhóm, tài khoản, nhập Excel, sinh AI) chia nhóm trường và có nhãn
- Admin: ở "Đề thi & nhóm" → Kết quả, mỗi nhân viên có nút "Xem bài làm" (câu đúng/sai, đáp án đã chọn, số lần rời màn hình)
- Không đổi logic, API, server. Đã chụp thử 1440px và 390px (API giả), không tràn ngang; build sạch; `npm test -w server` 21/22 pass (1 test bỏ qua, cần DB)

## Đang làm trên nhánh dev: "Luyện mỗi ngày" (chế độ mới, chạy song song với Bài kiểm tra)
Ý tưởng: mỗi ngày một đề chung cho cả công ty, hệ thống tự tạo; trả lời từng câu được chấm ngay (sẽ có pháo hoa ở giao diện); chuỗi ngày, XP, huy hiệu, xếp hạng, điểm danh ✓/✗. Chế độ thi cũ giữ nguyên.
- **Quyết định đã chốt:** đề chung toàn công ty; dùng toàn bộ câu "Đang dùng" trộn lẫn; có bảng xếp hạng (tuần/tháng); T7/CN không làm mất chuỗi; không bắt buộc, ai không chơi ngày làm việc thì đánh dấu ✗.
- **Backend xong (chưa có giao diện):** migration `0010_daily` (DailyDeck, DailySession, DailyAnswer, UserProgress, UserBadge, Holiday, DailySetting); `server/src/daily/` (dates, rules, deck, service); `server/src/routes/daily.js` gắn tại `/api/daily`.
  - Người chơi: `GET /today`, `POST /start`, `POST /sessions/:id/answer`, `GET /leaderboard?scope=week|month&groupId=`, `GET /calendar?month=`
  - Quản trị: `GET/PUT /settings`, `GET/POST/DELETE /holidays`, `POST /pin`, `GET /stats`, `GET /attendance?month=&groupId=` và `/attendance.csv`
  - Đề của ngày tự tạo ở lần đầu có người mở (không cần cron, hợp Render free); ngày tính theo giờ Việt Nam; đáp án đúng chỉ trả sau khi đã trả lời câu đó.
  - Chưa làm: khoá "đóng băng chuỗi" (không cần vì T7/CN đã không bắt buộc).
- Test: 68/68 qua (có 16 test đơn vị mới trong `test/daily.test.js` và 1 nhóm test tích hợp cuối `test/integration.test.js`, chạy trên PostgreSQL thật).
- Bản làm lại giao diện của tôi (nhánh `phase1-backup`, font Nunito, nút 3D) bị trùng với bản có sẵn nên bỏ; sẽ dùng hệ thống thiết kế có sẵn và thêm lớp "vui nhộn" riêng (`daily.css`) chỉ cho màn Luyện mỗi ngày.

- **Giao diện người chơi xong** (`client/src/daily/`, `client/src/styles/daily.css`, thêm mục "Hôm nay" vào sidebar, là trang mặc định): màn Hôm nay (chuỗi ngày, XP/cấp, tuần ✓/✗, xếp hạng tuần/tháng, huy hiệu, lịch tháng), màn chơi từng câu (chấm ngay, pháo hoa `canvas-confetti`, rung khi sai, combo, giải thích + căn cứ, đồng hồ gợi ý 10 phút không phạt, âm thanh tuỳ chọn mặc định tắt), màn kết quả (điểm, XP, huy hiệu mới, câu cần xem lại). Có linh vật "Sổ Cái" (SVG). Tôn trọng `prefers-reduced-motion`.
- Đã chạy thử với PostgreSQL tạm + server thật: đăng nhập nhân viên, làm bài đúng/sai, tiếp tục bài dở, xem kết quả, quay lại trang chủ; kiểm tra khung điện thoại 375px. Tìm và sửa 1 lỗi: tải lại phiên (409) trước đây không dựng lại màn chơi.
- Chưa làm: giao diện quản trị daily (cài đặt, ngày lễ, bảng điểm danh + CSV, kho còn đủ cho N ngày, ghim đề); nhắc làm bài kiểm tra được giao trên màn Hôm nay.

## Bước tiếp theo (Luyện mỗi ngày)
1. Giao diện quản trị: cài đặt, ngày lễ, bảng điểm danh + CSV, "kho còn đủ cho N ngày", ghim đề, danh sách "hôm nay chưa chơi".
2. Duyệt giao diện trên máy với dữ liệu thật; sửa chi tiết rồi gộp `dev` vào `main`. Render sẽ tự chạy migration `0010_daily`.
3. Chạy thử với nhóm nhỏ 1–2 tuần rồi mở cho toàn công ty.

## Đang dở
- Chưa chạy thử với dữ liệu và server thật (mới kiểm tra bằng API giả + ảnh chụp)

## Bước tiếp theo
- Chạy thử `npm run dev` với PostgreSQL thật, duyệt giao diện trên máy; sửa chi tiết rồi mới gộp dev vào main
- Đo tương phản màu và thao tác bàn phím bằng công cụ (hiện mới dựa vào CSS); duyệt giao diện trên máy với dữ liệu thật

## Chưa làm (theo README)
- Tải file tài liệu lên (hiện chỉ lưu liên kết; ổ đĩa Render gói free không bền)
- Phòng thi trực tiếp: chat, camera giám sát, nhiều instance máy chủ (Redis adapter)

## Lỗi đã biết
- (chưa có)

## Việc nhắc khi làm ở máy khác
1. `git pull` trước khi bắt đầu; `git push` khi xong.
2. Chạy thử: `npm install`, rồi `npm run dev` (cần PostgreSQL + `server/.env`, xem README).
3. Cuối buổi nhờ Claude: "Cập nhật PROGRESS.md rồi commit và push lên nhánh dev."
