# เอกสารออกแบบระบบ Kanban Board
**ตำแหน่งที่สมัคร:** Backend Developer Intern — Clicknext Company Limited
**ผู้จัดทำ:** Numchai
**ภาษาที่ใช้:** Python

---

## 1. Tech Stack และเหตุผลในการเลือก

| ส่วนประกอบ | เทคโนโลยี | เหตุผล |
|---|---|---|
| Backend Language/Framework | **Python + FastAPI** | Async native, มี type hint/validation ด้วย Pydantic, auto-generate OpenAPI docs ทำให้ทีม Frontend ใช้งานง่าย, performance ดีกว่า Flask/Django ในงาน I/O-bound |
| Database | **PostgreSQL** | รองรับ transaction, foreign key constraint, JSONB (เผื่อเก็บ metadata ยืดหยุ่น), เหมาะกับความสัมพันธ์แบบ relational ของ Board/Column/Task |
| ORM / Migration | **SQLAlchemy 2.0 (async) + Alembic** | จัดการ schema versioning ได้เป็นระบบ, รองรับ async query |
| Authentication | **JWT (access + refresh token)** | Stateless, scale ง่าย, เหมาะกับ SPA frontend |
| Caching / Pub-Sub | **Redis** | ใช้ cache board state และเป็น message broker สำหรับ WebSocket แจ้งเตือนแบบ real-time (รองรับ horizontal scaling) |
| Real-time Notification | **WebSocket (FastAPI native)** | แจ้งเตือนสมาชิกที่ถูกมอบหมายงานแบบ real-time โดยไม่ต้อง polling |
| Containerization | **Docker + Docker Compose** | แยก service (api, db, redis, nginx) รันง่าย, reproducible environment |
| API Documentation | **OpenAPI/Swagger (auto-gen จาก FastAPI)** | เอกสาร Request/Response เป็นระบบ ตรวจสอบได้ทันที |

---

## 2. ER Diagram

ดูไฟล์แนบ `er-diagram.mermaid` (Entity-Relationship Diagram แบบเต็ม)

**สรุปความสัมพันธ์หลัก:**
- `Users` 1—M `Boards` (owner)
- `Users` M—M `Boards` ผ่าน `Board_Members` (พร้อม role: owner/editor/viewer)
- `Boards` 1—M `Columns` 1—M `Tasks`
- `Tasks` M—M `Users` ผ่าน `Task_Assignees` (ผู้รับผิดชอบ)
- `Tasks` M—M `Tags` ผ่าน `Task_Tags`
- `Boards` 1—M `Invitations` (คำเชิญเข้าร่วม)
- `Users` 1—M `Notifications` (แจ้งเตือนเมื่อถูก assign งาน)

**จุดออกแบบที่สำคัญ:**
- `position` ใน `Columns` และ `Tasks` ใช้เป็น **float (fractional indexing)** แทนที่จะเป็น integer เรียงลำดับ เพื่อให้การ drag-and-drop reorder ทำได้โดย **update แถวเดียว** (เช่น วางระหว่าง position 1.0 กับ 2.0 → ใหม่ = 1.5) ไม่ต้อง shift ทุกแถวใน column เดียวกัน ลด write load เมื่อ board มีข้อมูลจำนวนมาก
- ใช้ **soft delete** (`deleted_at`) สำหรับ Board เพื่อรองรับการกู้คืนและ audit
- แยก `Board_Members` ออกจาก `Users`/`Boards` เพื่อเก็บ role ระดับ board (owner ลบ/rename board ได้, editor แก้ task ได้, viewer ดูอย่างเดียว)

---

## 3. API Design (Request / Response)

Base URL: `/api/v1` — ทุก endpoint ที่ต้องยืนยันตัวตนใช้ header `Authorization: Bearer <access_token>`

### 3.1 Authentication

**POST /auth/register**
```json
// Request
{
  "username": "numchai",
  "email": "numchai@example.com",
  "password": "P@ssw0rd123"
}
// Response 201
{
  "id": "uuid",
  "username": "numchai",
  "email": "numchai@example.com",
  "created_at": "2026-09-04T10:00:00Z"
}
// Response 409 (email/username ซ้ำ)
{ "error": "EMAIL_ALREADY_EXISTS", "message": "อีเมลนี้ถูกใช้งานแล้ว" }
```

**POST /auth/login**
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

**POST /auth/refresh**
```json
// Request
{ "refresh_token": "jwt..." }
// Response 200
{ "access_token": "jwt...", "expires_in": 3600 }
```

### 3.2 Boards

**GET /boards** — คืน board ที่ user เป็นเจ้าของหรือเป็นสมาชิก
```json
// Response 200
{
  "boards": [
    { "id": "uuid", "name": "Project Alpha", "role": "owner", "created_at": "..." }
  ]
}
```

**POST /boards**
```json
// Request
{ "name": "Project Alpha" }
// Response 201
{ "id": "uuid", "name": "Project Alpha", "owner_id": "uuid", "created_at": "..." }
```

**PATCH /boards/{board_id}** — เปลี่ยนชื่อ (ต้องเป็น owner/editor)
```json
// Request
{ "name": "Project Alpha v2" }
// Response 200
{ "id": "uuid", "name": "Project Alpha v2", "updated_at": "..." }
// Response 403
{ "error": "FORBIDDEN", "message": "ไม่มีสิทธิ์แก้ไข board นี้" }
```

**DELETE /boards/{board_id}** — เฉพาะ owner
```json
// Response 204 (No Content)
// Response 403 { "error": "FORBIDDEN" }
```

**POST /boards/{board_id}/invite**
```json
// Request
{ "email": "friend@example.com", "role": "editor" }
// Response 201
{ "invitation_id": "uuid", "status": "pending", "invited_email": "friend@example.com" }
```

**POST /invitations/{invitation_id}/accept**
```json
// Response 200
{ "board_id": "uuid", "role": "editor", "status": "accepted" }
```

### 3.3 Columns

**POST /boards/{board_id}/columns**
```json
// Request
{ "name": "To Do", "position": 1.0 }
// Response 201
{ "id": "uuid", "board_id": "uuid", "name": "To Do", "position": 1.0 }
```

**PATCH /columns/{column_id}**
```json
// Request
{ "name": "In Progress", "position": 2.0 }
// Response 200
{ "id": "uuid", "name": "In Progress", "position": 2.0, "updated_at": "..." }
```

**DELETE /columns/{column_id}**
```json
// Response 204
```

### 3.4 Tasks

**POST /columns/{column_id}/tasks**
```json
// Request
{ "title": "ออกแบบ ER Diagram", "description": "...", "position": 1.0 }
// Response 201
{ "id": "uuid", "column_id": "uuid", "title": "ออกแบบ ER Diagram", "position": 1.0 }
```

**PATCH /tasks/{task_id}** — แก้ชื่อ/รายละเอียด
```json
// Request
{ "title": "ออกแบบ ER Diagram (v2)", "description": "อัปเดตแล้ว" }
// Response 200
{ "id": "uuid", "title": "ออกแบบ ER Diagram (v2)", "updated_at": "..." }
```

**PATCH /tasks/{task_id}/move** — ย้าย column และ/หรือปรับตำแหน่ง (รองรับ drag-and-drop)
```json
// Request
{ "column_id": "uuid-of-target-column", "position": 1.5 }
// Response 200
{ "id": "uuid", "column_id": "uuid-of-target-column", "position": 1.5 }
```

**DELETE /tasks/{task_id}**
```json
// Response 204
```

**POST /tasks/{task_id}/tags**
```json
// Request
{ "tag_id": "uuid" }   // หรือ { "name": "urgent", "color_hex": "#FF0000" } เพื่อสร้าง tag ใหม่พร้อมกัน
// Response 201
{ "task_id": "uuid", "tags": [{ "id": "uuid", "name": "urgent", "color_hex": "#FF0000" }] }
```

**DELETE /tasks/{task_id}/tags/{tag_id}**
```json
// Response 204
```

**POST /tasks/{task_id}/assignees**
```json
// Request
{ "user_id": "uuid" }
// Response 201
{
  "task_id": "uuid",
  "assignees": [{ "id": "uuid", "username": "friend" }]
}
```
> เมื่อ assign สำเร็จ ระบบจะสร้าง record ใน `Notifications` และ push ผ่าน WebSocket ไปยัง user ที่ถูกมอบหมายทันที (ดูข้อ 4.2)

**DELETE /tasks/{task_id}/assignees/{user_id}**
```json
// Response 204
```

### 3.5 Notifications

**GET /notifications** — รายการแจ้งเตือนของ user ปัจจุบัน
```json
// Response 200
{
  "notifications": [
    {
      "id": "uuid",
      "type": "task_assigned",
      "message": "คุณได้รับมอบหมายงาน 'ออกแบบ ER Diagram'",
      "task_id": "uuid",
      "is_read": false,
      "created_at": "..."
    }
  ]
}
```

**PATCH /notifications/{id}/read**
```json
// Response 200
{ "id": "uuid", "is_read": true }
```

**WebSocket: `ws://.../ws/notifications`** (auth ผ่าน token ใน query string หรือ subprotocol)
```json
// Server → Client push event เมื่อมี assign ใหม่
{
  "event": "notification.new",
  "data": {
    "id": "uuid",
    "type": "task_assigned",
    "message": "คุณได้รับมอบหมายงาน 'ออกแบบ ER Diagram'",
    "task_id": "uuid"
  }
}
```

---

## 4. รายละเอียดเชิงลึก (Optional Features)

### 4.1 Drag-and-Drop Reorder (5a)
- Frontend (Vue/React + `vue-draggable` หรือ `dnd-kit`) ส่ง event เมื่อ drop task ไปยัง column/ตำแหน่งใหม่
- Backend รับ `PATCH /tasks/{id}/move` พร้อม `column_id` และ `position` ใหม่ (คำนวณจาก frontend โดยหาค่าเฉลี่ยระหว่าง 2 task ที่อยู่ติดกัน)
- ใช้ **fractional indexing** ตามที่อธิบายในหัวข้อ ER Diagram เพื่อให้เป็น O(1) update — มี background job (หรือ trigger เมื่อ float แคบเกินไป เช่น < 0.0001) คอย **re-normalize position** เป็นเลขจำนวนเต็มใหม่ทั้ง column เพื่อป้องกัน floating-point precision issue ในระยะยาว

### 4.2 In-app Notification (6a)
- ใช้ **Redis Pub/Sub** เป็นตัวกลาง: เมื่อ API server instance ใดสร้าง notification ใหม่ จะ publish event ไปยัง Redis channel `notify:{user_id}`
- ทุก API server instance ที่มี WebSocket connection ของ user นั้นอยู่จะ subscribe และ push event ต่อไปยัง client
- ออกแบบให้ decouple จาก HTTP request หลัก (assign task) ด้วยการยิงเป็น background task (FastAPI `BackgroundTasks` หรือ message queue เช่น Celery/RQ) เพื่อไม่ให้ latency ของ API หลักเพิ่มขึ้น

---

## 5. แนวทางเพิ่ม Performance

1. **Fractional indexing** สำหรับ reorder (อธิบายแล้วข้างต้น) — ลดการ update จาก O(n) เป็น O(1) ต่อการลาก-วาง 1 ครั้ง
2. **Redis caching** สำหรับ board state ที่อ่านบ่อย (GET board detail พร้อม columns/tasks) — invalidate cache เมื่อมีการเขียนข้อมูลใน board นั้น (cache-aside pattern)
3. **Database indexing**: composite index บน `(column_id, position)` ของ Tasks และ `(board_id, position)` ของ Columns เพื่อ query เรียงลำดับได้เร็ว, index บน foreign key ทุกตัว
4. **Connection pooling** ผ่าน SQLAlchemy async engine + PgBouncer เมื่อ scale หลาย instance
5. **Pagination / cursor-based** สำหรับ endpoint ที่ list ข้อมูลจำนวนมาก (เช่น notifications, board list)
6. **WebSocket + Redis Pub/Sub** แทนการ polling เพื่อลด load ที่ server และ latency ของการแจ้งเตือน

---

## 6. แนวทาง Microservice Architecture (แนวคิดเพื่อการขยายในอนาคต)

แม้ scope ของ test นี้เหมาะกับ **Modular Monolith** มากกว่า (เพราะ domain ยังไม่ซับซ้อนมาก และ microservice จะเพิ่ม operational overhead โดยไม่จำเป็น) แต่ออกแบบโครงสร้าง code ให้แบ่งเป็น module ตาม bounded context ไว้ล่วงหน้า เพื่อให้ **แยกเป็น microservice ได้ในอนาคตโดยไม่ต้อง refactor ใหญ่**:

| Service | หน้าที่ | สื่อสารกับ |
|---|---|---|
| **Auth Service** | Register/Login/JWT issuance | ทุก service เรียกผ่าน API Gateway ตรวจ token |
| **Board Service** | Boards, Columns, Tasks, Tags, Members | Publish event `task.assigned` ไปยัง Message Broker |
| **Notification Service** | Subscribe event จาก Board Service, สร้าง/ส่ง notification ผ่าน WebSocket | Consume จาก RabbitMQ/Kafka |
| **API Gateway** (เช่น Nginx/Kong) | Routing, rate limiting, JWT validation ร่วม | หน้าด่านของทุก service |

- ใช้ **Message Broker (RabbitMQ)** เป็นตัวเชื่อม Board Service → Notification Service แบบ asynchronous (event-driven) เพื่อลด coupling — ถ้า Notification Service ล่ม การสร้าง/ย้าย task ยังทำงานได้ปกติ
- แต่ละ service มี database ของตัวเอง (**Database per Service**) ยกเว้นข้อมูล user ที่ Auth Service เป็นเจ้าของ และ service อื่นเก็บแค่ `user_id` reference

---

## 7. Docker Compose (โครงสร้างโดยสรุป)

```yaml
services:
  api:
    build: ./backend
    env_file: .env
    depends_on: [db, redis]
    ports: ["8000:8000"]
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: kanban
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
volumes:
  pgdata:
```
