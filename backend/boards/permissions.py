"""Role-based permission helpers + DRF permission classes for boards."""
from rest_framework.permissions import BasePermission

from boards.models import Board, BoardMember, Column, Role, Task


def get_board_for_object(obj):
    """Resolve the owning Board for any nested object (column/task)."""
    if isinstance(obj, Board):
        return obj
    if isinstance(obj, Column):
        return obj.board
    if isinstance(obj, Task):
        return obj.column.board
    return None


def get_user_role_on_board(user, board):
    """Return the role string ('owner'/'editor'/'viewer') or None."""
    if not user.is_authenticated:
        return None
    if board.owner_id == user.id:
        return Role.OWNER
    member = BoardMember.objects.filter(board=board, user=user).first()
    return member.role if member else None


class HasBoardAccess(BasePermission):
    """Can read the board — owner or any board member."""

    def has_object_permission(self, request, view, obj):
        board = get_board_for_object(obj)
        return get_user_role_on_board(request.user, board) is not None


class CanEditBoard(BasePermission):
    """Can modify board contents — owner or editor.
    Renaming/deleting the Board itself is owner-only."""
    message = 'You need editor (or owner) permission.'

    def has_object_permission(self, request, view, obj):
        board = get_board_for_object(obj)
        role = get_user_role_on_board(request.user, board)
        if role == Role.OWNER:
            return True
        if request.method in ('PATCH', 'DELETE') and isinstance(board, Board):
            return False
        return role == Role.EDITOR


class IsBoardOwner(BasePermission):
    message = 'Only the board owner can do this.'

    def has_object_permission(self, request, view, obj):
        board = get_board_for_object(obj)
        return request.user.is_authenticated and board.owner_id == request.user.id