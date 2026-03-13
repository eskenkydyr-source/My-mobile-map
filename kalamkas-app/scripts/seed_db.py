#!/usr/bin/env python3
"""
Скрипт начального заполнения БД данными из index.html.

Использование:
    python scripts/seed_db.py --source ../index.html
    python scripts/seed_db.py --source ../index.html --dry-run
"""
import sys
import argparse
import asyncio
from pathlib import Path

# Добавляем backend в путь
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.services.html_parser import parse_html_file, summary


async def seed(source: str, dry_run: bool = False):
    print(f"📂 Читаю файл: {source}")
    result = parse_html_file(source)
    print(summary(result))

    if result.errors:
        print(f"\n⚠️  Обнаружены ошибки парсинга. Продолжить? (y/n)")
        if input().strip().lower() != "y":
            return

    if dry_run:
        print("\n🔍 DRY RUN — в БД ничего не записано")
        return

    # TODO: подключиться к БД и записать данные
    # from app.db.database import get_session
    # async with get_session() as session:
    #     for well in result.wells: ...
    #     for obj in result.objects: ...
    #     for node in result.graph.nodes: ...
    #     for edge in result.graph.edges: ...

    print("\n✅ Сид завершён")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Сид БД из index.html")
    parser.add_argument("--source", required=True, help="Путь к index.html")
    parser.add_argument("--dry-run", action="store_true", help="Только парсинг, без записи в БД")
    args = parser.parse_args()

    asyncio.run(seed(args.source, args.dry_run))
