import math

from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from boards.models import (
    Board, BoardMember, Column, Role, Tag, Task, TaskAssignee, TaskTag, Invitation, Notification,
)
from boards.permissions import CanEditBoard, HasBoardAccess, IsBoardOwner
from boards.serializers import (
    BoardDetailSerializer, BoardSummarySerializer, BoardWriteSerializer,
    ColumnSerializer, ColumnWriteSerializer, InvitationCreateSerializer,
    InvitationSerializer, NotificationSerializer, TaskCreateSerializer,
    TaskSerializer, TagSerializer, UserBasicSerializer,
)


def _next_position(queryset):
    """Fractional-position helper: return last_position + 1 (or 0.0 when empty)."""
    last = queryset.order_by('position', 'created_at').last()
    return (last.position + 1.0) if last else 0.0


# ------------------------- Boards -------------------------

class BoardListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = BoardSummarySerializer

    def get_queryset(self):
        return Board.objects.filter(
            Q(owner=self.request.user) | Q(members__user=self.request.user)
        ).distinct().order_by('-created_at')

    def create(self, request, *args, **kwargs):
        # BoardSummarySerializer is read-only; write through BoardWriteSerializer
        # so the name/description the client sends actually persist.
        write_serializer = BoardWriteSerializer(data=request.data)
        write_serializer.is_valid(raise_exception=True)
        board = write_serializer.save(owner=request.user)
        BoardMember.objects.create(board=board, user=request.user, role=Role.OWNER)
        return Response(
            BoardSummarySerializer(board, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )


class BoardDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, CanEditBoard]
    queryset = Board.objects.all()
    lookup_url_kwarg = 'board_id'

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return BoardDetailSerializer
        return BoardWriteSerializer

    def get_permissions(self):
        # GET is allowed for any member; mutations need editor/owner (CanEditBoard).
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return super().get_permissions()

    def perform_destroy(self, instance):
        instance.soft_delete()


class BoardColumnListCreateView(generics.ListCreateAPIView):
    """GET board columns / POST a new column (auto position)."""
    permission_classes = [IsAuthenticated]
    serializer_class = ColumnSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return [IsAuthenticated(), CanEditBoard()]

    def get_board(self):
        return get_object_or_404(Board, pk=self.kwargs['board_id'])

    def get_queryset(self):
        return self.get_board().columns.all()

    def list(self, request, *args, **kwargs):
        self.check_object_permissions(request, self.get_board())
        return super().list(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        board = self.get_board()
        self.check_object_permissions(request, board)
        data = dict(request.data)
        data['board'] = str(board.id)
        serializer = ColumnWriteSerializer(data=data, context={'board': board})
        serializer.is_valid(raise_exception=True)
        try:
            column = serializer.save(board=board, position=_next_position(board.columns.all()))
        except IntegrityError:
            return Response({'name': ['A column with this name already exists in this board.']},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(ColumnSerializer(column).data, status=status.HTTP_201_CREATED)


class ColumnDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, CanEditBoard]
    queryset = Column.objects.select_related('board').all()
    lookup_url_kwarg = 'column_id'

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return super().get_permissions()

    def get_serializer_class(self):
        return ColumnSerializer if self.request.method == 'GET' else ColumnWriteSerializer


# ------------------------- Tasks -------------------------

class ColumnTaskListCreateView(generics.ListCreateAPIView):
    """GET column tasks / POST a new task (auto position)."""
    permission_classes = [IsAuthenticated]
    serializer_class = TaskCreateSerializer

    def get_column(self):
        return get_object_or_404(Column.objects.select_related('board'), pk=self.kwargs['column_id'])

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return [IsAuthenticated(), CanEditBoard()]

    def get_queryset(self):
        return self.get_column().tasks.select_related('column').prefetch_related(
            'assignees__user', 'tag_links__tag')

    def list(self, request, *args, **kwargs):
        self.check_object_permissions(request, self.get_column())
        return super().list(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        column = self.get_column()
        self.check_object_permissions(request, column)
        serializer = TaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = serializer.save(column=column, position=_next_position(column.tasks.all()))
        return Response(TaskSerializer(task).data, status=status.HTTP_201_CREATED)


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, CanEditBoard]
    queryset = Task.objects.select_related('column__board').all()
    lookup_url_kwarg = 'task_id'
    serializer_class = TaskCreateSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        task = self.get_object()
        return Response(TaskSerializer(task).data)


class TaskMoveView(generics.UpdateAPIView):
    """Move task to another column and/or set a fractional position.

    Body: {column_id?: uuid, position?: float}. position is computed by the
    frontend as the average of its new neighbours (fractional indexing).
    """
    permission_classes = [IsAuthenticated, CanEditBoard]
    queryset = Task.objects.select_related('column__board').all()
    lookup_url_kwarg = 'task_id'

    def patch(self, request, *args, **kwargs):
        task = self.get_object()
        self.check_object_permissions(request, task)
        column_id = request.data.get('column_id')
        position = request.data.get('position')

        moved_between_columns = False
        if column_id:
            new_column = get_object_or_404(Column, pk=column_id)
            if new_column.board_id != task.column.board_id:
                return Response({'error': 'Column does not belong to the same board.'},
                                status=status.HTTP_400_BAD_REQUEST)
            moved_between_columns = str(column_id) != str(task.column_id)
            task.column = new_column

        if position is not None:
            try:
                position = float(position)
            except (TypeError, ValueError):
                return Response({'error': 'position must be a number.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if not math.isfinite(position):
                return Response({'error': 'position must be a finite number.'},
                                status=status.HTTP_400_BAD_REQUEST)
            task.position = position
        elif moved_between_columns:
            task.position = _next_position(task.column.tasks.exclude(pk=task.pk).all())

        task.save(update_fields=['column', 'position', 'updated_at'])
        return Response(TaskSerializer(task).data)


# ------------------------- Tags & Assignees -------------------------

class BoardTagListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TagSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasBoardAccess()]
        return [IsAuthenticated(), CanEditBoard()]

    def get_board(self):
        return get_object_or_404(Board, pk=self.kwargs['board_id'])

    def get_queryset(self):
        return self.get_board().tags.all()

    def list(self, request, *args, **kwargs):
        self.check_object_permissions(request, self.get_board())
        return super().list(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        board = self.get_board()
        self.check_object_permissions(request, board)
        serializer = TagSerializer(data=request.data, context={'board': board})
        serializer.is_valid(raise_exception=True)
        try:
            tag = serializer.save(board=board)
        except IntegrityError:
            return Response({'name': ['A tag with this name already exists in this board.']},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(TagSerializer(tag).data, status=status.HTTP_201_CREATED)


class TaskTagChangeView(APIView):
    """POST /tasks/{id}/tags {tag_id} — assign a tag. (DELETE handled by sub-view.)"""
    permission_classes = [IsAuthenticated, CanEditBoard]

    def post(self, request, task_id):
        task = get_object_or_404(Task, pk=task_id)
        self.check_object_permissions(request, task)
        tag = get_object_or_404(Tag, pk=request.data.get('tag_id'))
        if tag.board_id != task.column.board_id:
            return Response({'error': 'Tag does not belong to this board.'},
                            status=status.HTTP_400_BAD_REQUEST)
        TaskTag.objects.get_or_create(task=task, tag=tag)
        return Response(TaskSerializer(task).data)


class TaskTagRemoveView(APIView):
    permission_classes = [IsAuthenticated, CanEditBoard]

    def delete(self, request, task_id, tag_id):
        task = get_object_or_404(Task, pk=task_id)
        self.check_object_permissions(request, task)
        TaskTag.objects.filter(task_id=task_id, tag_id=tag_id).delete()
        return Response(TaskSerializer(task).data)


class TaskAssigneeChangeView(APIView):
    """POST /tasks/{id}/assignees {user_id} — assign a user + notify them."""
    permission_classes = [IsAuthenticated, CanEditBoard]

    def post(self, request, task_id):
        task = get_object_or_404(
            Task.objects.select_related('column__board', 'column__board__owner'), pk=task_id)
        self.check_object_permissions(request, task)
        user = get_object_or_404(User, pk=request.data.get('user_id'))
        TaskAssignee.objects.get_or_create(task=task, user=user)
        Notification.objects.get_or_create(
            user=user,
            task=task,
            type=Notification.Type.ASSIGNMENT,
            defaults={
                'message': f'คุณถูกมอบหมายงาน "{task.title}" '
                           f'ในบอร์ด "{task.column.board.name}"',
            },
        )
        return Response(TaskSerializer(task).data)


class TaskAssigneeRemoveView(APIView):
    permission_classes = [IsAuthenticated, CanEditBoard]

    def delete(self, request, task_id, user_id):
        task = get_object_or_404(Task, pk=task_id)
        self.check_object_permissions(request, task)
        TaskAssignee.objects.filter(task_id=task_id, user_id=user_id).delete()
        return Response(TaskSerializer(task).data)


# ------------------------- Invitations -------------------------

class BoardInviteView(APIView):
    """POST /boards/{id}/invite {email, role} — owner only. Notifies existing users."""
    permission_classes = [IsAuthenticated, IsBoardOwner]

    def post(self, request, board_id):
        board = get_object_or_404(Board, pk=board_id)
        self.check_object_permissions(request, board)
        serializer = InvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].lower()
        existing, _ = Invitation.objects.get_or_create(
            board=board, email=email,
            defaults={'role': serializer.validated_data['role'],
                      'invited_by': request.user},
        )
        user = User.objects.filter(email=email).first()
        if user and existing.status == Invitation.Status.PENDING and \
                not BoardMember.objects.filter(board=board, user=user).exists():
            Notification.objects.get_or_create(
                user=user, type=Notification.Type.SYSTEM,
                defaults={'message': f'คุณได้รับคำเชิญเข้าร่วมบอร์ด "{board.name}"'},
            )
        return Response(InvitationSerializer(existing).data, status=status.HTTP_201_CREATED)


class InvitationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = InvitationSerializer

    def get_queryset(self):
        return Invitation.objects.filter(
            email=self.request.user.email, status=Invitation.Status.PENDING
        ).order_by('-created_at')


class InvitationAcceptView(APIView):
    """POST /invitations/{id}/accept — the invited account joins the board."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        invitation = get_object_or_404(
            Invitation.objects.select_related('board'), pk=pk)
        if invitation.email.lower() != request.user.email.lower():
            return Response({'error': 'This invitation is not for you.'},
                            status=status.HTTP_403_FORBIDDEN)
        if invitation.status != Invitation.Status.PENDING:
            return Response({'error': 'Invitation is no longer pending.'},
                            status=status.HTTP_400_BAD_REQUEST)
        invitation.status = Invitation.Status.ACCEPTED
        invitation.save(update_fields=['status'])
        BoardMember.objects.get_or_create(
            board=invitation.board, user=request.user,
            defaults={'role': invitation.role})
        board = invitation.board
        return Response({
            'id': str(board.id),
            'name': board.name,
            'message': 'Joined board successfully',
        }, status=status.HTTP_200_OK)


# ------------------------- Notifications -------------------------

class NotificationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = self.request.user.notifications.all()
        if self.request.query_params.get('unread') == '1':
            qs = qs.filter(is_read=False)
        return qs[:50]


class NotificationReadView(generics.UpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    lookup_url_kwarg = 'notification_id'

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def patch(self, request, *args, **kwargs):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)


class BoardMembersView(generics.ListAPIView):
    """GET /boards/{id}/members — list members with roles."""
    permission_classes = [IsAuthenticated, HasBoardAccess]
    serializer_class = UserBasicSerializer
    lookup_url_kwarg = 'board_id'

    def get_board(self):
        return get_object_or_404(Board, pk=self.kwargs['board_id'])

    def get_queryset(self):
        return User.objects.filter(board_memberships__board=self.get_board())

    def list(self, request, *args, **kwargs):
        self.check_object_permissions(request, self.get_board())
        return super().list(request, *args, **kwargs)


class BoardMemberRemoveView(APIView):
    """DELETE /boards/{id}/members/{user_id} — owner removes a member."""
    permission_classes = [IsAuthenticated, IsBoardOwner]

    def delete(self, request, board_id, user_id):
        board = get_object_or_404(Board, pk=board_id)
        self.check_object_permissions(request, board)
        if str(user_id) == str(board.owner_id):
            return Response({'error': 'Cannot remove the board owner.'},
                            status=status.HTTP_400_BAD_REQUEST)
        BoardMember.objects.filter(board=board, user_id=user_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)