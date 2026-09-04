"""Invalidate board detail cache whenever a board's data changes."""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from boards.cache import bump_board
from boards.models import (
    Board, BoardMember, Column, Tag, Task, TaskAssignee, TaskTag,
)


def _board_id_of_task(instance):
    """Board id for a task/join-row instance, tolerating cascade deletes.

    post_delete of a cascaded child fires after its parent row is gone, so use
    the pre-loaded *_id attribute and swallow the lookup miss.
    """
    task_id = instance.task_id
    try:
        return Task.objects.values_list('column__board_id', flat=True).get(pk=task_id)
    except Task.DoesNotExist:
        return None


def _board_id_of_column(instance):
    try:
        return Column.objects.values_list('board_id', flat=True).get(pk=instance.column_id)
    except Column.DoesNotExist:
        return None


@receiver([post_save, post_delete], sender=Board)
def _board_changed(sender, instance, **kwargs):
    bump_board(instance.id)


@receiver([post_save, post_delete], sender=Column)
def _column_changed(sender, instance, **kwargs):
    bump_board(instance.board_id)


@receiver([post_save, post_delete], sender=Task)
def _task_changed(sender, instance, **kwargs):
    board_id = _board_id_of_column(instance)
    if board_id:
        bump_board(board_id)


@receiver([post_save, post_delete], sender=Tag)
def _tag_changed(sender, instance, **kwargs):
    bump_board(instance.board_id)


@receiver([post_save, post_delete], sender=BoardMember)
def _member_changed(sender, instance, **kwargs):
    bump_board(instance.board_id)


@receiver([post_save, post_delete], sender=TaskTag)
def _task_tag_changed(sender, instance, **kwargs):
    board_id = _board_id_of_task(instance)
    if board_id:
        bump_board(board_id)


@receiver([post_save, post_delete], sender=TaskAssignee)
def _task_assignee_changed(sender, instance, **kwargs):
    board_id = _board_id_of_task(instance)
    if board_id:
        bump_board(board_id)