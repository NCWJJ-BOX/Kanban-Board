from rest_framework import serializers

from accounts.models import User
from boards.models import (
    Board, BoardMember, Column, Tag, Task, TaskAssignee, TaskTag, Invitation, Notification,
)


class UserBasicSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'board', 'name', 'color']
        read_only_fields = ['id', 'board']

    def validate_color(self, value):
        if not (len(value) == 7 and value.startswith('#')):
            raise serializers.ValidationError('Color must be a hex value like #6366f1')
        return value

    def validate(self, attrs):
        name = attrs.get('name', '').strip()
        attrs['name'] = name
        if not name:
            raise serializers.ValidationError({'name': 'Name is required.'})
        board_id = self.instance.board_id if self.instance else self.context['board'].pk
        qs = Tag.objects.filter(board_id=board_id, name=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'name': 'A tag with this name already exists in this board.'})
        return attrs


class TaskSerializer(serializers.ModelSerializer):
    assignees = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ['id', 'column', 'title', 'description', 'position',
                  'assignees', 'tags', 'created_at', 'updated_at']
        read_only_fields = ['id', 'column', 'position', 'assignees', 'tags',
                            'created_at', 'updated_at']

    def get_assignees(self, obj):
        return [
            {'id': a.user_id, 'username': a.user.username, 'email': a.user.email}
            for a in obj.assignees.select_related('user').all()
        ]

    def get_tags(self, obj):
        return [
            {'id': link.tag_id, 'name': link.tag.name, 'color': link.tag.color}
            for link in obj.tag_links.select_related('tag').all()
        ]


class TaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['id', 'column', 'title', 'description', 'position', 'created_at']
        read_only_fields = ['id', 'column', 'position', 'created_at']

    def validate(self, attrs):
        if len(attrs.get('title', '').strip()) == 0:
            raise serializers.ValidationError({'title': 'Title is required.'})
        return attrs


class ColumnSerializer(serializers.ModelSerializer):
    tasks = TaskSerializer(many=True, read_only=True)

    class Meta:
        model = Column
        fields = ['id', 'board', 'name', 'position', 'tasks', 'created_at']
        read_only_fields = ['id', 'board', 'position', 'tasks', 'created_at']


class ColumnWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ['id', 'board', 'name', 'position']
        read_only_fields = ['id', 'board']

    def validate(self, attrs):
        name = attrs.get('name', '').strip()
        attrs['name'] = name
        if not name:
            raise serializers.ValidationError({'name': 'Name is required.'})
        board_id = self.instance.board_id if self.instance else self.context['board'].pk
        qs = Column.objects.filter(board_id=board_id, name=name)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'name': 'A column with this name already exists in this board.'})
        return attrs


class BoardSummarySerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    column_count = serializers.SerializerMethodField()
    task_count = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = ['id', 'name', 'description', 'owner', 'role', 'members',
                  'column_count', 'task_count', 'created_at', 'updated_at']
        read_only_fields = fields

    def get_role(self, obj):
        from boards.permissions import get_user_role_on_board
        return get_user_role_on_board(self.context['request'].user, obj)

    def get_members(self, obj):
        return [
            {'id': m.user_id, 'username': m.user.username, 'role': m.role}
            for m in obj.members.select_related('user').all()
        ]

    def get_column_count(self, obj):
        return obj.columns.count()

    def get_task_count(self, obj):
        return Task.objects.filter(column__board=obj).count()


class BoardWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ['id', 'name', 'description', 'owner', 'created_at']
        read_only_fields = ['id', 'owner', 'created_at']

    def validate(self, attrs):
        if len(attrs.get('name', '').strip()) == 0:
            raise serializers.ValidationError({'name': 'Name is required.'})
        return attrs


class BoardDetailSerializer(BoardSummarySerializer):
    columns = ColumnSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

    class Meta(BoardSummarySerializer.Meta):
        fields = BoardSummarySerializer.Meta.fields + ['columns', 'tags']
        read_only_fields = fields


class InvitationSerializer(serializers.ModelSerializer):
    board_name = serializers.CharField(source='board.name', read_only=True)

    class Meta:
        model = Invitation
        fields = ['id', 'board', 'board_name', 'email', 'role', 'status', 'created_at']
        read_only_fields = ['id', 'status', 'created_at']


class InvitationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ['email', 'role']

    def validate_email(self, value):
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_email(value)
        except DjangoValidationError:
            raise serializers.ValidationError('Invalid email address.')
        return value


class NotificationSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True, default=None)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'message', 'task', 'task_title', 'is_read', 'created_at']
        read_only_fields = ['id', 'type', 'message', 'task', 'task_title', 'created_at']