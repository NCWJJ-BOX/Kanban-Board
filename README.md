# Kanban-Board

ระบบ **Kanban Board แบบ Full-Stack** สำหรับจัดการงานด้วยการลากและวาง (Drag-and-Drop) พัฒนาด้วย **Python + Django REST Framework** สำหรับ Backend API, **React + Vite** สำหรับ Frontend และ **PostgreSQL 16** สำหรับฐานข้อมูล โดยใช้ **Docker Compose** สำหรับจัดการ Services ของระบบ

## ฟีเจอร์หลัก

* รองรับการลากและวางการ์ดข้าม Column และจัดลำดับการ์ดภายใน Column ด้วย `@dnd-kit`
* รองรับการสร้างและจัดการหลาย Board โดยแต่ละ Board มี Column, Card และ Tag เป็นของตัวเอง
* รองรับการเพิ่ม Tag, กำหนดผู้รับผิดชอบ (Assignee) และแก้ไขรายละเอียดของ Card
* รองรับการเชิญสมาชิกเข้า Board พร้อมการยอมรับหรือปฏิเสธคำเชิญ
* รองรับการจัดการสมาชิกภายใน Board
* มีระบบ Notification สำหรับการเชิญสมาชิกและกิจกรรมที่เกี่ยวข้องกับ Board
* รองรับ JWT Authentication ผ่าน `djangorestframework-simplejwt`
* รองรับ Django Admin ที่ `/admin/` สำหรับการจัดการระบบโดย Superuser

## Tech Stack

| Layer               | Technology                                                                              |
| ------------------- | --------------------------------------------------------------------------------------- |
| **Backend**         | **Python 3, Django 6, Django REST Framework, SimpleJWT, django-cors-headers**           |
| Frontend            | React 19, Vite 8, @dnd-kit (core/sortable/utilities), react-router-dom 7, Axios, Oxlint |
| Database            | PostgreSQL 16                                                                           |
| Containerization    | Docker, Docker Compose                                                                  |
| Database Management | pgAdmin 4                                                                               |

## Python Backend

Backend พัฒนาด้วย **Python 3 และ Django REST Framework** โดยรับผิดชอบ REST API, Authentication, Authorization, Data Validation และ Business Logic ของระบบ

โครงสร้าง Backend หลักแบ่งออกเป็น:

* `accounts/` — จัดการ User และ JWT Authentication
* `boards/` — จัดการ Board, Column, Task, Tag, Member, Invitation และ Notification
* `models.py` — กำหนด Data Models และ Database Constraints
* `serializers.py` — Validation และการแปลงข้อมูลระหว่าง JSON กับ Django Models
* `views.py` — จัดการ HTTP Request/Response และ Business Logic
* `permissions.py` — ตรวจสอบสิทธิ์ตาม Membership และ Role ของ Board
* `urls.py` — กำหนด Routing ของ REST API

### Backend Flow

```text
HTTP Request
     │
     ▼
Django REST Framework
     │
     ├── JWT Authentication
     ├── Permission Check
     ├── Serializer Validation
     ├── Business Logic
     │
     ▼
Django ORM
     │
     ▼
PostgreSQL 16
```

## โครงสร้างโปรเจกต์

```text
Kanban-Board/
├── backend/                     # Python + Django REST Framework
│   ├── config/                  # Django Project Configuration
│   │   └── ...                  # Settings และ Root URL
│   │
│   ├── accounts/                # User และ JWT Authentication
│   │   └── ...
│   │
│   ├── boards/                  # Kanban Business Logic
│   │   ├── models.py            # Data Models และ Constraints
│   │   ├── serializers.py       # Validation / Serialization
│   │   ├── views.py             # REST API Views
│   │   ├── permissions.py       # Board Access Control
│   │   └── urls.py              # API Routes
│   │
│   ├── manage.py
│   └── requirements.txt         # Python Dependencies
│
├── frontend/                    # React + Vite SPA
│   └── src/
│       ├── api.js               # Axios Instance และ JWT
│       ├── auth.jsx             # Authentication Context
│       ├── components/          # Reusable UI Components
│       ├── hooks/               # Custom Hooks
│       └── pages/               # Application Pages
│
├── docs/                        # API Design, ER Diagram และ Performance
├── docker-compose.yml           # Docker Services
└── README.md
```

## Architecture / Services

ระบบประกอบด้วย 4 Services ที่จัดการผ่าน Docker Compose:

* **db** — PostgreSQL 16 สำหรับจัดเก็บข้อมูล เปิดใช้งาน Port `5432` บน Host ใช้ Named Volume `pgdata` และมี Health Check ผ่าน `pg_isready`
* **backend** — Python + Django REST Framework API เปิดใช้งาน Port `8000` และ Mount โฟลเดอร์ `./backend` แบบ Bind Mount เพื่อรองรับการแก้ไข Backend Code ระหว่างการพัฒนา
* **pgAdmin** — Web UI สำหรับจัดการ PostgreSQL เปิดใช้งาน Port `5050`
* **frontend** — React Application ที่ Build เป็น Production Bundle และให้บริการผ่าน Vite Preview Server โดยเปิด Port `5174` บน Host และ Port `5173` ภายใน Container

Frontend ติดต่อ Backend ผ่าน Docker Network โดยใช้:

```text
http://backend:8000
```

## การติดตั้งและเริ่มต้นใช้งาน

```bash
git clone https://github.com/NCWJJ-BOX/Kanban-Board.git
cd Kanban-Board
docker compose up --build
```

### Environment Variables

สามารถกำหนดค่า Environment Variables ผ่านไฟล์ `.env` หรือ Shell Environment ได้

| Variable            | Default            |
| ------------------- | ------------------ |
| `POSTGRES_DB`       | `kanban`           |
| `POSTGRES_USER`     | `kanban`           |
| `POSTGRES_PASSWORD` | `kanban`           |
| `PGADMIN_EMAIL`     | `admin@kanban.dev` |
| `PGADMIN_PASSWORD`  | `admin`            |

### สร้าง Django Superuser

```bash
docker compose exec backend python manage.py createsuperuser
```

หลังจากสร้าง Superuser แล้ว สามารถเข้าใช้งานได้ที่:

* Django Admin: `http://localhost:8000/admin/`
* pgAdmin: `http://localhost:5050`

## URLs

| Service      | URL                            |
| ------------ | ------------------------------ |
| Frontend     | `http://localhost:5174`        |
| Backend      | `http://localhost:8000`        |
| Django Admin | `http://localhost:8000/admin/` |
| pgAdmin      | `http://localhost:5050`        |

## API

API ทั้งหมดอยู่ภายใต้:

```text
/api/v1/
```

ระบบใช้ JWT Authentication โดยส่ง Access Token ผ่าน HTTP Header:

```http
Authorization: Bearer <token>
```

### Authentication

* `POST /api/v1/auth/login` — เข้าสู่ระบบและรับ JWT Tokens
* `POST /api/v1/auth/refresh` — ขอ Access Token ใหม่จาก Refresh Token

### Boards

* `GET /api/v1/boards` — ดึงรายการ Board
* `POST /api/v1/boards` — สร้าง Board
* `GET /api/v1/boards/{board_id}` — ดึงรายละเอียด Board พร้อม Column, Tag และ Member
* `POST /api/v1/boards/{board_id}/columns` — เพิ่ม Column
* `POST /api/v1/boards/{board_id}/tags` — เพิ่ม Tag
* `POST /api/v1/boards/{board_id}/invite` — เชิญสมาชิกเข้า Board
* `GET /api/v1/boards/{board_id}/members` — ดึงรายชื่อสมาชิก
* `DELETE /api/v1/boards/{board_id}/members/{user_id}` — นำสมาชิกออกจาก Board

### Columns

* `PATCH /api/v1/columns/{column_id}` — แก้ไข Column
* `DELETE /api/v1/columns/{column_id}` — ลบ Column
* `POST /api/v1/columns/{column_id}/tasks` — เพิ่ม Task ใน Column

### Tasks

* `GET /api/v1/tasks/{task_id}` — ดึงรายละเอียด Task
* `PATCH /api/v1/tasks/{task_id}` — แก้ไข Task
* `DELETE /api/v1/tasks/{task_id}` — ลบ Task
* `POST /api/v1/tasks/{task_id}/move` — ย้าย Task ระหว่าง Column หรือเปลี่ยนลำดับ
* `POST /api/v1/tasks/{task_id}/tags` — เพิ่ม Tag ให้ Task
* `DELETE /api/v1/tasks/{task_id}/tags/{tag_id}` — ลบ Tag ออกจาก Task
* `POST /api/v1/tasks/{task_id}/assignees` — เพิ่มผู้รับผิดชอบ
* `DELETE /api/v1/tasks/{task_id}/assignees/{user_id}` — ยกเลิกผู้รับผิดชอบ

### Invitations & Notifications

* `GET /api/v1/invitations/mine` — ดึงคำเชิญที่รอดำเนินการของผู้ใช้
* `POST /api/v1/invitations/{id}/accept` — ยอมรับคำเชิญ
* `GET /api/v1/notifications` — ดึงรายการ Notification
* `POST /api/v1/notifications/{notification_id}/read` — เปลี่ยน Notification เป็นอ่านแล้ว



### Frontend Production Build

Frontend ใช้:

```bash
npm run preview
```

เพื่อให้บริการ Production Bundle ผ่าน Vite Preview Server

หากมีการแก้ไข Frontend ให้ Build ใหม่ด้วย:

```bash
docker compose up -d
```



