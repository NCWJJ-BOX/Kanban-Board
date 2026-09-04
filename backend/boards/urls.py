from django.urls import path
from boards.views import (
    BoardColumnListCreateView, BoardDetailView, BoardInviteView, BoardListCreateView,
    BoardMemberRemoveView, BoardMembersView, BoardTagListCreateView,
    ColumnDetailView, ColumnTaskListCreateView, InvitationAcceptView, InvitationListView, InvitationRejectView, InvitationRejectView,
    NotificationListView, NotificationReadView, TaskAssigneeChangeView, TaskAssigneeRemoveView,
    TaskDetailView, TaskMoveView, TaskTagChangeView, TaskTagRemoveView,
)

urlpatterns = [
    # Boards
    path('boards', BoardListCreateView.as_view(), name='board-list'),
    path('boards/<uuid:board_id>', BoardDetailView.as_view(), name='board-detail'),
    path('boards/<uuid:board_id>/columns', BoardColumnListCreateView.as_view(), name='column-list-create'),
    path('boards/<uuid:board_id>/tags', BoardTagListCreateView.as_view(), name='tag-list-create'),
    path('boards/<uuid:board_id>/invite', BoardInviteView.as_view(), name='board-invite'),
    path('boards/<uuid:board_id>/members', BoardMembersView.as_view(), name='board-members'),
    path('boards/<uuid:board_id>/members/<uuid:user_id>', BoardMemberRemoveView.as_view(), name='board-member-remove'),

    # Columns
    path('columns/<uuid:column_id>', ColumnDetailView.as_view(), name='column-detail'),
    path('columns/<uuid:column_id>/tasks', ColumnTaskListCreateView.as_view(), name='task-list-create'),

    # Tasks
    path('tasks/<uuid:task_id>', TaskDetailView.as_view(), name='task-detail'),
    path('tasks/<uuid:task_id>/move', TaskMoveView.as_view(), name='task-move'),
    path('tasks/<uuid:task_id>/tags', TaskTagChangeView.as_view(), name='task-tag-add'),
    path('tasks/<uuid:task_id>/tags/<uuid:tag_id>', TaskTagRemoveView.as_view(), name='task-tag-remove'),
    path('tasks/<uuid:task_id>/assignees', TaskAssigneeChangeView.as_view(), name='task-assignee-add'),
    path('tasks/<uuid:task_id>/assignees/<uuid:user_id>', TaskAssigneeRemoveView.as_view(), name='task-assignee-remove'),

    # Invitations
    path('invitations/mine', InvitationListView.as_view(), name='invitation-list'),
    path('invitations/<uuid:pk>/accept', InvitationAcceptView.as_view(), name='invitation-accept'),
    path('invitations/<uuid:pk>/reject', InvitationRejectView.as_view(), name='invitation-reject'),

    # Notifications
    path('notifications', NotificationListView.as_view(), name='notification-list'),
    path('notifications/<uuid:notification_id>/read', NotificationReadView.as_view(), name='notification-read'),
]