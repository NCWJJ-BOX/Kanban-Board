# สถาปัตยกรรมและ Performance ของ Kanban Board (ตามโค้ดจริง)

**อ้างอิงจาก:** สิ่งที่ implement จริงแล้วในโค้ดเท่านั้น — ไม่รวมแผนที่ยังไม่ได้ทำ (ส่วน Microservice ถูกถอดออกแล้ว เพราะจริงๆ แล้วระบบนี้เป็นแอปตัวเดียว ไม่ได้แยกเป็น microservice)

---

## 1. ระบบนี้คืออะไร

Kanban Board เป็น full-stack web app **ภาษาเดียว** ประกอบด้วยสองส่วนหลัก:

- **Backend** — Django REST Framework API ทำหน้าที่จัดการข้อมูลทั้งหมด (บอร์ด, คอลัมน์, งาน, สมาชิก, การ์ด, การแจ้งเตือน, คำเชิญ)
- **Frontend** — React SPA ที่คุยกับ backend ผ่าน JSON API ล้วนๆ

ทั้งคู่รันอยู่บนเครื่องเดียวกันผ่าน Docker Compose โดยมีทั้งหมด **4 คอนเทนเนอร์**: `db` (PostgreSQL 16), `backend` (Django), `pgadmin` (ตัวจัดการฐานข้อมูล), และ `frontend` (React) — ไม่มี Redis, ไม่มี message queue, ไม่มีบริการย่อยแยกกัน นี่คือ monolith ที่วางคู่กันบน docker network เดียว

---

## 2. เทคโนโลยีที่ใช้จริง (จากโค้ด ไม่ใช่จากแผน)

| ชั้น | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Backend | Python 3.12 + Django 5+ + DRF | รันด้วย `manage.py runserver` ใน Dockerfile (ยังเป็น dev server ไม่ใช่ gunicorn) |
| Auth | SimpleJWT — access (อายุ 1 ชั่วโมง) + refresh | Login ด้วย **email** (User model กำหนด `USERNAME_FIELD = 'email'`) |
| Database | PostgreSQL 16 | PK เป็น UUID ทั้งตาราง, มี FK constraint, unique constraint, index อัตโนมัติจาก PK/FK/unique |
| Frontend | **React 19** + Vite 8 + react-router-dom 7 | axios เรียก `/api/v1`, drag & drop ด้วย @dnd-kit |
| Container | Docker Compose | 4 services, code mount เข้า container (รันแบบ live volume) |

จุดหนึ่งที่ควรบันทึก: ในไฟล์เอกสารเก่าเขียนว่า React 18 แต่ของจริงใน `frontend/package.json` คือ **React 19.2.8** — อันนี้แก้ให้ตรงแล้ว

---

## 3. เล่าเรื่องข้อมูล: โมเดลหลักๆ มีอะไรบ้าง

ระบบมีตารางหลัก 9 ตาราง ในแอป Django สองตัวคือ `accounts` และ `boards`:

- **User** — ไอดีเป็น UUID, login ด้วย `email` โดย `username` เอาไว้โชว์เฉยๆ
- **Board** — บอร์ด มี `owner`, `description`, และ `deleted_at` สำหรับ**ลบแบบนุ่มนวล** (soft delete) — เวลาลบบอร์ดโค้ดจะรัน `UPDATE boards SET deleted_at=now()` แทนการ DELETE ไล่ cascade ไปทั้งตารางลูก
- **BoardMember** — สมาชิกในบอร์ด พร้อม `role` สามระดับ: `owner` / `editor` / `viewer` (unique กัน board+user ซ้ำ)
- **Column** — คอลัมน์ในบอร์ด มี `position` เป็น **float** ใช้เรียงลำดับ
- **Tag** — แท็กของบอร์ด (ชื่อ + สี hex) unique ต่อ board
- **Task** — การ์ดงาน อยู่ในคอลัมน์ มี `position` เป็น float เหมือนกัน
- **TaskAssignee** — ผู้รับผิดชอบงาน (N:N ระหว่าง task กับ user)
- **TaskTag** — ความสัมพันธ์ task ↔ tag (N:N)
- **Invitation** — คำเชิญเข้าร่วมบอร์ดทางอีเมล มีสถานะ `pending` / `accepted` / `declined`
- **Notification** — การแจ้งเตือน มีสองประเภท `assignment` (งานถูกมอบหมาย) กับ `system` (เช่นได้รับคำเชิญ)

ทุกตารางใช้ **UUID เป็น primary key** ที่สร้างจากฝั่งโค้ด (`default=uuid.uuid4`) — ดีต่อการกรองข้อมูลและไม่เปิดให้คนเดา id ทั้งหลายมาสุ่มเรียก API ได้

---

## 4. เล่าเรื่องการทำงาน: flow สำคัญๆ

### 4.1 การยืนยันตัวตน (Auth)

หน้า `Register` / `Login` จะได้ `access_token` + `refresh_token` กลับมาเป็น **JWT** โดย access หมดอายุใน 1 ชั่วโมง (`expires_in: 3600` ในโค้ด `accounts/views.py`)

ฝั่ง frontend ใน `api.js` มี **interceptor** ที่ฉลาดอยู่:
- ทุก request จะแนบ `Authorization: Bearer <access_token>` อัตโนมัติ
- ถ้า server ตอบ 401 → ขอ refresh token ใหม่ (**single-flight** — ถ้าโดน 401 พร้อมกันหลาย request จะ refresh แค่ครั้งเดียวแล้ว retry ต่อ)
- ถ้า refresh ไม่ผ่าน → ลบ session และส่ง event `kanban:logout` ให้ UI รู้ตัว

### 4.2 เรื่อง permission — ใครทำอะไรได้บ้าง

โค้ดแยก permission เป็น 3 คลาสใน `boards/permissions.py`:
- `HasBoardAccess` — เข้าถึงบอร์ดได้ (owner หรือ member)
- `CanEditBoard` — แก้ไขได้ต้องเป็น owner หรือ editor
- `IsBoardOwner` — เฉพาะ owner (เช่นดึงสมาชิกออก หรือส่งคำเชิญ)

ทุก endpoint มี permission บังคับเสมอ และ**ทุก query เริ่มจาก `request.user`** เช่นรายการบอร์ดกรอง `Q(owner=user) | Q(members__user=user)` — ทำให้คนอื่นมองไม่เห็นบอร์ดที่ไม่ใช่ของตัวเอง

### 4.3 เล่าเรื่อง drag & drop กับ "fractional indexing"

จุดที่น่าสนใจที่สุดของระบบ: ใช้ **float position** ในการลากการ์ด

- เวลาสร้างคอลัมน์/งานใหม่ → อันใหม่ไปต่อ**ท้ายสุด** (`_next_position` = ค่า position สุดท้าย + 1)
- เวลาลากการ์ด → ฝั่ง frontend (`insertionPosition()` ใน `Kanban.jsx`) **คำนวณค่ากลาง** (average) ระหว่างเพื่อนบ้านซ้าย-ขวา แล้วส่ง `PATCH /tasks/{id}/move` พร้อม `{column_id, position}`

ผลลัพธ์คือการเลื่อนการ์ด **update แค่ 1 แถว** ไม่ต้องไล่ shift position ทั้งคอลัมน์ — ไม่ว่าจะในบอร์ดใหญ่แค่ไหน การย้ายครั้งหนึ่งเสียงานเขียนแค่บรรทัดเดียว (classic คิดแบบนี้แลกกับการอ่านที่ซับซ้อนขึ้นนิดหน่อย แต่ตรงนี้แลกคุ้ม)

### 4.4 เล่าเรื่องการแจ้งเตือน

การแจ้งเตือนเกิดจากสองที่:
- มีคนมอบหมายงานให้คุณ (`TaskAssigneeChangeView`)
- มีคนส่งคำเชิญเข้าร่วมบอร์ดให้คุณ (`BoardInviteView`)

แต่การ "รับ" การแจ้งเตือนยังเป็นแบบง่ายๆ: frontend ใน `useNotifications.js` **poll ไปที่ `/notifications` ทุก 5 วินาที** และ backend ตัดมาให้แค่ **50 อันล่าสุด** (`qs[:50]`) — response เล็กเสมอ ไม่มีทางโตไม่รู้จบ ส่วนการ mark read เป็น optimistic (เปลี่ยน UI ก่อน แล้วค่อยยิง API)

### 4.5 เล่าเรื่องคำเชิญ

`BoardInviteView` รับ `{email, role}` → สร้าง Invitation (กันซ้ำด้วย `get_or_create`) ถ้าอีเมลนั้นมี user อยู่ในระบบแล้วและยังไม่ได้เป็นสมาชิก → สร้าง Notification ให้ด้วย ส่วนตัวรับคำเชิญต้อง login ด้วยอีเมลที่ตรงกัน (`InvitationAcceptView` เช็ค `invitation.email == user.email`) ถึงจะกด accept แล้วเข้าเป็นสมาชิกบอร์ดได้

---

## 5. สิ่งที่ทำเรื่อง performance ไว้แล้ว (ตรวจจากโค้ดจริง)

1. **จัดการ N+1 ในจุดที่ฝั่งอ่านงาน** — `TaskSerializer.get_assignees` / `get_tags` ใช้ `select_related('user')` / `select_related('tag')` และ `ColumnTaskListCreateView.get_queryset` prefetch `assignees__user` กับ `tag_links__tag` ไว้ล่วงหน้า; `get_members` ก็ใช้ `select_related('user')` เช่นกัน
2. **Soft delete ระดับบอร์ด** — ลบมุมกับข้อมูลลูกหลายตาราง ไม่เจอ update storm และเก็บประวัติได้
3. **ตัด notification ที่ 50** — response มีขนาดคงที่
4. **ทุก query กรองตาม user** — data isolation + result set เล็ก
5. **Board detail โหลดทีเดียว** — frontend เรียก `GET /boards/{id}` ครั้งเดียวได้ทั้งบอร์ด (columns + tasks + tags) ไม่ต้องยิง N รอบ
6. **Position เป็น float** — การย้ายการ์ดแก้ 1 แถว (ข้อ 4.3)

---

## 6. ข้อจำกัดที่เห็นจริงในโค้ด (ยังไม่ได้ทำ — เขียนไว้ให้ตรงความจริง)

ตรงนี้บอกตามความจริงว่า "อะไรยังไม่มี" เพื่อไม่ให้เอกสารดูเกินจริง:

- **Board Detail ยังมี N+1 อยู่** — ตัว `BoardDetailSerializer` ฝัง columns → tasks → assignees/tags แต่ `BoardDetailView` ไม่ได้ prefetch ชั้นใน-ในแบบ `columns__tasks__assignees__user` — บอร์ดใหญ่จะรัน query ซ้ำหลายสิบครั้งต่อการ์ด (ในขณะที่รายการงานต่อคอลัมน์ prefetch แล้ว)
- **`column_count` / `task_count` อ่านเพิ่มบอร์ดละ 2 query** — ใน `BoardSummarySerializer` ใช้ `.count()` ตรงๆ → ตอน list บอร์ดหลายใบจะได้ประมาณ 2N+1 query
- **ไม่มี pagination ของจริง** — มีแค่ `[:50]` ของ notification; `/boards`, `/tasks` โหลดหมดยวง
- **ยังไม่มี cache / WebSocket / background job** — ใช้ polling 5 วิ อย่างเดียว, ตอน assign/invite สร้าง notification แบบ sync ใน request เดียว
- **backend รันด้วย dev server (`runserver`)** — ยังไม่มี gunicorn/uvicorn, ไม่มี connection pool (`CONN_MAX_AGE`), ไม่มี PgBouncer
- **ค่า default ยังเป็นแบบ dev** — `DEBUG=1`, `SECRET_KEY` เป็นค่า dev default, `ALLOWED_HOSTS = ['*']` (ยอมรับทุก host) — พร้อมใช้งานจริงต้องปิด/ตั้งค่าใหม่

---

## 7. สรุปสั้นๆ

นี่คือแอป monolith ตัวเดียวที่ทำงานจริงครบวงจร: JWT auth → board/column/task CRUD → drag & drop ด้วย fractional position → มอบหมายงาน/แท็ก → คำเชิญ → แจ้งเตือน (polling) ทุกอย่างอ่านและรันได้ในโค้ดปัจจุบัน โดยมีจุดที่ตั้งใจทำเรื่อง performance ไว้หลายจุด (prefetch, soft delete, position float, การตัด payload) และมีจุดที่รู้ว่ายังไม่ทำอีกหลายจุดตามรายการข้อ 6 — เอกสารนี้จะบอกแค่สิ่งที่เห็นจริงในโค้ดเท่านั้น