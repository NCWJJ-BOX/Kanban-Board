# API Design — Request / Response

**อ้างอิงจาก:** Implementation จริงใน `backend/boards/urls.py`, `backend/accounts/urls.py`, Serializers และ Views
**Framework:** Django REST Framework 5 + SimpleJWT

---

## 0. API Conventions

| หัวข้อ                              | รายละเอียด                                                                |
| ----------------------------------- | ------------------------------------------------------------------------- |
| **Base URL**                        | `/api/v1/`                                                                |
| **Data Format**                     | JSON (`Content-Type: application/json`)                                   |
| **Authentication**                  | `Authorization: Bearer <access_token>` สำหรับ Endpoint ที่ต้องยืนยันตัวตน |
| **Token**                           | JWT Access Token อายุ 60 นาที และ Refresh Token                           |
| **Token Response**                  | ใช้ key `access_token` และ `refresh_token`                                |
| **ID Format**                       | UUID String                                                               |
| **Error Response**                  | ใช้รูปแบบมาตรฐานของ DRF หรือ Custom Error ที่กำหนดไว้                     |
| **List Response**                   | JSON Array โดยตรง ไม่มี wrapper object                                    |
| **Mutation ที่ไม่มี Response Body** | HTTP `204 No Content`                                                     |
| **Rate Limiting**                  | Anonymous `60 req/min`, Authenticated `120 req/min` ผ่าน DRF Throttling  |

### Authentication

Endpoint ที่ไม่ต้อง Authentication:

* Register
* Login
* Refresh Token

Endpoint อื่น ๆ ต้องส่ง Access Token ผ่าน HTTP Header:

```http
Authorization: Bearer <access_token>
```

### Error Response

ใช้ทั้ง DRF Default Error และ Custom Error ตามลักษณะของ Endpoint

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation Error",
  "detail": {}
}
```

ตัวอย่าง HTTP Status:

* `400 Bad Request` — ข้อมูล Request ไม่ถูกต้อง
* `401 Unauthorized` — Authentication ไม่ถูกต้องหรือ Token ไม่ถูกต้อง
* `403 Forbidden` — ไม่มีสิทธิ์ดำเนินการ
* `404 Not Found` — ไม่พบ Resource
* `409 Conflict` — Resource ซ้ำ เช่น Email
* `429 Too Many Requests` — เกิน Rate Limit ที่กำหนด

### Permission Model

| Operation                            | Permission               |
| ------------------------------------ | ------------------------ |
| อ่าน Board / Column / Task           | สมาชิกของ Board          |
| แก้ไข Column / Task / Tag / Assignee | Owner หรือ Editor        |
| เปลี่ยนชื่อ / ลบ Board               | Owner เท่านั้น           |
| Invite สมาชิก                        | Owner เท่านั้น           |
| จัดการสมาชิก                         | Owner เท่านั้น           |
| สร้าง Board                          | User ที่ Login แล้วทุกคน |

ระบบใช้ `HasBoardAccess` และ `CanEditBoard` ในการควบคุมสิทธิ์การเข้าถึงและแก้ไขข้อมูล

---

## 1. Authentication

### POST `/auth/register`

สร้างบัญชีผู้ใช้ใหม่ และออก JWT Token ให้ทันทีหลังสมัครสำเร็จ

**Request**

```json
{
  "username": "numchai",
  "email": "numchai@example.com",
  "password": "P@ssw0rd123"
}
```

**Response `201 Created`**

```json
{
  "user": {
    "id": "uuid",
    "username": "numchai",
    "email": "numchai@example.com",
    "created_at": "2026-09-04T10:00:00Z"
  },
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Response `409 Conflict` — Email ซ้ำ**

```json
{
  "error": "EMAIL_ALREADY_EXISTS",
  "message": "Email Already Exists",
  "detail": {
    "email": ["..."]
  }
}
```

**Response `400 Bad Request` — Validation Error**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation Error",
  "detail": {}
}
```

---

### POST `/auth/login`

เข้าสู่ระบบด้วย Email และ Password

**Request**

```json
{
  "email": "numchai@example.com",
  "password": "P@ssw0rd123"
}
```

**Response `200 OK`**

```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Response `401 Unauthorized`**

```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
}
```

---

### POST `/auth/refresh`

ออก Access Token ใหม่โดยใช้ Refresh Token

**Request**

```json
{
  "refresh": "jwt..."
}
```

**Response `200 OK`**

```json
{
  "access_token": "jwt...",
  "refresh_token": "jwt...",
  "token_type": "bearer"
}
```

---

### GET `/auth/me`

ดึงข้อมูลของผู้ใช้ที่กำลัง Authentication อยู่

**Response `200 OK`**

```json
{
  "id": "uuid",
  "username": "numchai",
  "email": "numchai@example.com",
  "created_at": "2026-09-04T10:00:00Z"
}
```

---

## 2. Boards

### GET `/boards`

ดึงรายการ Board ที่ผู้ใช้เป็นเจ้าของหรือเป็นสมาชิก

**Response `200 OK`**

```json
[
  {
    "id": "uuid",
    "name": "Process Dev",
    "description": "ทดสอบโปรเซส dev workflow",
    "owner": "uuid",
    "role": "owner",
    "members": [
      {
        "id": "uuid",
        "username": "numchai",
        "role": "owner"
      }
    ],
    "column_count": 3,
    "task_count": 7,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### POST `/boards`

สร้าง Board ใหม่ โดยผู้สร้างจะได้รับ Role เป็น `owner` อัตโนมัติ

**Request**

```json
{
  "name": "Project Alpha",
  "description": "optional"
}
```

**Response `201 Created`**

Response มีโครงสร้างเดียวกับ Board ที่ได้จาก `GET /boards`

### GET `/boards/{board_id}`

ดึงรายละเอียด Board พร้อม Columns, Tasks และ Tags สำหรับแสดงผล Kanban Board

Response ประกอบด้วย:

* Board information
* Members
* Columns
* Tasks
* Assignees
* Tags
* Statistics

**Performance:** Payload ของ Endpoint นี้ถูก Cache แบบ Per-User ผ่าน Redis (หรือ LocMemCache เมื่อไม่มี `REDIS_URL`) เป็นเวลา 5 นาที และจะถูก Invalidate อัตโนมัติผ่าน Django Signals เมื่อข้อมูล Board, Column, Task, Tag หรือ Member ถูกแก้ไข

### PATCH `/boards/{board_id}`

แก้ไขชื่อหรือรายละเอียดของ Board

**Permission:** Owner เท่านั้น

**Request**

```json
{
  "name": "Process Dev v2",
  "description": "คำอธิบายใหม่"
}
```

**Response `200 OK`**

คืนข้อมูล Board ที่ถูกแก้ไข

### DELETE `/boards/{board_id}`

ลบ Board

**Permission:** Owner เท่านั้น

**Response:** `204 No Content`

ระบบใช้ Soft Delete เพื่อป้องกันการลบข้อมูลออกจากฐานข้อมูลโดยตรง

---

## 3. Columns

### GET `/boards/{board_id}/columns`

ดึงรายการ Column ภายใน Board

### POST `/boards/{board_id}/columns`

สร้าง Column ใหม่ โดยระบบคำนวณ `position` จาก Column สุดท้ายโดยอัตโนมัติ

**Request**

```json
{
  "name": "In Progress"
}
```

**Response `201 Created`**

```json
{
  "id": "uuid",
  "board": "uuid",
  "name": "In Progress",
  "position": 1.0,
  "created_at": "...",
  "tasks": []
}
```

### PATCH `/columns/{column_id}`

แก้ไขชื่อ Column

ใช้สำหรับการแก้ไขชื่อจาก UI เช่น เมื่อผู้ใช้แก้ไขชื่อแล้วออกจาก Input (`onBlur`)

**Request**

```json
{
  "name": "Doing"
}
```

### DELETE `/columns/{column_id}`

ลบ Column และ Task ที่อยู่ภายใน Column

**Response:** `204 No Content`

การลบ Task ที่เกี่ยวข้องดำเนินการผ่าน `CASCADE` ของ Database Relationship

---

## 4. Tasks

### GET `/columns/{column_id}/tasks`

ดึงรายการ Task ภายใน Column

### POST `/columns/{column_id}/tasks`

สร้าง Task ใหม่ โดยระบบกำหนด `position` ให้อัตโนมัติ

**Request**

```json
{
  "title": "ออกแบบ API",
  "description": "optional"
}
```

**Response `201 Created`**

```json
{
  "id": "uuid",
  "column": "uuid",
  "title": "ออกแบบ API",
  "description": "optional",
  "position": 1.0,
  "assignees": [],
  "tags": [],
  "created_at": "...",
  "updated_at": "..."
}
```

### GET `/tasks/{task_id}`

ดึงรายละเอียด Task พร้อม Assignees และ Tags

### PATCH `/tasks/{task_id}`

แก้ไข Title หรือ Description ของ Task

**Request**

```json
{
  "title": "ออกแบบ API v2",
  "description": "อัปเดต"
}
```

### DELETE `/tasks/{task_id}`

ลบ Task

**Response:** `204 No Content`

---

### PATCH `/tasks/{task_id}/move`

ย้าย Task ระหว่าง Column หรือเปลี่ยนลำดับภายใน Column

ระบบใช้แนวคิด **Fractional Indexing** เพื่อลดความจำเป็นในการ Update Position ของ Task หลายรายการ

Frontend คำนวณ Position จาก Task ที่อยู่ก่อนและหลังตำแหน่งที่ Drop แล้วส่งค่าใหม่มายัง Backend

**ย้ายไป Column อื่น**

```json
{
  "column_id": "uuid-of-target-column",
  "position": 1.5
}
```

**เปลี่ยนตำแหน่งภายใน Column เดิม**

```json
{
  "position": 2.5
}
```

**Response `200 OK`**

คืน Task ที่ถูกย้าย พร้อม Assignees และ Tags

**Validation Error**

```json
{
  "error": "Column does not belong to the same board."
}
```

```json
{
  "error": "position must be a number."
}
```

---

## 5. Tags

### GET `/boards/{board_id}/tags`

ดึงรายการ Tag ของ Board

### POST `/boards/{board_id}/tags`

สร้าง Tag ใหม่

**Request**

```json
{
  "name": "urgent",
  "color": "#ef4444"
}
```

**Response `201 Created`**

```json
{
  "id": "uuid",
  "board": "uuid",
  "name": "urgent",
  "color": "#ef4444"
}
```

### POST `/tasks/{task_id}/tags`

เพิ่ม Tag ให้กับ Task

**Request**

```json
{
  "tag_id": "uuid"
}
```

ระบบตรวจสอบว่า Tag ต้องเป็นของ Board เดียวกับ Task

### DELETE `/tasks/{task_id}/tags/{tag_id}`

นำ Tag ออกจาก Task

**Response:** `200 OK`

คืน Task พร้อมรายการ Tag ที่เหลือ

---

## 6. Assignees

### POST `/tasks/{task_id}/assignees`

กำหนดผู้รับผิดชอบ Task

**Request**

```json
{
  "user_id": "uuid"
}
```

หลังจาก Assign สำเร็จ ระบบจะสร้าง Notification ให้ผู้ใช้ที่ได้รับมอบหมายโดยอัตโนมัติ

```text
Type: assignment
Message:
คุณถูกมอบหมายงาน "<task.title>" ในบอร์ด "<board.name>"
```

**Response `200 OK`**

คืน Task พร้อมรายการ Assignees ล่าสุด

### DELETE `/tasks/{task_id}/assignees/{user_id}`

ยกเลิกการมอบหมาย Task ให้กับผู้ใช้

**Response:** `200 OK`

คืน Task พร้อม Assignees ที่เหลือ

---

## 7. Board Members

### GET `/boards/{board_id}/members`

ดึงรายการสมาชิกของ Board

**Response `200 OK`**

```json
[
  {
    "id": "uuid",
    "username": "numchai",
    "email": "numchai@example.com"
  }
]
```

### DELETE `/boards/{board_id}/members/{user_id}`

นำสมาชิกออกจาก Board

**Permission:** Owner เท่านั้น

ระบบไม่อนุญาตให้ Owner ลบตัวเองออกจาก Board

**Response:** `204 No Content`

---

## 8. Invitations

### POST `/boards/{board_id}/invite`

ส่งคำเชิญให้ผู้ใช้เข้าร่วม Board

**Permission:** Owner เท่านั้น

**Request**

```json
{
  "email": "friend@example.com",
  "role": "editor"
}
```

หาก Email เป็นผู้ใช้ที่มีบัญชีอยู่แล้ว ระบบจะสร้าง Notification เพื่อแจ้งเตือนโดยอัตโนมัติ

หากมี Invitation เดิมที่ยังอยู่ในสถานะ `pending` ระบบจะคืน Invitation เดิมแทนการสร้างรายการซ้ำ

**Response `201 Created`**

```json
{
  "id": "uuid",
  "board": "uuid",
  "board_name": "Process Dev",
  "email": "friend@example.com",
  "role": "editor",
  "status": "pending",
  "created_at": "..."
}
```

### GET `/api/v1/invitations/mine`

ดึง Invitation ที่ผู้ใช้ปัจจุบันได้รับและยังอยู่ในสถานะ `pending`

ระบบค้นหาจาก Email ของผู้ใช้

### POST `/invitations/{invitation_id}/accept`

ยอมรับ Invitation และเพิ่มผู้ใช้เข้าเป็นสมาชิกของ Board

**Response `200 OK`**

```json
{
  "id": "uuid",
  "name": "Process Dev",
  "message": "Joined board successfully"
}
```

ระบบตรวจสอบ:

* Invitation ต้องเป็นของผู้ใช้ที่กำลัง Login
* Invitation ต้องมีสถานะ `pending`
* Invitation ที่ถูกใช้แล้วหรือหมดอายุจะไม่สามารถ Accept ซ้ำได้

---

## 9. Notifications

### GET `/notifications`

ดึง Notification ของผู้ใช้ปัจจุบัน

* เรียงจากรายการใหม่ไปเก่า
* จำกัดสูงสุด 50 รายการ
* รองรับ Filter เฉพาะรายการที่ยังไม่ได้อ่าน

**Query Parameter**

```text
GET /notifications?unread=1
```

**Response `200 OK`**

```json
[
  {
    "id": "uuid",
    "type": "assignment",
    "message": "คุณถูกมอบหมายงาน \"ออกแบบ ER Diagram\" ในบอร์ด \"Process Dev\"",
    "task": "uuid-or-null",
    "task_title": "ออกแบบ ER Diagram",
    "is_read": false,
    "created_at": "..."
  }
]
```

### PATCH `/notifications/{notification_id}/read`

เปลี่ยนสถานะ Notification เป็นอ่านแล้ว

**Response `200 OK`**

```json
{
  "id": "uuid",
  "type": "assignment",
  "message": "...",
  "task": "uuid",
  "task_title": "ออกแบบ ER Diagram",
  "is_read": true,
  "created_at": "..."
}
```

### Frontend Notification Flow

Frontend ใช้ Polling เพื่อตรวจสอบ Notification ใหม่ทุก **5 วินาที**

* `useNotifications.js`
* Optimistic `markRead`
* Optimistic `markAllRead`
* แสดงจำนวน Unread ผ่าน Notification Badge
* แสดงสถานะผ่าน Notification Bell
