from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from boards.models import Invitation, Notification


PASSWORD = 'password123'


class BoardApiTests(APITestCase):
    def make_user(self, username, email):
        return User.objects.create_user(username=username, email=email, password=PASSWORD)

    def authenticate(self, user):
        self.client.force_authenticate(user)
        return user

    def create_board(self, owner, name='Sprint 24', description='Team board'):
        self.client.force_authenticate(owner)
        resp = self.client.post(
            '/api/v1/boards',
            {'name': name, 'description': description},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data

    def add_column(self, board_id, name):
        resp = self.client.post(
            f'/api/v1/boards/{board_id}/columns', {'name': name}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        return resp.data

    # ---- basics ----
    def test_unauthenticated_requests_rejected(self):
        resp = self.client.get('/api/v1/boards')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_boards_visible_to_owner(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        listing = self.client.get('/api/v1/boards')
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertTrue(any(str(b['id']) == str(board['id']) for b in listing.data))
        self.assertEqual(str(board['owner']), str(owner.id))
        self.assertEqual(board['role'], 'owner')
        # board detail comes with empty columns + tags
        detail = self.client.get(f"/api/v1/boards/{board['id']}")
        self.assertEqual(detail.data['columns'], [])
        self.assertEqual(detail.data['tags'], [])

    def test_board_create_persists_name_and_description(self):
        owner = self.make_user('alice', 'alice@test.dev')
        self.client.force_authenticate(owner)
        resp = self.client.post(
            '/api/v1/boards',
            {'name': 'Probe Board', 'description': 'Some notes'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertEqual(resp.data['name'], 'Probe Board')
        self.assertEqual(resp.data['description'], 'Some notes')
        # and the persisted row carries it too
        detail = self.client.get(f"/api/v1/boards/{resp.data['id']}")
        self.assertEqual(detail.data['name'], 'Probe Board')

    def test_board_soft_delete_hides_it(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        resp = self.client.delete(f"/api/v1/boards/{board['id']}")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        listing = self.client.get('/api/v1/boards')
        self.assertFalse(any(str(b['id']) == str(board['id']) for b in listing.data))
        detail = self.client.get(f"/api/v1/boards/{board['id']}")
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    # ---- columns & tasks ----
    def test_columns_get_sequential_positions(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        positions = []
        for name in ('Todo', 'Doing', 'Done'):
            col = self.add_column(board['id'], name)
            positions.append(col['position'])
        self.assertEqual(positions, [0.0, 1.0, 2.0])

    def test_task_create_validates_title(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        col = self.add_column(board['id'], 'Todo')
        bad = self.client.post(
            f"/api/v1/columns/{col['id']}/tasks", {'title': '   '}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        good = self.client.post(
            f"/api/v1/columns/{col['id']}/tasks",
            {'title': 'Design API', 'description': 'OpenAPI spec'},
            format='json')
        self.assertEqual(good.status_code, status.HTTP_201_CREATED)
        self.assertEqual(good.data['position'], 0.0)
        self.assertEqual(str(good.data['column']), str(col['id']))

    def test_move_task_between_columns(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        todo = self.add_column(board['id'], 'Todo')
        doing = self.add_column(board['id'], 'Doing')
        t1 = self.client.post(
            f"/api/v1/columns/{todo['id']}/tasks", {'title': 'T1'}, format='json').data
        t2 = self.client.post(
            f"/api/v1/columns/{todo['id']}/tasks", {'title': 'T2'}, format='json').data
        # auto position on cross-column move
        moved = self.client.patch(
            f"/api/v1/tasks/{t1['id']}/move", {'column_id': doing['id']}, format='json')
        self.assertEqual(moved.status_code, status.HTTP_200_OK)
        self.assertEqual(str(moved.data['column']), str(doing['id']))
        # explicit fractional position
        moved2 = self.client.patch(
            f"/api/v1/tasks/{t2['id']}/move",
            {'column_id': doing['id'], 'position': 0.5},
            format='json')
        self.assertEqual(moved2.data['position'], 0.5)

    def test_move_task_invalid_position_returns_400(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        col = self.add_column(board['id'], 'Todo')
        task = self.client.post(
            f"/api/v1/columns/{col['id']}/tasks", {'title': 'T'}, format='json').data
        bad = self.client.patch(
            f"/api/v1/tasks/{task['id']}/move", {'position': 'abc'}, format='json')
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        # task position unchanged, still movable with a valid number
        ok = self.client.patch(
            f"/api/v1/tasks/{task['id']}/move", {'position': 0.5}, format='json')
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.assertEqual(ok.data['position'], 0.5)

    def test_move_to_column_of_another_board_rejected(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board_a = self.create_board(owner, name='A')
        board_b = self.create_board(owner, name='B')
        col_a = self.add_column(board_a['id'], 'Todo')
        col_b = self.add_column(board_b['id'], 'X')
        task = self.client.post(
            f"/api/v1/columns/{col_a['id']}/tasks", {'title': 'T'}, format='json').data
        resp = self.client.patch(
            f"/api/v1/tasks/{task['id']}/move", {'column_id': col_b['id']}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- tags ----
    def test_tag_assign_remove_flow(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        col = self.add_column(board['id'], 'Todo')
        task = self.client.post(
            f"/api/v1/columns/{col['id']}/tasks", {'title': 'T'}, format='json').data
        tag = self.client.post(
            f"/api/v1/boards/{board['id']}/tags",
            {'name': 'urgent', 'color': '#ef4444'},
            format='json')
        self.assertEqual(tag.status_code, status.HTTP_201_CREATED)
        added = self.client.post(
            f"/api/v1/tasks/{task['id']}/tags", {'tag_id': tag.data['id']}, format='json')
        self.assertEqual(added.status_code, status.HTTP_200_OK)
        self.assertEqual([str(t['id']) for t in added.data['tags']], [str(tag.data['id'])])
        removed = self.client.delete(
            f"/api/v1/tasks/{task['id']}/tags/{tag.data['id']}")
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        self.assertEqual(removed.data['tags'], [])

    # ---- assignees + notifications ----
    def test_assignee_gets_notification(self):
        owner = self.make_user('alice', 'alice@test.dev')
        bob = self.make_user('bob', 'bob@test.dev')
        board = self.create_board(owner)
        col = self.add_column(board['id'], 'Todo')
        task = self.client.post(
            f"/api/v1/columns/{col['id']}/tasks", {'title': 'Design API'}, format='json').data
        assigned = self.client.post(
            f"/api/v1/tasks/{task['id']}/assignees",
            {'user_id': str(bob.id)},
            format='json')
        self.assertEqual(assigned.status_code, status.HTTP_200_OK)
        self.assertEqual([str(a['id']) for a in assigned.data['assignees']], [str(bob.id)])

        self.client.force_authenticate(bob)
        notifs = self.client.get('/api/v1/notifications')
        self.assertEqual(notifs.status_code, status.HTTP_200_OK)
        self.assertEqual(len(notifs.data), 1)
        self.assertIn('Design API', notifs.data[0]['message'])
        nid = notifs.data[0]['id']

        read = self.client.patch(f'/api/v1/notifications/{nid}/read')
        self.assertEqual(read.status_code, status.HTTP_200_OK)
        unread = self.client.get('/api/v1/notifications?unread=1')
        self.assertEqual(len(unread.data), 0)

    # ---- invitations ----
    def test_invite_accept_gives_editor_access(self):
        owner = self.make_user('alice', 'alice@test.dev')
        bob = self.make_user('bob', 'bob@test.dev')
        board = self.create_board(owner)

        inv = self.client.post(
            f"/api/v1/boards/{board['id']}/invite",
            {'email': 'bob@test.dev', 'role': 'editor'},
            format='json')
        self.assertEqual(inv.status_code, status.HTTP_201_CREATED)

        # bob sees a pending invitation + a system notification
        self.client.force_authenticate(bob)
        invites = self.client.get('/api/v1/invitations/mine')
        self.assertEqual(len(invites.data), 1)
        self.assertEqual(Notification.objects.filter(user=bob).count(), 1)

        accept = self.client.post(f"/api/v1/invitations/{invites.data[0]['id']}/accept")
        self.assertEqual(accept.status_code, status.HTTP_200_OK)

        boards = self.client.get('/api/v1/boards')
        self.assertTrue(any(str(b['id']) == str(board['id']) for b in boards.data))

    def test_editor_permission_matrix(self):
        owner = self.make_user('alice', 'alice@test.dev')
        bob = self.make_user('bob', 'bob@test.dev')
        board = self.create_board(owner)
        self.client.force_authenticate(owner)
        self.client.post(
            f"/api/v1/boards/{board['id']}/invite",
            {'email': 'bob@test.dev', 'role': 'editor'},
            format='json')
        self.client.force_authenticate(bob)
        self.client.post(f"/api/v1/invitations/{Invitation.objects.get().id}/accept")

        # editor CAN add a column
        col_resp = self.client.post(
            f"/api/v1/boards/{board['id']}/columns", {'name': 'Review'}, format='json')
        self.assertEqual(col_resp.status_code, status.HTTP_201_CREATED)
        # editor CANNOT rename/delete the board itself
        patch_resp = self.client.patch(
            f"/api/v1/boards/{board['id']}", {'name': 'Hijack'}, format='json')
        self.assertEqual(patch_resp.status_code, status.HTTP_403_FORBIDDEN)
        # editor CANNOT remove a member
        remove_resp = self.client.delete(
            f"/api/v1/boards/{board['id']}/members/{bob.id}")
        self.assertEqual(remove_resp.status_code, status.HTTP_403_FORBIDDEN)
        # editor CAN add + assign a task
        task = self.client.post(
            f"/api/v1/columns/{col_resp.data['id']}/tasks", {'title': 'By editor'}, format='json')
        self.assertEqual(task.status_code, status.HTTP_201_CREATED)
        assign = self.client.post(
            f"/api/v1/tasks/{task.data['id']}/assignees",
            {'user_id': str(bob.id)},
            format='json')
        self.assertEqual(assign.status_code, status.HTTP_200_OK)

        # owner CAN update the board
        self.client.force_authenticate(owner)
        ok = self.client.patch(
            f"/api/v1/boards/{board['id']}", {'name': 'Sprint 24 rev'}, format='json')
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

    def test_viewer_cannot_edit(self):
        owner = self.make_user('alice', 'alice@test.dev')
        viewer = self.make_user('carol', 'carol@test.dev')
        board = self.create_board(owner)
        self.client.force_authenticate(owner)
        self.client.post(
            f"/api/v1/boards/{board['id']}/invite",
            {'email': 'carol@test.dev', 'role': 'viewer'},
            format='json')
        self.client.force_authenticate(viewer)
        self.client.post(f"/api/v1/invitations/{Invitation.objects.get().id}/accept")

        # viewer can read
        detail = self.client.get(f"/api/v1/boards/{board['id']}")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        # viewer cannot add a column
        col = self.client.post(
            f"/api/v1/boards/{board['id']}/columns", {'name': 'X'}, format='json')
        self.assertEqual(col.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_cannot_remove_owner(self):
        owner = self.make_user('alice', 'alice@test.dev')
        board = self.create_board(owner)
        resp = self.client.delete(
            f"/api/v1/boards/{board['id']}/members/{owner.id}")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)