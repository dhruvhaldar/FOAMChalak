"""Small Honker-compatible SQLite queue/stream adapter used by FOAMFlask."""

from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Iterator


@dataclass
class Job:
    """A claimed queue job."""

    id: int
    payload: dict[str, Any]
    _db: "HonkerDB"
    _queue_name: str

    def ack(self) -> None:
        self._db._execute("DELETE FROM queue_jobs WHERE id = ?", (self.id,))

    def retry(self, delay_s: float = 0, error: str | None = None) -> None:
        available_at = time.time() + max(delay_s, 0)
        self._db._execute(
            """
            UPDATE queue_jobs
               SET claimed_by = NULL,
                   claimed_at = NULL,
                   available_at = ?,
                   last_error = ?
             WHERE id = ?
            """,
            (available_at, error, self.id),
        )


class Stream:
    """Append-only named stream."""

    def __init__(self, db: "HonkerDB", name: str) -> None:
        self._db = db
        self._name = name

    def publish(
        self, payload: dict[str, Any], tx: sqlite3.Connection | None = None
    ) -> None:
        conn = tx or self._db._connect()
        should_close = tx is None
        try:
            conn.execute(
                """
                INSERT INTO stream_events (stream_name, payload, created_at)
                VALUES (?, ?, ?)
                """,
                (self._name, json.dumps(payload), time.time()),
            )
            if tx is None:
                conn.commit()
        finally:
            if should_close:
                conn.close()


class Queue:
    """SQLite-backed FIFO queue."""

    def __init__(self, db: "HonkerDB", name: str) -> None:
        self._db = db
        self._name = name

    def enqueue(self, payload: dict[str, Any]) -> int:
        with self._db.transaction() as tx:
            cursor = tx.execute(
                """
                INSERT INTO queue_jobs (queue_name, payload, available_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (self._name, json.dumps(payload), time.time(), time.time()),
            )
            return int(cursor.lastrowid)

    async def claim(
        self, worker_id: str, poll_interval_s: float = 0.5
    ) -> AsyncIterator[Job]:
        while True:
            job = self._claim_one(worker_id)
            if job is not None:
                yield job
                continue
            await asyncio.sleep(poll_interval_s)

    def _claim_one(self, worker_id: str) -> Job | None:
        now = time.time()
        with self._db.transaction() as tx:
            row = tx.execute(
                """
                SELECT id, payload
                  FROM queue_jobs
                 WHERE queue_name = ?
                   AND available_at <= ?
                   AND claimed_by IS NULL
                 ORDER BY id ASC
                 LIMIT 1
                """,
                (self._name, now),
            ).fetchone()
            if row is None:
                return None

            tx.execute(
                "UPDATE queue_jobs SET claimed_by = ?, claimed_at = ? WHERE id = ?",
                (worker_id, now, row["id"]),
            )
            payload = json.loads(row["payload"])
            return Job(
                id=int(row["id"]),
                payload=payload,
                _db=self._db,
                _queue_name=self._name,
            )


class HonkerDB:
    """Connection factory for queue and stream primitives."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.transaction() as tx:
            tx.execute(
                """
                CREATE TABLE IF NOT EXISTS queue_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    queue_name TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    available_at REAL NOT NULL,
                    created_at REAL NOT NULL,
                    claimed_by TEXT,
                    claimed_at REAL,
                    last_error TEXT
                )
                """
            )
            tx.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_queue_claim
                ON queue_jobs (queue_name, available_at, claimed_by, id)
                """
            )
            tx.execute(
                """
                CREATE TABLE IF NOT EXISTS stream_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream_name TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_stream_events ON stream_events (stream_name, id)"
            )

    def _execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self.transaction() as tx:
            tx.execute(sql, params)

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def queue(self, name: str) -> Queue:
        return Queue(self, name)

    def stream(self, name: str) -> Stream:
        return Stream(self, name)


def open(path: str | Path) -> HonkerDB:
    """Open a Honker-compatible SQLite database."""
    return HonkerDB(path)
