# API Design — Request / Response

**อ้างอิงจาก:** โค้ดจริง (`backend/boards/urls.py`, `backend/accounts/urls.py`, serializers/views)
**Framework:** Django REST Framework 5 + SimpleJWT

---

## 0. ข้อตกลงกลาง (Conventions)

| หัวข้อ | กติกา |
|---|---|
| Base URL | `/api/v1/` |
| รูปแบบข้อมูล | JSON (`Content-Type: application/json`) |
| Authentication | `Authorization: Bearer <access_token>` — ทุก endpoint ยกเว้น register/login/refresh |
| Token type | JWT access (อายุ 60 นาที) + refresh — response จาก auth ใช้คีย์ `access_token` / `refresh_token` |
| ID รูปแบบ | UUID string ทั้งหมด |
| Error รูปแบบ | DRF default: `400 {"<field>": ["<msg>"]}` / `403 {"detail": "..."}` / `404 {"detail": "Not found."}`<br>Custom: `{"error": "<CODE>", "message": "<ข้อความ>"}` (คงที่ เข้าใจง่าย frontend ตรวจสอบได้) |
| List response | JSON array ดิบ (ไม่มี wrapper object) |
| Mutation ที่ไม่คืน body | `204 No Content` |

**Permission โดยย่อ (บังคับด้วย `boards/permissions.py`):**
- อ่าน board / column / task → สมาชิก board เท่านั้น (`HasBoardAccess`)
- แก้ไข column/task/tag/assignee → owner หรือ editor (`CanEditBoard`)
- เปลี่ยนชื่อ/ลบ board, invite, จัดการสมาชิก → owner เท่านั้น
- CRUD board เอง (สร้างใหม่) → user ที่ล็อกอินทุกคน

---

## 1. Auth (`/auth/`)

### POST `/auth/register` — สมัครสมาชิก (ได้ token ทันที)
```json
// Request
{
  "username": "numchai",
  "email": "numchai@example.com",
  "password": "P@ssw0rd123"
}
// Response 201
{
  "user": { "id": "uuid", "username": "numchai", "email": "numchai@example.com", "created_at": "2026-09-04T10:00:00Z" },
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer",
  "expires_in": 3600
}
// Response 409 — email หรือ username ซ้ำ
{ "error": "EMAIL_ALREADY_EXISTS", "message": "Email Already Exists", "detail": {"email": ["..."]} }
// Response 400 — password ไม่ผ่าน (min 8 ตัว ฯลฯ)
{ "error": "VALIDATION_ERROR", "message": "Validation Error", "detail": {...} }
```

### POST `/auth/login` — ล็อกอินด้วย email
```json
// Request
{ "email": "numchai@example.com", "password": "P@ssw0rd123" }
// Response 200
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer",
  "expires_in": 3600
}
// Response 401
{ "error": "INVALID_CREDENTIALS", "message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }
```

### POST `/auth/refresh` — ขอ access token ใหม่
```json
// Request
{ "refresh": "jwt..." }
// Response 200
{ "access_token": "jwt...", "refresh_token": "jwt...", "token_type": "bearer" }
```

### GET `/auth/me` — ข้อมูล user ปัจจุบัน (authed)
```json
// Response 200
{ "id": "uuid", "username": "numchai", "email": "numchai@example.com", "created_at": "2026-09-04T10:00:00Z" }
```

---

## 2. Boards (`/boards/`)

### GET `/boards` — รายการ board ที่ user เป็นเจ้าของ/สมาชิก
```json
// Response 200
[
  {
    "id": "uuid",
    "name": "Process Dev",
    "description": "ทดสอบโปรเซส dev workflow",
    "owner": "uuid",
    "role": "owner",
    "members": [ { "id": "uuid", "username": "numchai", "role": "owner" } ],
    "column_count": 3,
    "task_count": 7,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### POST `/boards` — สร้าง board (ผู้สร้างกลายเป็น owner อัตโนมัติ)
```json
// Request
{ "name": "Project Alpha", "description": "optional" }
// Response 201 — shape เดียวกับ GET /boards (รายการเดียว)
{ "id": "uuid", "name": "Project Alpha", "description": "optional", "owner": "uuid", "role": "owner", ... }
// Response 400 — name ว่าง
{ "name": ["Name is required."] }
```

### GET `/boards/{board_id}` — รายละเอียด board ประกอบ columns + tags (ที่ฝั่งใช้แสดงหน้า Kanban)
```json
// Response 200
{
  "id": "uuid", "name": "Process Dev", "description": "...", "owner": "uuid",
  "role": "owner",
  "members": [ { "id": "uuid", "username": "numchai", "role": "owner" } ],
  "column_count": 3, "task_count": 7, "created_at": "...", "updated_at": "...",
  "columns": [
    {
      "id": "uuid", "board": "uuid", "name": "To Do", "position": 0.0, "created_at": "...",
      "tasks": [
        {
          "id": "uuid", "column": "uuid", "title": "ออกแบบ ER Diagram",
          "description": "...", "position": 0.0,
          "assignees": [ { "id": "uuid", "username": "friend", "email": "friend@x.com" } ],
          "tags": [ { "id": "uuid", "name": "urgent", "color": "#ef4444" } ],
          "created_at": "...", "updated_at": "..."
        }
      ]
    }
  ],
  "tags": [ { "id": "uuid", "board": "uuid", "name": "urgent", "color": "#ef4444" } ]
}
```

### PATCH `/boards/{board_id}` — เปลี่ยนชื่อ / แก้ไข description (**owner เท่านั้น**)
```json
// Request
{ "name": "Process Dev v2", "description": "คำอธิบายใหม่" }
// Response 200
{ "id": "uuid", "name": "Process Dev v2", "description": "คำอธิบายใหม่", "owner": "uuid", "created_at": "..." }
// Response 403 — ไม่ใช่ owner
{ "detail": "You do not have permission to perform this action." }
```

### DELETE `/boards/{board_id}` — ลบ board (owner เท่านั้น, soft delete)
```json
// Response 204 (No Content)
```

---

## 3. Columns (`/boards/{board_id}/columns`, `/columns/{column_id}`)

### GET `/boards/{board_id}/columns` — รายการ column
```json
// Response 200
[ { "id": "uuid", "board": "uuid", "name": "To Do", "position": 0.0, "created_at": "...", "tasks": [...] } ]
```

### POST `/boards/{board_id}/columns` — สร้าง column (`position` คำนวณอัตโนมัติจากตัวสุดท้าย)
```json
// Request
{ "name": "In Progress" }
// Response 201 — shape ตาม GET (หนึ่งตัว)
{ "id": "uuid", "board": "uuid", "name": "In Progress", "position": 1.0, "created_at": "...", "tasks": [] }
```

### PATCH `/columns/{column_id}` — แก้ชื่อ column (onBlur จากหน้า UI)
```json
// Request
{ "name": "Doing" }
// Response 200 — shape ตาม ColumnWriteSerializer (ไม่ฝัง tasks)
{ "id": "uuid", "board": "uuid", "name": "Doing", "position": 1.0 }
```

### DELETE `/columns/{column_id}` — ลบ column พร้อม task ทั้งหมดในนั้น (CASCADE ระดับ DB)
```json
// Response 204
```

---

## 4. Tasks (`/columns/{column_id}/tasks`, `/tasks/{task_id}`)

### GET `/columns/{column_id}/tasks`
```json
// Response 200
[ { "id": "uuid", "column": "uuid", "title": "...", "description": "...", "position": 0.0,
    "assignees": [...], "tags": [...], "created_at": "...", "updated_at": "..." } ]
```

### POST `/columns/{column_id}/tasks` — สร้าง task (`position` อัตโนมัติ)
```json
// Request
{ "title": "ออกแบบ API", "description": "optional" }
// Response 201
{ "id": "uuid", "column": "uuid", "title": "ออกแบบ API", "description": "optional",
  "position": 1.0, "assignees": [], "tags": [], "created_at": "...", "updated_at": "..." }
// Response 400 — title ว่าง
{ "title": ["Title is required."] }
```

### GET `/tasks/{task_id}` — ตัวเดียว พร้อม assignees/tags
```json
// Response 200 — shape task เต็ม (มี assignees, tags)
```

### PATCH `/tasks/{task_id}` — แก้ title / description
```json
// Request
{ "title": "ออกแบบ API v2", "description": "อัปเดต" }
// Response 200 — shape task (ไม่มี assignees/tags ใน response นี้)
{ "id": "uuid", "column": "uuid", "title": "ออกแบบ API v2", "description": "อัปเดต",
  "position": 1.0, "created_at": "..." }
```

### DELETE `/tasks/{task_id}` — ลบ task
```json
// Response 204
```

### PATCH `/tasks/{task_id}/move` — ย้าย column / ปรับตำแหน่ง (drag-and-drop)
**แนวคิด fractional indexing:** frontend คำนวณ `position` ใหม่ = ค่าเฉลี่ยของ task ที่อยู่ก่อน/หลังจุด drop แล้วส่งมาทั้งหมด 1 ครั้ง
```json
// Request 1 — ย้ายไปอีก column + ระบุตำแหน่ง
{ "column_id": "uuid-of-target-column", "position": 1.5 }
// Request 2 — เลื่อนใน column เดียว (ไม่ต้องส่ง column_id)
{ "position": 2.5 }
// Response 200 — shape task เต็ม (assignees, tags)
{
  "id": "uuid", "column": "uuid-of-target-column", "title": "...",
  "position": 1.5, "assignees": [...], "tags": [...], "created_at": "...", "updated_at": "..."
}
// Response 400 — column ไม่ใช่ board เดียวกัน
{ "error": "Column does not belong to the same board." }
// Response 400 — position ไม่ใช่ตัวเลข / อนันต์
{ "error": "position must be a number." }
```

---

## 5. Tags (`/boards/{board_id}/tags`, `/tasks/{task_id}/tags`)

### GET `/boards/{board_id}/tags`
```json
// Response 200
[ { "id": "uuid", "board": "uuid", "name": "urgent", "color": "#ef4444" } ]
```

### POST `/boards/{board_id}/tags` — สร้าง tag ใหม่ของ board
```json
// Request
{ "name": "urgent", "color": "#ef4444" }
// Response 201
{ "id": "uuid", "board": "uuid", "name": "urgent", "color": "#ef4444" }
// Response 400 — สีไม่ใช่ hex
{ "color": ["Color must be a hex value like #6366f1"] }
```

### POST `/tasks/{task_id}/tags` — เอาต์ tag ใส่ task (body รับ `tag_id`)
```json
// Request
{ "tag_id": "uuid" }
// Response 200 — task เต็ม พร้อม tags ที่อัปเดต
{ "id": "uuid", ..., "tags": [{ "id": "uuid", "name": "urgent", "color": "#ef4444" }], ... }
// Response 400 — tag คนละ board
{ "error": "Tag does not belong to this board." }
```

### DELETE `/tasks/{task_id}/tags/{tag_id}` — เอาออก
```json
// Response 200 — task เต็ม พร้อม tags ที่เหลือ
```

---

## 6. Assignees — ผู้รับผิดชอบ (`/tasks/{task_id}/assignees`)

### POST `/tasks/{task_id}/assignees` — มอบหมายงาน + **สร้าง Notification ให้ผู้ถูกมอบหมายอัตโนมัติ**
```json
// Request
{ "user_id": "uuid" }
// Response 200 — task เต็มพร้อม assignees
{ "id": "uuid", ..., "assignees": [{ "id": "uuid", "username": "friend", "email": "friend@x.com" }], ... }
// หลังสำเร็จ: INSERT เข้า notifications (type=assignment) สำหรับ user ที่ถูก assign
//   message: คุณถูกมอบหมายงาน "<title>" ในบอร์ด "<board.name>"
```

### DELETE `/tasks/{task_id}/assignees/{user_id}` — เอาออก
```json
// Response 200 — task เต็มพร้อม assignees ที่เหลือ
```

---

## 7. สมาชิก board (`/boards/{board_id}/members`)

### GET `/boards/{board_id}/members`
```json
// Response 200
[ { "id": "uuid", "username": "numchai", "email": "numchai@example.com" } ]
```

### DELETE `/boards/{board_id}/members/{user_id}` — เจ้าของไล่สมาชิกออก (**owner เท่านั้น**)
```json
// Response 204
// Response 400 — ลบเจ้าของเองไม่ได้
{ "error": "Cannot remove the board owner." }
```

---

## 8. Invitations (`/boards/{board_id}/invite`, `/invitations/`)

### POST `/boards/{board_id}/invite` — ส่งคำเชิญ (**owner เท่านั้น**)
- ถ้าอีเมลนั้นเป็น user ในระบบอยู่แล้ว → สร้าง `Notification` (type=system) แจ้ง "คุณได้รับคำเชิญ..."
- คำเชิญซ้ำ (board+email & ยัง pending) → คืน invitation เดิม (ไม่สร้างซ้ำ)
```json
// Request
{ "email": "friend@example.com", "role": "editor" }
// Response 201
{
  "id": "uuid", "board": "uuid", "board_name": "Process Dev",
  "email": "friend@example.com", "role": "editor",
  "status": "pending", "created_at": "..."
}
// Response 400 — email ไม่ถูกต้อง
{ "email": ["Invalid email address."] }
```

### GET `/invitations` — คำเชิญที่รอรับของ user (ตาม email + status=pending)
```json
// Response 200
[ { "id": "uuid", "board": "uuid", "board_name": "...", "email": "me@x.com", "role": "viewer", "status": "pending", "created_at": "..." } ]
```

### POST `/invitations/{invitation_id}/accept` — รับคำเชิญ → เข้าเป็นสมาชิก board
```json
// Response 200
{ "id": "uuid", "name": "Process Dev", "message": "Joined board successfully" }
// Response 403 — ไม่ใช่คนที่ถูกเชิญ
{ "error": "This invitation is not for you." }
// Response 400 — เชิญถูกใช้/หมดอายุแล้ว
{ "error": "Invitation is no longer pending." }
```

---

## 9. Notifications (`/notifications/`)

### GET `/notifications` — แจ้งเตือนของฉัน (เรียงใหม่สุดก่อน, ตัดที่ 50)
```json
// Query param: ?unread=1 เอาเฉพาะที่ยังไม่อ่าน
// Response 200
[
  {
    "id": "uuid",
    "type": "assignment",          // assignment | system
    "message": "คุณถูกมอบหมายงาน \"ออกแบบ ER Diagram\" ในบอร์ด \"Process Dev\"",
    "task": "uuid-or-null",        // null เมื่อเป็นระบบ
    "task_title": "ออกแบบ ER Diagram",
    "is_read": false,
    "created_at": "..."
  }
]
```

### PATCH `/notifications/{notification_id}/read` — กดอ่านแล้ว
```json
// Response 200
{ "id": "uuid", "type": "assignment", "message": "...", "task": "uuid", "task_title": "...", "is_read": true, "created_at": "..." }
```

> **Frontend polling:** `frontend/src/hooks/useNotifications.js` poll ทุก 5 วินาที + markRead/markAllRead แบบ optimistic + กริ่งแสดง badge จำนวน unread