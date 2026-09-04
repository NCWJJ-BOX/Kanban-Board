# Kanban-Board

A full-stack drag-and-drop kanban board — React + Vite frontend backed by a Django REST Framework API and PostgreSQL 16, orchestrated with Docker Compose.

## Features

- Drag-and-drop cards across columns and reorder cards within a column (@dnd-kit)
- Multiple boards, each with its own columns, cards, and tags
- Card tagging, assignees, and per-card detail editing
- Board member invitations (accept/decline) and member management
- Notifications for invitations and board activity
- JWT authentication (djangorestframework-simplejwt)
- Duplicate column/tag names are rejected with a clean `HTTP 400` field-level error — no more 500s
- The frontend blocks known-duplicate column names client-side (no duplicate request is ever sent) and shows the error inline in the add-column form
- Django admin at `/admin/` for superuser management

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19, Vite 8, @dnd-kit (core/sortable/utilities), react-router-dom 7, axios, oxlint |
| Backend    | Django 6, Django REST Framework, SimpleJWT, django-cors-headers |
| Database   | PostgreSQL 16 |
| Tooling    | Docker Compose, pgAdmin 4 (web UI) |

## Project Structure

```
Kanban-Board/
├── backend/                 # Django REST Framework API
│   ├── config/              # Project settings + root URL config (admin/ + api/v1/)
│   ├── accounts/            # User accounts + JWT auth endpoints
│   ├── boards/              # Boards, columns, tasks, tags, invitations, notifications
│   │   ├── models.py        # Data models (incl. per-board unique column/tag names)
│   │   ├── serializers.py   # Validation (duplicate name → 400 field errors)
│   │   ├── views.py         # API views (incl. IntegrityError → 400 race guard)
│   │   ├── urls.py          # /api/v1/ endpoint map
│   │   └── permissions.py   # Board membership permissions
│   ├── manage.py
│   └── requirements.txt
├── frontend/                # React + Vite SPA
│   └── src/
│       ├── api.js           # Axios instance (JWT, base URL)
│       ├── auth.jsx         # Auth context
│       ├── components/      # Reusable UI components
│       ├── hooks/           # Custom hooks
│       └── pages/           # Route pages (Board, Kanban board view, auth, ...)
├── docs/                    # Design docs (API design, ER diagram, performance)
├── docker-compose.yml       # db + backend + pgadmin + frontend orchestration
└── README.md
```

## Architecture / Services

- **db** — PostgreSQL 16, exposed on host `5432`, named volume `pgdata`, healthchecked with `pg_isready`
- **backend** — Django/DRF API, exposed on host `8000`, `./backend` mounted live into the container
- **pgadmin** — pgAdmin 4 web UI, exposed on host `5050` (default login `admin@kanban.dev` / `admin`)
- **frontend** — builds and serves the production bundle via `npm run preview`, exposed on host `5174` (container port `5173`); proxies API calls to `http://backend:8000`

## Setup

```bash
git clone https://github.com/NCWJJ-BOX/Kanban-Board.git
cd Kanban-Board
docker compose up --build
```

Environment defaults (all overridable via a `.env` file or shell):

| Variable               | Default          |
|------------------------|------------------|
| `POSTGRES_DB`          | `kanban`         |
| `POSTGRES_USER`        | `kanban`         |
| `POSTGRES_PASSWORD`    | `kanban`         |
| `PGADMIN_EMAIL`        | `admin@kanban.dev` |
| `PGADMIN_PASSWORD`     | `admin`          |

Create a Django superuser to access `http://localhost:5050` (pgAdmin) and `http://localhost:8000/admin/`:

```bash
docker compose exec backend python manage.py createsuperuser
```

## URLs

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5174      |
| Backend  | http://localhost:8000      |
| Admin    | http://localhost:8000/admin/ |
| pgAdmin  | http://localhost:5050      |

## API

All endpoints live under `/api/v1/` (no trailing slashes). Authentication via JWT (`Authorization: Bearer <token>`).

**Auth (accounts)**
- `POST /api/v1/auth/login` / `POST /api/v1/auth/refresh` — obtain / refresh JWT tokens

**Boards**
- `GET /api/v1/boards` — list boards
- `POST /api/v1/boards` — create a board
- `GET /api/v1/boards/{board_id}` — board detail (with columns, tags, members)
- `POST /api/v1/boards/{board_id}/columns` — add a column *(duplicate names → `400` field error)*
- `POST /api/v1/boards/{board_id}/tags` — add a tag *(duplicate names → `400` field error)*
- `POST /api/v1/boards/{board_id}/invite` — invite a member
- `GET /api/v1/boards/{board_id}/members` / `DELETE /api/v1/boards/{board_id}/members/{user_id}`

**Columns**
- `PATCH/DELETE /api/v1/columns/{column_id}`
- `POST /api/v1/columns/{column_id}/tasks` — add a task to a column

**Tasks**
- `GET/PATCH/DELETE /api/v1/tasks/{task_id}`
- `POST /api/v1/tasks/{task_id}/move` — move between columns / reorder
- `POST/DELETE /api/v1/tasks/{task_id}/tags[/{tag_id}]` — tag management
- `POST/DELETE /api/v1/tasks/{task_id}/assignees[/{user_id}]` — assignee management

**Invitations & Notifications**
- `GET /api/v1/invitations/mine` — my pending invitations
- `POST /api/v1/invitations/{id}/accept` — accept an invitation
- `GET /api/v1/notifications` — list notifications
- `POST /api/v1/notifications/{notification_id}/read` — mark as read

## Notes & Troubleshooting

- **Duplicate column/tag names** — the API enforces per-board uniqueness and returns a clean `HTTP 400` with a field error message (no more `IntegrityError` → 500). The frontend additionally blocks known-duplicate column names *before* sending a request, so the browser never fires a 400-producing POST; the server-side check remains as a backstop for races. The error is shown inline in the add-column form and clears when you type or the board reloads.
- **Frontend is a production build** — the `frontend` service runs `npm run preview` (Vite preview server) against the built bundle, not the dev server. Rebuild after frontend changes: `docker compose exec frontend npm run build && docker compose restart frontend`.
- **Live backend reload** — `./backend` is bind-mounted into the container, so backend code changes hot-reload via Django's runserver.
- **First login** — the API returns `401` for unauthenticated requests; log in first to obtain a JWT.