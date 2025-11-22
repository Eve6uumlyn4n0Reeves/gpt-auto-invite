"""
输出编码工具模块 - 防止XSS攻击
"""
import html
import json
import re
from typing import Any, Dict, List, Union, Optional

class OutputEncoder:
    """输出编码工具类"""

    @staticmethod
    def encode_html(text: str) -> str:
        """HTML编码，防止XSS"""
        if not isinstance(text, str):
            text = str(text)
        return html.escape(text, quote=True)

    @staticmethod
    def encode_html_attribute(text: str) -> str:
        """HTML属性编码"""
        if not isinstance(text, str):
            text = str(text)
        # 对HTML属性进行更严格的编码
        return html.escape(text, quote=True).replace('"', '&quot;')

    @staticmethod
    def encode_js(text: str) -> str:
        """JavaScript字符串编码"""
        if not isinstance(text, str):
            text = str(text)

        # JSON编码是安全的JS字符串编码方式
        return json.dumps(text)[1:-1]  # 去掉首尾的引号

    @staticmethod
    def encode_json(data: Any) -> str:
        """安全JSON编码"""
        try:
            return json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        except (TypeError, ValueError):
            # 如果无法序列化，返回空对象的JSON
            return '{}'

    @staticmethod
    def encode_url(text: str) -> str:
        """URL编码"""
        if not isinstance(text, str):
            text = str(text)
        import urllib.parse
        return urllib.parse.quote(text, safe='')

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """清理文件名，防止目录遍历攻击"""
        if not isinstance(filename, str):
            filename = str(filename)

        # 移除危险字符和路径分隔符
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        filename = re.sub(r'\.\.', '', filename)  # 移除..
        filename = re.sub(r'[\\/]', '_', filename)  # 路径分隔符替换为下划线

        # 限制长度
        if len(filename) > 255:
            name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
            filename = name[:255-len(ext)-1] + '.' + ext if ext else name[:255]

        return filename.strip()

    @staticmethod
    def sanitize_css(text: str) -> str:
        """清理CSS内容，防止CSS注入"""
        if not isinstance(text, str):
            text = str(text)

        # 移除危险的CSS函数和协议
        dangerous_patterns = [
            r'javascript\s*:',
            r'expression\s*\(',
            r'@import',
            r'behavior\s*:',
            r'binding\s*:',
        ]

        for pattern in dangerous_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)

        return text

    @staticmethod
    def sanitize_response_data(data: Any) -> Any:
        """递归清理响应数据中的危险内容"""
        if isinstance(data, str):
            return OutputEncoder.encode_html(data)
        elif isinstance(data, dict):
            return {key: OutputEncoder.sanitize_response_data(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [OutputEncoder.sanitize_response_data(item) for item in data]
        elif isinstance(data, tuple):
            return tuple(OutputEncoder.sanitize_response_data(item) for item in data)
        else:
            return data

    @staticmethod
    def validate_content_type(content_type: str, allowed_types: List[str]) -> bool:
        """验证Content-Type是否在允许列表中"""
        if not isinstance(content_type, str):
            return False

        content_type = content_type.lower().strip()
        return any(allowed in content_type for allowed in allowed_types)

    @staticmethod
    def sanitize_log_message(message: str) -> str:
        """清理日志消息，移除敏感信息"""
        if not isinstance(message, str):
            message = str(message)

        # 移除可能的敏感信息模式
        sensitive_patterns = [
            r'password\s*[:=]\s*[^\s]+',
            r'token\s*[:=]\s*[^\s]+',
            r'secret\s*[:=]\s*[^\s]+',
            r'key\s*[:=]\s*[^\s]+',
            r'Bearer\s+[^\s]+',
        ]

        for pattern in sensitive_patterns:
            message = re.sub(pattern, lambda m: m.group().split('=')[0] + '=***', message, flags=re.IGNORECASE)

        return message

# 实例化编码器
encoder = OutputEncoder()