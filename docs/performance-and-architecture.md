# สถาปัตยกรรมและ Performance ของ Kanban Board

**อ้างอิงจาก:** Implementation จริงใน Source Code ปัจจุบันเท่านั้น
**หมายเหตุ:** เอกสารนี้ไม่รวม Architecture หรือ Optimization ที่ยังไม่ได้ Implement และไม่ใช้แนวคิด Microservices เนื่องจากระบบปัจจุบันเป็น Monolithic Application

---

## 1. ภาพรวมระบบ

Kanban Board เป็น **Full-Stack Web Application แบบ Monolithic Architecture** ประกอบด้วย 2 ส่วนหลัก:

* **Backend** — Django REST Framework ทำหน้าที่จัดการ Business Logic, Authentication, Authorization และ Data Access
* **Frontend** — React SPA ทำหน้าที่แสดงผลและสื่อสารกับ Backend ผ่าน JSON API

ทั้งสองส่วนทำงานร่วมกันผ่าน Docker Compose โดยระบบปัจจุบันประกอบด้วย **5 Containers**:

```text
┌─────────────────────────────────────────────┐
│              Docker Compose                 │
│                                             │
│  ┌────────────┐       ┌──────────────┐      │
│  │  Frontend  │──────▶│    Backend   │──┐   │
│  │   React    │ HTTP  │ Django + DRF │  │   │
│  └────────────┘       └───────┬──────┘  │   │
│                               │         │   │
│                         ┌─────▼─────┐ ┌─▼──┐│
│                         │ PostgreSQL│ │Redis││
│                         │    16     │ │  7  ││
│                         └───────────┘ └────┘│
│                                             │
│  ┌────────────┐                             │
│  │  pgAdmin   │                             │
│  └────────────┘                             │
└─────────────────────────────────────────────┘
```

Redis ถูกใช้งานเป็น Cache สำหรับ Board Detail, Rate Limiting และ Channel Layer ของ Django Channels สำหรับ Push Notification แบบ Real-time (ผ่าน WebSocket) แต่ยังไม่มี Message Queue หรือ Background Worker สำหรับงานแบบ Asynchronous

ดังนั้น Architecture ปัจจุบันจึงเป็น **Monolith ที่แยก Frontend และ Backend เป็น Containers** แต่ยังคงเป็น Application เดียวในระดับระบบ

---

## 2. Technology Stack

เทคโนโลยีในตารางนี้อ้างอิงจาก Implementation ที่ใช้งานจริงในโปรเจกต์

| Layer            | Technology                    | รายละเอียด                   |
| ---------------- | ----------------------------- | ---------------------------- |
| Backend          | Python 3.12 + Django 5+ + DRF | REST API และ Business Logic  |
| Real-time        | Django Channels + channels-redis | WebSocket Push Notification ผ่าน Redis Channel Layer (fallback เป็น InMemoryChannelLayer เมื่อไม่มี `REDIS_URL`) |
| ASGI Server      | Uvicorn                       | Serve ASGI Application (`config.asgi:application`) |
| Authentication   | SimpleJWT                     | JWT Access / Refresh Token   |
| Database         | PostgreSQL 16                 | Relational Database          |
| Cache            | Redis 7 + django-redis        | Cache Board Detail และ Rate Limiting โดย fallback ไปใช้ LocMemCache เมื่อไม่มี `REDIS_URL` |
| Frontend         | React 19.2.8                  | Single Page Application      |
| Build Tool       | Vite 8                        | Frontend Development / Build |
| Routing          | react-router-dom 7            | Client-side Routing          |
| HTTP Client      | Axios                         | ติดต่อ REST API              |
| Drag & Drop      | @dnd-kit                      | Kanban Drag & Drop           |
| Containerization | Docker Compose                | จัดการ Application Services  |

### Authentication

ระบบใช้ JWT Authentication โดยแบ่ง Token เป็น:

```text
Access Token
└── อายุ 60 นาที

Refresh Token
└── ใช้สำหรับออก Access Token ใหม่
```

ระบบใช้ Email เป็นหลักในการ Login โดย User Model กำหนด:

```python
USERNAME_FIELD = "email"
```

---

## 3. Data Model

ระบบมี Model หลักสำหรับจัดการข้อมูล Kanban และ User โดยแบ่งออกเป็น 2 Django Apps:

```text
accounts
└── User

boards
├── Board
├── BoardMember
├── Column
├── Task
├── Tag
├── TaskAssignee
├── TaskTag
├── Invitation
└── Notification
```

### Model หลัก

* **User** — บัญชีผู้ใช้ ใช้ UUID เป็น Primary Key และ Login ด้วย Email
* **Board** — Kanban Board มี Owner, Description และ Soft Delete ผ่าน `deleted_at`
* **BoardMember** — ความสัมพันธ์ระหว่าง User และ Board พร้อม Role
* **Column** — คอลัมน์ของ Board พร้อมค่า `position`
* **Task** — การ์ดงานภายใน Column พร้อมค่า `position`
* **Tag** — Tag ของ Board พร้อมชื่อและสีในรูปแบบ Hex
* **TaskAssignee** — ความสัมพันธ์ระหว่าง Task และ User สำหรับกำหนดผู้รับผิดชอบ
* **TaskTag** — ความสัมพันธ์ระหว่าง Task และ Tag
* **Invitation** — คำเชิญเข้าร่วม Board ผ่าน Email
* **Notification** — การแจ้งเตือนสำหรับ Assignment และ System Event

ทุก Model ใช้ **UUID เป็น Primary Key** และสร้างค่าเริ่มต้นจาก `uuid.uuid4`

การใช้ UUID ช่วยลดการเปิดเผยลำดับของ Record และทำให้ ID สามารถสร้างได้โดยไม่ต้องพึ่งพา Sequence แบบ Integer

---

# 4. Core Application Flow

## 4.1 Authentication Flow

Frontend ส่ง Email และ Password ไปยัง Backend:

```text
React
  │
  │ POST /auth/login
  ▼
Django REST Framework
  │
  │ Validate credentials
  ▼
SimpleJWT
  │
  ├── Access Token
  └── Refresh Token
  │
  ▼
React
```

หลังจาก Login สำเร็จ Frontend จะเก็บ Token และแนบ Access Token กับ Request ที่ต้อง Authentication

### Axios Interceptor

`frontend/src/api.js` มี Interceptor สำหรับจัดการ Authentication Token อัตโนมัติ

```text
Request
   │
   ▼
Attach Access Token
   │
   ▼
Backend
   │
   ├── 2xx ───────────────▶ Return Response
   │
   └── 401
        │
        ▼
   Refresh Token
        │
        ├── Success
        │     └── Retry Original Request
        │
        └── Failed
              └── Logout
```

ระบบรองรับ **Single-Flight Refresh** โดยหากหลาย Request ได้ `401` พร้อมกัน จะไม่ยิง Refresh Request ซ้ำหลายครั้ง แต่ใช้การ Refresh เพียงครั้งเดียวแล้วนำ Token ใหม่ไป Retry Request ที่รออยู่

หาก Refresh Token ไม่สามารถใช้งานได้ ระบบจะลบ Session และส่ง Event:

```text
kanban:logout
```

เพื่อแจ้งให้ UI ดำเนินการ Logout

---

## 4.2 Authorization และ Data Isolation

ระบบแยก Permission ออกเป็น 3 ระดับผ่าน `boards/permissions.py`

| Permission       | หน้าที่                                          |
| ---------------- | ------------------------------------------------ |
| `HasBoardAccess` | ตรวจสอบว่า User เป็น Owner หรือ Member ของ Board |
| `CanEditBoard`   | อนุญาตให้ Owner หรือ Editor แก้ไขข้อมูล          |
| `IsBoardOwner`   | จำกัด Operation ที่ต้องใช้สิทธิ์ Owner           |

ทุก Endpoint ที่เข้าถึงข้อมูล Board จะตรวจสอบ User ที่กำลัง Authentication ก่อน

ตัวอย่างการ Query Board:

```python
Q(owner=user) | Q(members__user=user)
```

แนวทางนี้ช่วยให้ User เห็นเฉพาะ Board ที่ตนเองเป็น Owner หรือ Member และทำหน้าที่เป็นทั้ง **Authorization Layer และ Data Isolation Layer**

---

## 4.3 Drag & Drop และ Fractional Indexing

หนึ่งในจุดสำคัญของระบบคือการจัดลำดับ Column และ Task ด้วยค่า `position` แบบ Float

เมื่อสร้าง Task หรือ Column ใหม่ ระบบจะกำหนด Position ต่อจากรายการสุดท้ายผ่าน `_next_position`

ตัวอย่าง:

```text
Task A → 0.0
Task B → 1.0
Task C → 2.0
```

หากผู้ใช้ลาก Task C ไปไว้ระหว่าง A และ B:

```text
new_position = (0.0 + 1.0) / 2
              = 0.5
```

Frontend (`Kanban.jsx`) จะคำนวณ Position ใหม่ผ่าน `insertionPosition()` แล้วส่งไปยัง:

```http
PATCH /tasks/{task_id}/move
```

พร้อมข้อมูล:

```json
{
  "column_id": "target-column-uuid",
  "position": 0.5
}
```

### ผลด้าน Performance

วิธีนี้ทำให้การ Reorder สามารถ Update เฉพาะ Task ที่ถูกย้าย:

```text
Traditional Integer Ordering

A = 0
B = 1
C = 2
D = 3

Move D → between A and B

D → 1
B → 2
C → 3

ต้อง Update หลาย Row
```

ขณะที่ Fractional Indexing:

```text
A = 0
B = 1
C = 2
D = 3

Move D → between A and B

D → 0.5

Update เพียง 1 Row
```

ดังนั้นการ Reorder ไม่จำเป็นต้อง Shift Position ของ Task รายการอื่นใน Column

> **ข้อจำกัด:** หากมีการ Insert ระหว่าง Position เดิมซ้ำจำนวนมาก ค่า Float อาจมีระยะห่างลดลงเรื่อย ๆ จึงควรมี Re-normalization / Rebalancing ในระยะยาวหากระบบต้องรองรับการ Reorder จำนวนมากอย่างต่อเนื่อง

---

# 5. Notification Architecture

ระบบ Notification ใช้ **Real-time Push ผ่าน WebSocket (Django Channels)** แทนการ Polling

Notification ถูกสร้างจาก 2 Flow หลัก:

```text
Task Assignment
      │
      ▼
TaskAssigneeChangeView
      │
      ▼
Create Notification
(type = assignment)


Board Invitation
      │
      ▼
BoardInviteView
      │
      ▼
Create Notification
(type = system)
```

### WebSocket Push Flow

เมื่อสร้าง Notification (`post_save` ของ Model `Notification`) Signal `_notification_created` ใน `boards/signals.py` จะ Push ข้อมูล Notification ไปยัง Group:

```text
notifications_{user_id}
```

ผ่าน `channel_layer.group_send(...)` ซึ่งใช้ Redis Channel Layer เป็น Backend (หรือ InMemoryChannelLayer เมื่อไม่มี `REDIS_URL`)

Frontend `useNotifications.js` เปิด WebSocket:

```text
/ws/notifications/?token=<access_token>
```

```text
Backend
   │
   │ WebSocket /ws/notifications/?token=...
   ▼
NotificationConsumer
   │
   ├── Authenticate ด้วย JWT Access Token (query param)
   ├── เข้าร่วม Group notifications_{user_id}
   ▼
เมื่อมี Notification ใหม่
   │
   │ group_send → notification.new
   ▼
Frontend
   │
   └── Prepend Notification ใหม่ + Update Badge
```

รายละเอียด:

* **Auth ผ่าน Query Parameter** — Browser WebSocket API ไม่สามารถตั้ง HTTP Header ได้ จึงส่ง Access Token เป็น `?token=<access_token>` แล้ว Consumer ตรวจสอบด้วย SimpleJWT `AccessToken`; หาก Token ไม่ถูกต้องจะปิด Connection ด้วย Close Code `4001`
* **Initial Load** — เมื่อ Hook Mount ครั้งแรกยังคงโหลดรายการเดิมผ่าน `GET /notifications` จากนั้นรายการใหม่จะเข้ามาทาง WebSocket
* **Reconnect + Backoff** — หาก Connection หลุด Hook จะ Reconnect อัตโนมัติทุก ~3 วินาที และอ่าน Token ใหม่จาก `localStorage` ทุกครั้ง (รองรับกรณี Access Token ถูก Refresh แล้ว)
* **Deduplicate & Limit** — Notification ใหม่จะถูก prepend พร้อม Deduplicate ด้วย `id` และจำกัดไว้ที่ 50 รายการล่าสุด
* **Logout** — เมื่อมี Event `kanban:logout` จะหยุด Reconnect และปิด WebSocket ทันที

การ Mark as Read ใช้ **Optimistic Update**:

```text
User clicks notification
        │
        ▼
Update UI immediately
        │
        ▼
PATCH /notifications/{id}/read
```

Backend ใช้ `NotificationSerializer` ในการกำหนด Payload ของทั้ง REST และ WebSocket Message เพื่อให้ Frontend จัดการข้อมูลรูปแบบเดียวกัน

---

# 6. Invitation Flow

ระบบ Invitation ใช้ Email เป็นตัวระบุผู้รับคำเชิญ

Flow:

```text
Owner
  │
  │ email + role
  ▼
BoardInviteView
  │
  ├── Check existing invitation
  │
  ├── Create / reuse Invitation
  │
  └── Check existing User
          │
          └── Create Notification
```

ระบบใช้ `get_or_create` เพื่อป้องกันการสร้าง Invitation ซ้ำในกรณีที่มี Invitation เดิมอยู่

การ Accept Invitation ต้องผ่านการตรวจสอบว่า Email ของผู้ใช้ตรงกับ Email ที่ได้รับ Invitation:

```python
invitation.email == user.email
```

จากนั้นจึงเพิ่ม User เข้าเป็น Board Member

---

# 7. Performance Optimization ที่ Implement แล้ว

จาก Code ปัจจุบัน มีการปรับปรุง Performance ในหลายส่วน

### 7.1 ลด N+1 Query ใน Task List

`TaskSerializer` ใช้:

```python
select_related("user")
select_related("tag")
```

ร่วมกับการ Prefetch จาก `ColumnTaskListCreateView`:

```text
assignees__user
tag_links__tag
```

ช่วยลด Query ที่เกิดจากการโหลด Assignee และ Tag ของแต่ละ Task

ในส่วน Member List ก็ใช้:

```text
select_related("user")
```

เพื่อลด Query ซ้ำสำหรับข้อมูล User

---

### 7.2 Board Detail โหลดข้อมูลแบบรวม

Frontend สามารถเรียก:

```http
GET /boards/{board_id}
```

เพื่อรับข้อมูล Board พร้อม:

```text
Board
├── Members
├── Columns
│   └── Tasks
│       ├── Assignees
│       └── Tags
└── Board Tags
```

ทำให้หน้า Kanban สามารถโหลดข้อมูลหลักของ Board ผ่าน Request เดียว แทนการเรียก API แยกสำหรับแต่ละ Resource

---

### 7.3 จำกัด Notification Payload

Notification จำกัดไว้ที่ 50 รายการล่าสุด:

```python
qs[:50]
```

ช่วยควบคุมขนาด Response และลดปริมาณข้อมูลที่ต้องส่งระหว่าง Frontend และ Backend

---

### 7.4 User-Based Query Filtering

Query ที่เกี่ยวข้องกับ Board จะกรองตาม User ที่กำลัง Authentication

ตัวอย่าง:

```text
owner = request.user
OR
member.user = request.user
```

นอกจากช่วยเรื่อง Authorization แล้ว ยังช่วยลด Result Set ที่ Backend ต้องนำมาประมวลผล

---

### 7.5 Efficient Task Reordering

Fractional Indexing ทำให้การย้าย Task สามารถแก้ไขเฉพาะ Row ที่ถูกย้าย โดยไม่ต้อง Update Task รายการอื่นใน Column

---

### 7.6 Soft Delete ระดับ Board

Board ใช้ Soft Delete ผ่าน:

```text
deleted_at
```

แทนการลบข้อมูล Board และข้อมูลที่เกี่ยวข้องแบบ Cascade ทันที

ช่วยลดความเสี่ยงจากการลบข้อมูลถาวรและเปิดทางให้รองรับ Recovery/Audit ในอนาคต

---

### 7.7 Redis Cache สำหรับ Board Detail

`GET /boards/{board_id}` เป็น Endpoint ที่มี Query หนักที่สุดในระบบ เนื่องจากต้อง Serialize ข้อมูลทั้งหมดของ Board จึงมีการ Cache Payload ไว้ที่ Redis (หรือ LocMemCache เมื่อไม่มีการตั้ง `REDIS_URL`)

Cache เป็นแบบ **Per-User** เพราะ Payload มี Field `role` ที่ขึ้นอยู่กับ User ที่เรียก:

```text
board_detail:{board_id}:{version}:{user_id}
```

โดย `version` มาจาก Key ที่ใช้ Version-Bump:

```text
board_ver:{board_id}
```

Flow:

```text
GET /boards/{board_id}
      │
      ▼
ตรวจสอบ Permission (query DB)
      │
      ▼
Cache Hit? ──yes──▶ Return cached payload
      │
      no
      ▼
Serialize Board Detail
      │
      ▼
เขียน Cache (TTL 5 นาที)
```

การ Invalidate ใช้หลักการ **Version-Bump** แทนการลบ Key ทีละรายการ โดยเมื่อข้อมูลของ Board เปลี่ยน ระบบจะลบ `board_ver:{board_id}` ทิ้ง ทำให้ Cache เก่าถูกทิ้งโดยอัตโนมัติ และ Key ถัดไปจะมี Version ใหม่

Signals (`boards/signals.py`) จะจัดการ Invalidate ผ่าน `post_save` / `post_delete` ของ Model:

```text
Board, Column, Task, Tag, BoardMember, TaskTag, TaskAssignee
```

ด้วยวิธีนี้ Cache จึงสอดคล้องกับข้อมูลในฐานข้อมูลเสมอ โดยไม่ต้องใช้ `delete_pattern` ซึ่งไม่รองรับใน LocMemCache

> **หมายเหตุ:** การตรวจสอบ Permission ยังคง Query ฐานข้อมูลทุกครั้งก่อนอ่าน Cache เพื่อไม่ให้ข้อมูลไป Cache ครอบ Permission Checking

---

### 7.8 API Rate Limiting

ระบบใช้ DRF Throttling ผ่าน Redis (หรือ LocMemCache เมื่อไม่มี `REDIS_URL`) เพื่อจำกัดจำนวน Request:

```python
DEFAULT_THROTTLE_RATES = {
    'anon': '60/min',
    'user': '120/min',
}
```

Anonymous User จำกัดที่ **60 Request/นาที** และ Authenticated User จำกัดที่ **120 Request/นาที**

เมื่อเกินขีดจำกัด Backend จะตอบกลับ:

```text
429 Too Many Requests
```

---

### 7.9 Real-time Notification Push

แทนที่ Frontend จะ Poll `GET /notifications` ทุก 5 วินาที ระบบใช้ WebSocket (Django Channels + Redis Channel Layer) เพื่อ Push เฉพาะตอนที่มี Notification ใหม่เท่านั้น

```text
เดิม: Poll ทุก 5 วินาที → Request 12 ครั้ง/นาที (ส่วนใหญ่ได้ข้อมูลซ้ำ)
ใหม่: Push เมื่อมี Notification ใหม่เท่านั้น
```

ช่วยลด Request ที่ไม่จำเป็นและทำให้ UI อัปเดตได้ทันที อย่างไรก็ตาม WebSocket 1 Connection ต่อ User ยังคงต้องเปิดค้างไว้ตลอดเวลา ซึ่งมีค่า Overhead ของการรักษา Connection (เหมาะกับ Long-lived Session มากกว่างานที่ต้อง Reconnect บ่อย)

---

# 8. Current Limitations

ส่วนนี้ระบุข้อจำกัดของ Implementation ปัจจุบันตาม Code จริง เพื่อไม่ให้ Architecture Documentation แสดงความสามารถเกินกว่าที่ระบบมีอยู่

### 8.1 Board Detail ยังมี N+1 Query

แม้ Task List จะมีการ Prefetch แล้ว แต่ `BoardDetailSerializer` มีการ Nest:

```text
Board
└── Columns
    └── Tasks
        ├── Assignees
        └── Tags
```

ขณะที่ `BoardDetailView` ยังไม่ได้ Prefetch ความสัมพันธ์ทั้งหมดในระดับ Nested

ดังนั้น Board ที่มี Task จำนวนมากอาจทำให้เกิด Query เพิ่มขึ้นตามจำนวน Resource ที่ถูก Serialize

---

### 8.2 Board Summary มี Count Query เพิ่มเติม

`BoardSummarySerializer` ใช้ `.count()` สำหรับ:

```text
column_count
task_count
```

จึงอาจเกิด Query เพิ่มประมาณ 2 Query ต่อ Board ในกรณีที่มี Board หลายรายการ

---

### 8.3 ยังไม่มี Pagination สำหรับ Resource หลัก

ปัจจุบัน Resource หลัก เช่น:

```text
/boards
/tasks
```

ยังไม่มี Pagination เต็มรูปแบบ

ข้อยกเว้นคือ Notification ที่จำกัดไว้ที่ 50 รายการ

ดังนั้นหากข้อมูลเพิ่มขึ้นมากในอนาคต ควรพิจารณา Pagination หรือ Cursor-based Pagination

---

### 8.4 ยังไม่มี Background Worker สำหรับงาน Asynchronous

ระบบมี Redis แล้วในฐานะ Cache, Rate Limiting และ Channel Layer สำหรับ WebSocket แต่ยังไม่มี:

```text
Message Queue
Background Worker
```

การสร้าง Notification เกิดขึ้นภายใน Request เดียวกับ Operation หลัก (เช่น การ Assign Task) และการส่ง WebSocket Push เป็นแบบ Fire-and-Forget จาก Signal

นอกจากนี้การ Cache Board Detail ยังต้องตรวจสอบ Permission ผ่านการ Query ฐานข้อมูลทุกครั้งก่อนอ่าน Cache และการ Invalidate ผ่าน Signals ก็ยังเกิดขึ้นแบบ Synchronous ภายใน Request เดียวกัน ซึ่งในกรณีที่ต้องรองรับ Load สูงมาก ควรพิจารณาใช้ Message Queue / Background Worker ขับเคลื่อนงานเหล่านี้

---

### 8.5 แม้ใช้ ASGI Server แต่ยังเป็น Development Configuration

ปัจจุบัน Backend รันผ่าน **Uvicorn** (ASGI Server) เพื่อรองรับ WebSocket:

```text
uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --reload
```

แต่ยังคงเปิดโหมด `--reload` ซึ่งเหมาะสำหรับ Development มากกว่า Production ไม่ได้ตั้งค่า:

```text
Database Connection Pooling
PgBouncer
```

---

### 8.6 Configuration ยังเป็น Development Configuration

Configuration ปัจจุบันยังมีค่าที่เหมาะกับ Development Environment เช่น:

```text
DEBUG=0
SECRET_KEY=<development value>
ALLOWED_HOSTS=*
```

หากนำไป Production ควรแยก Environment Configuration และกำหนดค่าที่เหมาะสมกับ Production เช่น:

* ปิด `DEBUG`
* ใช้ Secret Key จาก Environment/Secret Manager
* จำกัด `ALLOWED_HOSTS`
* กำหนด Security Headers และ HTTPS
* แยก Development / Production Configuration

---

# 9. Architecture Summary

ระบบปัจจุบันเป็น **Monolithic Full-Stack Application** ที่ประกอบด้วย React Frontend, Django REST API และ PostgreSQL Database โดยทั้งหมดทำงานผ่าน Docker Compose

จุดที่มีการออกแบบด้าน Performance แล้ว ได้แก่:

```text
┌──────────────────────────────────────┐
│          Performance Focus           │
├──────────────────────────────────────┤
│ • select_related / prefetch_related  │
│ • User-based Query Filtering         │
│ • Fractional Indexing                │
│ • Notification Limit (50 records)    │
│ • Board Detail API                   │
│ • Soft Delete                        │
│ • Database Constraints               │
│ • Redis Cache (Board Detail)         │
│ • API Rate Limiting                  │
│ • Real-time Notification (WebSocket) │
└──────────────────────────────────────┘
```

ขณะเดียวกัน ระบบยังมีข้อจำกัดที่ระบุได้จาก Implementation ปัจจุบัน ได้แก่ Nested N+1 ใน Board Detail, Count Query เพิ่มเติม, การไม่มี Pagination สำหรับ Resource หลัก และงาน Invalidate Cache และสร้าง Notification ที่ยังเป็นแบบ Synchronous ภายใน Request รวมถึง ASGI Server ที่ยังรันในโหมด Development (`--reload`)


