# QLCV — Kế hoạch xử lý các Bug (Remediation Plan)

Tài liệu này đề xuất giải pháp kỹ thuật cụ thể cho từng phát hiện trong `CODE_AUDIT_REPORT.md`
(1 Critical · 9 High · ~20 Medium · ~10 Low). Chưa có code nào được sửa — đây là bản kế hoạch để duyệt trước khi triển khai.

Quy ước cột:
- **Mã**: mã finding trong báo cáo
- **Độ khó**: S (nhỏ, <0.5 ngày) / M (vừa, 0.5–2 ngày) / L (lớn, 2–5 ngày)
- **Rủi ro khi sửa**: tác động phụ có thể xảy ra

---

## PHASE 0 — Xử lý khẩn cấp (làm trước khi deploy tiếp theo)

> **⚠ QUYẾT ĐỊNH CỦA CHỦ DỰ ÁN (ghi nhận 2025): GIỮ NGUYÊN demo** — tài khoản mẫu, nút "Tài khoản thử nghiệm nhanh" trên trang đăng nhập và route `/api/seed` **được giữ lại có chủ đích để chạy test**. Các mục H1 (chuỗi demo/seed) dưới đây **tạm hoãn, không triển khai** cho tới khi có yêu cầu mới. Lưu ý vận hành còn lại: nếu môi trường production nào đó được seed và **công khai ra internet** thì tài khoản `admin@example.com/admin123` là rủi ro chiếm quyền admin — cần cân nhắc đổi mật khẩu riêng cho môi trường đó.

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H1 | ⏸ **TẠM HOÃN (giữ demo để chạy test)** — không chặn `/api/seed`, không xóa tài khoản mẫu. Chỉ áp dụng khi project chuyển sang production công khai. | `app/api/seed/route.ts` | S |
| H2 | **Fail-fast `DATABASE_URL`**: production thiếu biến → `throw` lúc khởi tạo Prisma, không fallback về DB localhost; giữ fallback chỉ khi `NODE_ENV !== "production"`. Kiểm tra biến đã được cấu hình đúng trên Vercel (Supabase pooler `6543?pgboiler=true` dùng cho runtime OK, nhưng DDL qua pooler không ổn định — xem C1). | `lib/prisma.ts` | S |
| H3 | **Fail-fast `JWT_SECRET`**: production thiếu → `throw` khi gọi `getJwtSecretString/Bytes` (hoặc validate lúc khởi động). Bỏ nhánh ephemeral ở production. Ghi chú vận hành: sau khi đặt JWT_SECRET, toàn bộ phiên cũ hết hạn — người dùng phải đăng nhập lại 1 lần. | `lib/jwt-secret.ts` | S |
| H1 (UI) | ⏸ **TẠM HOÃN (giữ demo để chạy test)** — giữ nút "Tài khoản thử nghiệm nhanh" trên trang đăng nhập. | `app/login/page.tsx` | S |

**Kiểm thử Phase 0**: gọi `/api/seed` ở production → 404; login admin thật vẫn OK; khởi động server thiếu env → lỗi rõ ràng thay vì warning.

---

## PHASE 1 — Schema lifecycle: migrations thay cho `db push` + raw DDL

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| C1 | 1) Tạo **baseline migration** từ schema hiện tại: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql` (kiểm thử trên DB dev, rồi commit). 2) Đổi script build: `"build": "prisma generate && prisma migrate deploy && next build"`. 3) Giữ `db push` chỉ cho dev local (`db:push`), **không** trong build/deploy. 4) Lưu ý Supabase: cấu hình thêm `DIRECT_URL` (direct connection) để `migrate deploy` chạy qua kết nối trực tiếp, tránh transaction-pooler. | `package.json`, `prisma/migrations/` | M |
| M7 | **Gỡ toàn bộ runtime DDL** `ensureStandardTaskSchema`/`ensureTaskTypeColumn` trong `lib/prisma.ts` (khoảng 90 dòng SQL thủ công) và **~10 lời gọi** từ route/dashboard (đã có migration đảm nhiệm). Nếu muốn an toàn cho môi trường cũ chưa migrate: chạy 1 lần qua script CLI, không chạy từ request handler. | `lib/prisma.ts`, `app/dashboard/page.tsx`, `app/api/**` (tasks, job-positions, job-task-groups, standard-tasks, standard-tasks/seed, work-summary) | M |

**Rủi ro**: migration baseline phải khớp 100% schema hiện tại (kể cả enum đã tạo bằng tay) — nếu không, `migrate deploy` lỗi. **Bắt buộc**: chạy thử trên bản sao DB trước.

---

## PHASE 2 — Chính sách timezone (sửa tận gốc nhóm bug giờ/ngày)

Chọn một quy ước duy nhất: **deadline lưu UTC instant; mọi diễn giải theo múi giờ doanh nghiệp `Asia/Ho_Chi_Minh`** (có thể đưa vào env `APP_TIMEZONE`, mặc định HCM).

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H7 | Tạo **helper thời gian tập trung** (ví dụ `lib/datetime.ts`): `parseDeadlineInput(value)` — chấp nhận (a) ISO có offset, (b) chuỗi naive `YYYY-MM-DDTHH:mm` → coi là giờ APP_TIMEZONE rồi chuyển UTC; `formatLocal(value)` dùng `Intl.DateTimeFormat` với `timeZone: APP_TIMEZONE`. | thêm `lib/datetime.ts`; dùng ở `lib/utils.ts`, `lib/notification-engine.ts`, `app/api/**` | M |
| H7 (client) | **Bỏ mọi `toISOString().slice(0,16)` khi điền datetime-local** ở form sửa/tạo: điền bằng thành phần giờ địa phương (`getFullYear/getMonth/getDate/getHours/getMinutes`). Gửi lên API dạng có quy ước (naive theo APP_TIMEZONE hoặc kèm offset). | `app/tasks/page.tsx` (~L306/333/374), `app/calendar/page.tsx` (~L290-315) | M |
| H7 | "Hôm nay"/"Quá hạn"/"Cận hạn" trong engine & work-summary & dashboard: tính ranh giới ngày theo APP_TIMEZONE (đổi UTC instant → ngày VN). | `lib/notification-engine.ts`, `app/api/tasks/work-summary/route.ts` | M |
| M16 | Bộ lọc ngày ở reports + `month` ở evaluation: dựng biên ngày địa phương nhất quán (`startOfDay`/`endOfDay` theo APP_TIMEZONE), validate `month` sai → 400 (không im lặng bỏ qua, không biến `2025-13` thành 2026-01). | `app/reports/page.tsx`, `app/api/reports/evaluation/route.ts` | S |
| L2 (calendar) | "Hôm nay" highlight, tiêu đề ngày của modal: dùng khóa ngày địa phương thay vì `toISOString()`; đổi ngày khởi tạo mặc định `new Date(2026,7,23)` → `new Date()`. | `app/calendar/page.tsx` | S |

**Lưu ý nghiệp vụ**: nếu deadline người dùng nhập **cố ý** là giờ địa phương VN (không theo máy người nhập), cần xác nhận lại với người dùng trước khi áp — đây là thay đổi hành vi hiển thị.

---

## PHASE 3 — Evaluation & quy tắc task (điểm số phải đúng trước khi tin số liệu)

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H4 | **Chốt lại công thức đánh giá** (xác nhận nghiệp vụ trước): đề xuất — chỉ đưa task `COMPLETED` vào S_tb; **bỏ fallback `assignedScore`** khi chưa hoàn thành; task không gắn standard-task (completedScore null) thì loại khỏi S_tb nhưng vẫn đếm KPI nếu có; xác định ngữ nghĩa rõ của volume `0` vs `null`. | `lib/evaluation.ts`, `app/api/reports/evaluation/route.ts` | M |
| M13 | Quyết định: **áp thật `JobTaskGroup.weight`** theo nhóm (nếu spec yêu cầu điểm nhóm × trọng số) **hoặc** bỏ nhãn "weightedAverageScore"/ghi chú sai. Không để weight là dữ liệu chết mà output vẫn tự nhận "theo trọng số". | `lib/evaluation.ts`, route eval/export | M (cần xác nhận spec) |
| H5 | **Đóng băng task sau khi hoàn thành/chấm điểm**: (a) FSM trạng thái server-side — danh sách chuyển hợp lệ (vd TODO→IN_PROGRESS→COMPLETED; COMPLETED không được mở lại bởi USER); (b) task có `kpiEvaluatedAt != null` chỉ ADMIN mở lại được và phải ghi history; (c) bắt buộc nhập `result`/volume khi chuyển COMPLETED. | `app/api/tasks/[id]/route.ts` | M |
| M3 | Chuẩn hóa nhập liệu điểm/khối lượng: từ chối số âm/NaN/Infinity; quyết định completionRate >100% có hợp lệ (hoàn thành vượt) hay cần clamp; bỏ quy tắc `0/0 = 100%` (thay bằng null); volume đặt null → xóa luôn score snapshot cũ (không để sót). | `lib/standard-task.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts` | S |
| M2 | **Validation tập trung + không lộ lỗi**: thêm bộ validate (có thể dùng `zod` — dep mới, hoặc helper tự viết) cho enum `TaskStatus/Priority/TaskType/ComplexityLevel`, id tham chiếu (assignee/position/group/standardTask tồn tại), kiểu số. Đổi toàn bộ `catch` trả `error.message` → log server + message chung (danh sách ~8 route ở báo cáo M2). | các route `app/api/tasks/**`, `users/route.ts`, `standard-tasks/seed/route.ts`, `reports/evaluation/route.ts`, `work-summary/route.ts` | M |

**Rủi ro**: đổi công thức đánh giá ảnh hưởng trực tiếp kết quả xếp loại nhân viên — **phải chốt spec với người duyệt trước**, kèm bộ test so sánh kết quả cũ/mới trên dữ liệu thật.

---

## PHASE 4 — API & dữ liệu: race, giới hạn, import, notification

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H8 | **Bỏ check-then-create cho `Task.code`**: sinh code phía server an toàn (đếm `max` hiện có + retry tối đa 3 lần khi gặp P2002, hoặc code timestamp gọn). Import: tạo theo **chunk** (500 dòng) + `skipDuplicates` cho code trùng + gom lỗi từng dòng vào response. | `app/api/tasks/route.ts`, `app/api/tasks/import/route.ts` | M |
| H8/M11 | **Đảo thứ tự Google Calendar**: ghi DB trước → tạo event sau khi có task id; nếu tạo event lỗi → vẫn trả task thành công kèm cờ `calendarSynced: false` + retry sau (outbox đơn giản hoặc cột `googleSyncStatus`); xóa event fire-and-forget → chờ kết quả và log cảnh báo rõ. | `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `lib/google-calendar.ts` | M |
| M4/M5 | **Import an toàn**: chặn theo kích thước giải nén + số dòng tối đa (vd 5000) + kiểm tra định dạng file; khớp "Người thực hiện" **chính xác** (email hoặc fullName đúng 100%); dòng không khớp → đưa vào `errors`, **không** tự gán cho admin đang import. | `app/api/tasks/import/route.ts` | M |
| M1 | **Chống trùng thông báo**: migration thêm unique index `(userId, taskId, notificationType, channel, ruleKey, deadline)` trên `NotificationLog`; engine insert theo kiểu `skipDuplicates`/`onConflictDoNothing`. Giảm số lần chạy engine: hiện mỗi lần create/patch/import lại quét **toàn bộ task** (fire-and-forget) — thay bằng chạy engine cho riêng task vừa đổi (hoặc chỉ cron + login). | `prisma/schema.prisma`, `lib/notification-engine.ts`, các route gọi engine | M |
| M8 | Engine lọc `assignee.status = ACTIVE` ở query task (đã có `handleLoginAlert` chặn; bổ sung cho đường cron/create). | `lib/notification-engine.ts` | S |
| M6 | Work-summary: thêm giới hạn/take hợp lý cho ADMIN + thống nhất "đã hoàn thành hôm nay" (count theo `updatedAt` trong ngày) với danh sách task trả về (cùng window). | `app/api/tasks/work-summary/route.ts` | S |
| M9 | Push-subscription: chỉ upsert khi endpoint chưa thuộc user khác (hoặc `update` kèm điều kiện `userId = user.id`); validate cấu trúc `keys`; khi gửi push nhận 404/410 → xóa subscription cũ; thêm route DELETE. | `app/api/notifications/push-subscription/route.ts`, `lib/notification-engine.ts` | S |
| M12 | Export: nhận query filter (assigneeId/tháng/field/…) khớp màn hình; dùng `select` thay `include: { assignee: true }` (tránh kéo `passwordHash` vào RAM); nếu cần thêm sheet KPI/đánh giá thì lấy từ cùng nguồn `/api/reports/evaluation`. | `app/api/reports/export/route.ts`, `app/reports/page.tsx` | M |
| M20 | Quyết định phân quyền `/api/reports/evaluation` (hiện USER tự xem được mình — không lộ chéo; nếu là báo cáo quản lý → thêm guard ADMIN). | `app/api/reports/evaluation/route.ts` | S |

---

## PHASE 5 — Frontend: đúng dữ liệu & đúng vai trò

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H6 | **Reports/calendar/reminders không tự tính lại trên fetch cụt**: reports dùng hẳn `/api/reports/evaluation` (đã sửa ở Phase 3) làm nguồn; calendar tải theo **cửa sổ tháng** (`startDate`/`endDate` — API đã hỗ trợ) thay vì kéo hết; reminders cũng theo cửa sổ deadline. Nếu vẫn fetch danh sách: đọc `pagination.total` và cảnh báo khi bị cắt. | `app/reports/page.tsx`, `app/calendar/page.tsx`, `app/notifications/page.tsx` | M |
| M14 | **Calendar phân vai**: USER không thấy "Thêm việc"/form sửa toàn phần (chỉ dùng form cập nhật hẹp status/result/notes như WorkSummaryModal); bỏ fetch `/api/users` cho USER ở cả calendar & tasks page. | `app/calendar/page.tsx`, `app/tasks/page.tsx` | S |
| M18 | Xóa tham số `?id=` khi đóng modal chi tiết (`router.replace` về `/tasks`) — hết cảnh list bị "khóa cứng" vào 1 task. | `app/tasks/page.tsx` | S |
| L3 | Guard phản hồi cũ: `AbortController`/số thứ tự request cho search/filter ở tasks & calendar; reset `page=1` khi đổi khoảng ngày; reset state modal con của WorkSummaryModal khi đóng. | `app/tasks/page.tsx`, `app/calendar/page.tsx`, `components/WorkSummaryModal.tsx` | S |
| M19 | **Thống nhất trung tâm thông báo**: trang `/notifications` (hiện là "nhắc việc") hoặc hiển thị thật `inAppAlerts`/logs từ `GET /api/notifications` (bell đang quảng cáo "Xem tất cả & Audit Log"); đánh dấu đọc từng thông báo (PATCH per-id — server đã hỗ trợ); chỉ xóa badge khi PATCH thành công. | `components/NotificationBell.tsx`, `app/notifications/page.tsx` | M |
| L4/M17 | Reports page: bucket **loại trừ lẫn nhau** cho donut (completed | overdue | open-not-overdue | cancelled); bỏ CANCELLED khỏi mẫu số tỷ lệ hoàn thành/đúng hạn và khỏi "Chưa có kết quả". | `app/reports/page.tsx` | S |
| M15 | Users page: bỏ dropdown trạng thái ở form tạo (hoặc server đọc `status` từ body). | `app/users/page.tsx`, `app/api/users/route.ts` | S |
| L1 | KPI route: kiểm tra ADMIN **trước** khi đụng task (tránh oracle 404/400/403); cân nhắc lưu lịch sử chấm điểm (bảng mới) thay vì ghi đè. | `app/api/tasks/[id]/kpi/route.ts` | S |
| L6 | Settings: giữ chuỗi raw trong state, validate/clamp 1–168 lúc blur/submit; server cũng clamp và parse an toàn (bỏ `Boolean("false")` → kiểm tra `=== true`). | `app/settings/page.tsx`, `app/api/settings/route.ts` | S |
| L9 | sw.js `notificationclick`: so khớp theo `pathname` (bỏ so khớp URL tuyệt đối) để focus cửa sổ có sẵn. | `public/sw.js` | S |
| L5/L10 | Users API: PATCH id không tồn tại → 404; thêm validate email/độ dài mật khẩu; (tùy chọn) hủy phiên khi đổi mật khẩu. | `app/api/users/**`, `lib/auth.ts` | S |

---

## PHASE 6 — Tính năng "chết" & dọn dẹp

| Mã | Giải pháp | File chính | Độ khó |
|----|-----------|-----------|--------|
| H9 (Zalo) | Chọn 1 trong 2: **(a) Gỡ/tạm ẩn** kênh Zalo (enableZalo mặc định false, không gọi API vô ích) đến khi có số điện thoại/Zalo id thật; **(b) Hoàn thiện**: thêm trường `phone`/`zaloUserId` cho User + form cập nhật + kiểm tra contract Zalo OA thật. Khuyến nghị (a) trước. | `lib/notification-engine.ts`, `prisma/schema.prisma`, `app/settings/**` | S/M |
| M10 (Web Push) | **(a) Hoàn thiện**: flow đăng ký ở settings — `Notification.requestPermission` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <NEXT_PUBLIC_VAPID_PUBLIC_KEY> })` → POST tới push-subscription; xử lý trình duyệt không hỗ trợ (ẩn toggle). **(b)** hoặc gỡ toggle. Khuyến nghị (a) vì phần server đã sẵn sàng. | thêm component/subscribe flow (vd trong `app/settings/page.tsx` hoặc `components/`) | M |
| M11 (Google Calendar) | Quyết định: **(a) UI Connect thật**: nút → `/api/auth/google` → callback **lưu refresh token** (mã hóa trong DB/Setting riêng, không trả client) → redirect `/settings?status=...`; `getCalendarClient` đọc token lưu trữ thay vì chỉ env. **(b)** hoặc giữ env + tài liệu vận hành rõ + route báo trạng thái "chưa cấu hình". | `app/api/auth/google/route.ts`, `callback/route.ts`, `lib/google-calendar.ts`, `app/settings/page.tsx`, schema | L |
| L8 (ops) | Cảnh báo khi cron trượt (health check/log riêng cho missing CRON_SECRET); gỡ mật khẩu DB khỏi script commit (`serve_app.ts`/`start_*.ts` — đọc từ env), không tự ghi đè `.env`; dev server bind `127.0.0.1` mặc định. | `serve_app.ts`, `start_local.ts`, `start_postgres_daemon.ts`, `.gitignore` | S |
| CSP | Nếu triển khai được: `script-src` bỏ `unsafe-eval` ở production (Next hỗ trợ nonce) — ưu tiên thấp, làm sau cùng. | `next.config.mjs` | M |

---

## PHASE 7 — Kiểm thử & nghiệm thu sau khi sửa

- Chạy lại bộ acceptance hiện có: `tsx run_acceptance_tests.ts`, `tsx run_db_acceptance_tests.ts`, `tsx run_contract_coverage_tests.ts` (sửa kịch bản nếu kỳ vọng thay đổi theo nghiệp vụ mới của Phase 3).
- Bổ sung test cho các vùng sửa lớn: migration baseline trên DB clone; evaluation so sánh kết quả cũ/mới; timezone (nhập deadline theo giờ VN, kiểm tra hiển thị/quá hạn); import lỗi từng dòng; trùng thông báo khi chạy cron 2 lần song song.
- Mỗi phase commit riêng, kèm mô tả finding mà nó đóng.

---

## Thứ tự khuyến nghị tổng thể

1. **Phase 0 + Phase 1** trước mọi deploy (đang có nguy cơ mất dữ liệu/chiếm quyền admin thật sự).
2. **Phase 3** (điểm số sai = sản phẩm sai) — sau khi chốt spec nghiệp vụ.
3. **Phase 2** (timezone) và **Phase 4** (race/import/notification) song song.
4. **Phase 5 → 6 → 7** (giao diện, tính năng chết, kiểm thử) khi đã ổn định nền tảng.

> Các mục đánh dấu **"cần xác nhận nghiệp vụ"**: công thức đánh giá (H4/M13), completionRate >100% (M3), phân quyền evaluation (M20), Zalo/Web Push/Google Calendar giữ hay gỡ — không nên tự quyết thay người duyệt.

---

## TRẠNG THÁI TRIỂN KHAI (cập nhật sau khi sửa)

Đã triển khai theo kế hoạch trên, mỗi nhóm 1 commit (typecheck `tsc --noEmit` sạch sau từng bước). Vẫn **giữ nguyên demo** theo yêu cầu chủ dự án (mục H1: `/api/seed`, tài khoản mẫu, nút đăng nhập nhanh).

| Bug | Commit | Ghi chú |
|---|---|---|
| H2, H3 | `f778d4b` | Fail-fast thiếu `DATABASE_URL`/`JWT_SECRET` ở production |
| C1, M7 | `155bb6e`, `c3bf8a3` | Baseline migration `0_init` + `migrate deploy` trong build; gỡ runtime DDL (~10 route + dashboard) |
| H7, M16 | `361783b` | Chính sách giờ Việt Nam: helper `lib/utils.ts`, parse deadline routes, work-summary, evaluation month, form tasks/calendar, reports bounds |
| H4, H5, M2, M3, L1 | `e1ebaac` | Đánh giá chỉ tính COMPLETED (bỏ fallback assignedScore); đóng băng task đã chấm KPI; chặn số âm/NaN + dọn snapshot; hết lộ `error.message`; KPI check ADMIN trước |
| M1, M8, H8, M11 | `da0df49` | Unique constraint + dedupe theo kênh; bỏ LOCKED user; engine chạy theo task; tạo Google event sau ghi DB; 409 mã trùng |
| M4, M5, M9 | `248f454` | Import: giới hạn dòng/file, khớp chính xác người thực hiện, ngày giờ VN, insert chunk; push-sub không chiếm endpoint người khác |
| M12, M6, L6 | `10af2f4` | Export tôn trọng filter; work-summary giới hạn 2000; settings validate 1–168 + boolean thật |
| H6 | `dfc3c4d` | Reports/calendar/reminders tải ĐỦ dữ liệu qua phân trang (`fetchAllTaskRows`) |
| M12, M18, M15, L9 | `95fce88` | Export link kèm filter; xóa `?id=` khi đóng modal; users POST tôn trọng LOCKED; sw.js focus theo pathname |
| M17, L4 | `dd3ee62` | Donut nhóm loại trừ lẫn nhau; mẫu số không gồm CANCELLED |
| M14 | `27d5724` | Calendar/tasks: create/edit chỉ ADMIN; chỉ tải `/api/users` khi ADMIN |
| L3 | `a18a741`, `1478f11` | Reset modal WorkSummary + hiện lỗi PATCH; reset trang khi đổi khoảng ngày |
| M19 | `23a8da9` | `/notifications` thành inbox nội bộ thật (in-app alerts + log Admin, đọc từng cái / đọc tất) |

**Chưa triển khai (chờ quyết định nghiệp vụ của chủ dự án):**
- M13 — áp trọng số nhóm thật: chờ công thức.
- Phase 6 — Zalo (H9), Web Push (M10), Google Calendar (M11): chờ chọn giữ/gỡ/hoàn thiện.
- L8 ops scripts + CSP `unsafe-inline/eval`: chờ bật đèn xanh (dev scripts đang phục vụ demo).
- Các mục Low còn lại không gây lỗi đáng kể (đồng hồ `now` tĩnh trang nhắc việc, race guard search, settings hour input client, tháng mặc định calendar 8/2026 để giữ demo) — ghi nhận trong `CODE_AUDIT_REPORT.md` §4.
