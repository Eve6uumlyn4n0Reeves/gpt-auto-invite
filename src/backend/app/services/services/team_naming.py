from __future__ import annotations
import re
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models import MotherGroup, MotherGroupSettings, MotherAccount, MotherTeam, PoolGroup, PoolGroupSettings, GroupDailySequence
from sqlalchemy import select, update
from app.provider import update_team_info
from app.security import decrypt_token
from sqlalchemy import update as sa_update, select as sa_select


class TeamNamingService:
    """Team名称序列化服务"""

    def __init__(self, db: Session):
        self._session = db

    @staticmethod
    def generate_team_name(template: str, mother_info: Dict[str, Any], sequence_number: int = 1) -> str:
        """
        根据模板生成Team名称

        Args:
            template: 命名模板，支持变量替换
            mother_info: 母号信息
            sequence_number: 序列号

        Returns:
            生成的Team名称
        """
        if not template:
            # 默认命名规则
            template = "Team-{email_prefix}-{date}"

        # 准备变量
        email_prefix = mother_info.get('email', '').split('@')[0]
        date_str = datetime.now().strftime('%Y%m%d')
        time_str = datetime.now().strftime('%H%M')
        mother_id = mother_info.get('id', '')
        team_id = mother_info.get('team_id', '')

        # 变量替换
        variables = {
            '{email_prefix}': email_prefix,
            '{email}': mother_info.get('email', ''),
            '{date}': date_str,
            '{time}': time_str,
            '{datetime}': f"{date_str}_{time_str}",
            '{sequence}': f"{sequence_number:03d}",
            '{mother_id}': str(mother_id),
            '{team_id}': team_id,
            '{year}': datetime.now().strftime('%Y'),
            '{month}': datetime.now().strftime('%m'),
            '{day}': datetime.now().strftime('%d'),
        }

        # 执行替换
        result = template
        for var, value in variables.items():
            result = result.replace(var, str(value))

        # 清理非法字符
        result = re.sub(r'[^\w\s\u4e00-\u9fff\-_.]', '', result)
        result = result.strip(' _-')

        return result or f"Team-{email_prefix}-{date_str}"

    @staticmethod
    def apply_naming_to_mother_teams(db: Session, mother_id: int, template: Optional[str] = None) -> bool:
        """
        为母号的所有团队应用命名规则

        Args:
            db: 数据库会话
            mother_id: 母号ID
            template: 命名模板，如果为None则使用分组模板

        Returns:
            是否成功
        """
        try:
            # 获取母号信息
            mother = db.query(MotherAccount).filter(MotherAccount.id == mother_id).first()
            if not mother:
                return False

            # 获取模板：优先使用 MotherGroupSettings 模板，其次回退到 MotherGroup 列
            if not template and mother.group_id:
                settings = db.query(MotherGroupSettings).filter(MotherGroupSettings.group_id == mother.group_id).first()
                if settings and settings.team_name_template:
                    template = settings.team_name_template
                else:
                    group = db.query(MotherGroup).filter(MotherGroup.id == mother.group_id).first()
                    template = group.team_name_template if group and group.team_name_template else template

            # 获取所有团队
            teams = db.query(MotherTeam).filter(MotherTeam.mother_id == mother_id).all()

            # 为每个团队生成名称
            for i, team in enumerate(teams, 1):
                team_info = {
                    'email': mother.name,
                    'id': mother.id,
                    'team_id': team.team_id,
                }

                new_name = TeamNamingService.generate_team_name(
                    template or "Team-{email_prefix}-{date}",
                    team_info,
                    i
                )

                # 更新本地数据库
                team.team_name = new_name

                # 同步到ChatGPT（如果有access token）
                if mother.access_token_enc:
                    try:
                        access_token = decrypt_token(mother.access_token_enc)
                        update_team_info(access_token, team.team_id, new_name)
                    except Exception as e:
                        # 记录错误但不阻止流程
                        import logging
                        logging.getLogger(__name__).warning("Failed to update team name in ChatGPT: %s", e)

            db.commit()
            return True

        except Exception as e:
            db.rollback()
            import logging
            logging.getLogger(__name__).exception("Error applying naming to mother teams: %s", e)
            return False

    @staticmethod
    def next_seq(db: Session, group_id: int, seq_type: str, date_yyyymmdd: Optional[str] = None) -> int:
        """获取并原子地递增组+日期的序列号。

        兼容多数据库：
        - Postgres：使用 RETURNING 获取最新值，真正原子。
        - 其他（如 SQLite）：采用乐观插入 + 更新重试，尽量减少冲突。
        """
        if not date_yyyymmdd:
            date_yyyymmdd = datetime.utcnow().strftime('%Y%m%d')

        bind = db.get_bind()
        supports_returning = bool(getattr(getattr(bind, 'dialect', None), 'insert_returning', False) or getattr(getattr(bind, 'dialect', None), 'update_returning', False))

        # 最多重试两次，处理竞争插入
        for _ in range(2):
            try:
                # 先尝试原子 UPDATE + RETURNING
                stmt = sa_update(GroupDailySequence).where(
                    GroupDailySequence.group_id == group_id,
                    GroupDailySequence.seq_type == seq_type,
                    GroupDailySequence.date_yyyymmdd == date_yyyymmdd,
                ).values(current_value=GroupDailySequence.current_value + 1)
                if supports_returning:
                    stmt = stmt.returning(GroupDailySequence.current_value)
                res = db.execute(stmt)
                if supports_returning:
                    fetched = res.fetchone()
                    if fetched and len(fetched) >= 1:
                        db.commit()
                        return int(fetched[0])
                else:
                    if res.rowcount and res.rowcount > 0:
                        # 再查一次当前值
                        cur = db.execute(
                            sa_select(GroupDailySequence.current_value).where(
                                GroupDailySequence.group_id == group_id,
                                GroupDailySequence.seq_type == seq_type,
                                GroupDailySequence.date_yyyymmdd == date_yyyymmdd,
                            )
                        ).scalar_one()
                        db.commit()
                        return int(cur)

                # 若不存在，尝试插入 current_value=1
                row = GroupDailySequence(
                    group_id=group_id,
                    seq_type=seq_type,
                    date_yyyymmdd=date_yyyymmdd,
                    current_value=1,
                )
                db.add(row)
                db.commit()
                return 1
            except Exception as e:
                db.rollback()
                # 可能是并发插入冲突，重试一次
                import logging
                logging.getLogger(__name__).debug("next_seq retry after concurrency error: %s", e)
                continue

        # 最后兜底：查询一次，若存在则再做一次更新
        row = db.query(GroupDailySequence).filter(
            GroupDailySequence.group_id == group_id,
            GroupDailySequence.seq_type == seq_type,
            GroupDailySequence.date_yyyymmdd == date_yyyymmdd,
        ).first()
        if not row:
            row = GroupDailySequence(group_id=group_id, seq_type=seq_type, date_yyyymmdd=date_yyyymmdd, current_value=1)
            db.add(row)
            db.commit()
            return 1
        try:
            row.current_value = (row.current_value or 0) + 1
            db.add(row)
            db.commit()
            return int(row.current_value)
        except Exception as e:
            db.rollback()
            # 无法可靠自增时，返回一个安全值 1（极端兜底）
            import logging
            logging.getLogger(__name__).warning("next_seq fallback to 1 due to error: %s", e)
            return 1

    @staticmethod
    def next_team_name(db: Session, pool_group: PoolGroup, settings: Optional[PoolGroupSettings]) -> str:
        today = datetime.utcnow().strftime('%Y%m%d')
        seq = TeamNamingService.next_seq(db, pool_group.id, 'team', today)
        group_key = re.sub(r'[^a-zA-Z0-9_-]', '-', pool_group.name.strip())
        tpl = (settings.team_template if settings and settings.team_template else '{group}-{date}-{seq3}')
        return tpl.replace('{group}', group_key).replace('{date}', today).replace('{seq3}', f"{seq:03d}")

    @staticmethod
    def get_next_sequence_number(db: Session, group_id: int, date: Optional[datetime] = None) -> int:
        """
        获取指定分组和日期的下一个序列号

        Args:
            db: 数据库会话
            group_id: 分组ID
            date: 指定日期，默认为今天

        Returns:
            下一个序列号
        """
        if date is None:
            date = datetime.now().date()

        # 查询当天该分组的母号数量
        count = db.query(MotherAccount).filter(
            MotherAccount.group_id == group_id,
            MotherAccount.created_at >= date,
            MotherAccount.created_at < date.replace(day=date.day + 1) if date.day < 31 else date.replace(month=date.month + 1, day=1) if date.month < 12 else date.replace(year=date.year + 1, month=1, day=1)
        ).count()

        return count + 1

    @staticmethod
    def validate_template(template: str) -> Dict[str, Any]:
        """
        验证命名模板

        Args:
            template: 命名模板

        Returns:
            验证结果
        """
        if not template:
            return {"valid": True, "message": "使用默认模板"}

        # 检查是否包含支持的变量
        supported_vars = [
            '{email_prefix}', '{email}', '{date}', '{time}', '{datetime}',
            '{sequence}', '{mother_id}', '{team_id}', '{year}', '{month}', '{day}'
        ]

        used_vars = re.findall(r'\{[^}]+\}', template)
        invalid_vars = [var for var in used_vars if var not in supported_vars]

        if invalid_vars:
            return {
                "valid": False,
                "message": f"不支持的变量: {', '.join(invalid_vars)}",
                "supported_vars": supported_vars
            }

        # 检查长度
        if len(template) > 200:
            return {"valid": False, "message": "模板长度不能超过200字符"}

        return {"valid": True, "message": "模板验证通过"}

    @staticmethod
    def validate_placeholders(template: Optional[str], allowed: set[str]) -> None:
        """校验模板中的占位符是否都在允许集合中。

        用于按域（如号池组）限制可用变量，避免在不同业务中出现变量集漂移。
        - 空模板视为通过（表示使用默认模板）。
        - 发现非法占位符时抛出 ValueError（供上层路由/服务捕获并返回 400）。
        """
        if not template:
            return
        import re
        for key in re.findall(r"\{(\w+)\}", template):
            if key not in allowed:
                raise ValueError(f"invalid placeholder: {{{key}}}")

    @staticmethod
    def preview_team_names(template: str, mother_info: Dict[str, Any], team_count: int = 3) -> list[str]:
        """
        预览Team名称

        Args:
            template: 命名模板
            mother_info: 母号信息
            team_count: 团队数量

        Returns:
            预览的Team名称列表
        """
        names = []
        for i in range(1, team_count + 1):
            name = TeamNamingService.generate_team_name(template, mother_info, i)
            names.append(name)
        return names

    def generate_group_team_name(self, group_id: int, email: str, team_id: str) -> str:
        """为用户组生成team名称（实例方法，读取组配置）"""
        # 优先从 MotherGroupSettings 获取模板
        settings = self._session.query(MotherGroupSettings).filter(MotherGroupSettings.group_id == group_id).first()
        if settings and settings.team_name_template:
            template = settings.team_name_template
        else:
            group = self._session.query(MotherGroup).filter(MotherGroup.id == group_id).first()
            template = group.team_name_template if group and group.team_name_template else "Team-{email_prefix}-{date}"

        mother_info = {
            'email': email,
            'email_prefix': email.split('@')[0] if email else 'unknown',
            'team_id': team_id,
        }

        return TeamNamingService.generate_team_name(template, mother_info, 1)

    def generate_pool_team_name(self, pool_group_id: int, email: str, team_id: str) -> str:
        """为号池组生成team名称"""
        pool_group = self._session.query(PoolGroup).filter(PoolGroup.id == pool_group_id).first()
        settings = self._session.query(PoolGroupSettings).filter(PoolGroupSettings.group_id == pool_group_id).first()

        if settings and settings.team_template:
            template = settings.team_template
            # 使用号池组的序列号生成
            today = datetime.utcnow().strftime('%Y%m%d')
            seq = self.next_seq(self._session, pool_group_id, 'team', today)

            # 替换模板变量
            group_key = re.sub(r'[^a-zA-Z0-9_-]', '-', pool_group.name.strip() if pool_group else 'Pool')
            result = template.replace('{group}', group_key).replace('{date}', today).replace('{seq3}', f"{seq:03d}")

            # 清理非法字符
            result = re.sub(r'[^\w\s\u4e00-\u9fff\-_.]', '', result).strip(' _-')
            return result or f"{group_key}-Team-{today}-{seq:03d}"
        else:
            # 使用默认命名
            email_prefix = email.split('@')[0] if email else 'unknown'
            today = datetime.utcnow().strftime('%Y%m%d')
            return f"{email_prefix}-Team-{today}"


# 常用模板
DEFAULT_TEMPLATES = {
    "基础模板": "Team-{email_prefix}-{date}",
    "时间模板": "Team-{email_prefix}-{datetime}",
    "序列模板": "Team-{email_prefix}-{sequence}",
    "完整模板": "{email_prefix}-Team-{date}-{sequence}",
    "中文模板": "{email_prefix}团队-{date}",
    "项目模板": "Project-{email_prefix}-{date}",
    "工作空间": "Workspace-{email_prefix}-{date}",
}
