from django.contrib import admin
from boards.models import (
    Board, BoardMember, Column, Task, Tag, TaskTag, TaskAssignee, Invitation, Notification,
)


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'created_at', 'deleted_at')
    list_filter = ('deleted_at',)


@admin.register(BoardMember)
class BoardMemberAdmin(admin.ModelAdmin):
    list_display = ('board', 'user', 'role')


@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ('name', 'board', 'position')


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'column', 'position')


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'board', 'color')


@admin.register(TaskTag)
class TaskTagAdmin(admin.ModelAdmin):
    list_display = ('task', 'tag')


@admin.register(TaskAssignee)
class TaskAssigneeAdmin(admin.ModelAdmin):
    list_display = ('task', 'user')


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ('email', 'board', 'role', 'status')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'type', 'message', 'is_read')