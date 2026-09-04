"""Per-user cache helpers for BoardDetailView.

The board detail payload is per-user (role depends on the requester), so cache
keys include both a board "version" token and the user id. Any mutation bumps
the board version; readers that hit a stale version simply recompute and re-cache,
so no explicit key enumeration / delete_pattern is needed (works on both Redis
and the LocMem dev fallback).
"""
from uuid import uuid4

from django.core.cache import cache

DEFAULT_TTL = 60 * 5

VERSION_KEY = 'board_ver:{board_id}'
DETAIL_KEY = 'board_detail:{board_id}:{version}:{user_id}'


def _board_version(board_id):
    key = VERSION_KEY.format(board_id=board_id)
    version = cache.get(key)
    if version is None:
        version = uuid4().hex
        cache.set(key, version, None)
    return version


def get_board_detail(board_id, user_id):
    data = cache.get(DETAIL_KEY.format(
        board_id=board_id, version=_board_version(board_id), user_id=user_id))
    return data


def set_board_detail(board_id, user_id, data):
    cache.set(
        DETAIL_KEY.format(board_id=board_id, version=_board_version(board_id), user_id=user_id),
        data, DEFAULT_TTL)


def bump_board(board_id):
    """Invalidate all per-user cached views of a board."""
    cache.delete(VERSION_KEY.format(board_id=board_id))