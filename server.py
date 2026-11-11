#!/usr/bin/env python3
"""DNF Lab server bound to the loopback interface."""
import argparse
import json
import sqlite3
import sys
import webbrowser
from contextlib import contextmanager
from datetime import date
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from unicodedata import normalize

from online import online_video, search_photos

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"


@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=10)
    try:
        db.execute("PRAGMA foreign_keys = ON")
        with db:
            yield db
    finally:
        db.close()


def initialize(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.executescript("""
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS athletes (
                id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY, athlete_id TEXT REFERENCES athletes(id),
                body TEXT NOT NULL, revision INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS runs_athlete ON runs(athlete_id);
            CREATE TABLE IF NOT EXISTS competition_dates (
                name_key TEXT PRIMARY KEY, date TEXT NOT NULL
            );
        """)


def save_record(db, kind, item, expected):
    db_id = item["id"]
    current = db.execute(f"SELECT revision FROM {kind} WHERE id = ?", (db_id,)).fetchone()
    if (current[0] if current else 0) != expected:
        raise Conflict
    revision = expected + 1
    body = json.dumps(item, ensure_ascii=False, allow_nan=False)
    if kind == "athletes":
        db.execute("""
            INSERT INTO athletes VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET body=excluded.body, revision=excluded.revision
        """, (db_id, body, revision))
    else:
        db.execute("""
            INSERT INTO runs VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET athlete_id=excluded.athlete_id,
                body=excluded.body, revision=excluded.revision
        """, (db_id, item.get("athleteId") or None, body, revision))
    return {**item, "revision": revision}


def save_competition_date(db, name, value):
    key = normalize("NFC", " ".join(name.split())).lower() if isinstance(name, str) else ""
    if not key or not isinstance(value, str) or (value and date.fromisoformat(value).isoformat() != value):
        raise ValueError
    db.execute("""
        INSERT INTO competition_dates VALUES (?, ?)
        ON CONFLICT(name_key) DO UPDATE SET date=excluded.date
    """, (key, value))


class Conflict(Exception):
    pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_request(self, code="-", size="-"):
        # Image searches and video links can contain personal information.
        path = self.path.split("?", 1)[0]
        self.log_message('"%s %s %s" %s %s', self.command, path, self.request_version, code, size)

    def request_is_local(self):
        port = self.server.server_address[1]
        hosts = {f"{HOST}:{port}", f"localhost:{port}"}
        origin = self.headers.get("Origin")
        return (self.headers.get("Host") in hosts
                and (not origin or origin in {f"http://{host}" for host in hosts}))

    def json_response(self, value, status=HTTPStatus.OK):
        encoded = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if not self.request_is_local():
            return self.send_error(HTTPStatus.FORBIDDEN)
        url = urlsplit(self.path)
        params = parse_qs(url.query)
        if url.path in ("/api/photos", "/api/video"):
            key = "name" if url.path == "/api/photos" else "url"
            action = search_photos if key == "name" else online_video
            try:
                return self.json_response(action(params.get(key, [""])[0]))
            except ValueError as error:
                return self.json_response({"error": str(error)}, 400)
            except (OSError, TimeoutError):
                message = "Image search is temporarily unavailable." if key == "name" else "The video provider is temporarily unavailable."
                return self.json_response({"error": message}, 502)
        if url.path != "/api/data":
            return super().do_GET()
        with connect(self.server.db_path) as db:
            db.execute("BEGIN")
            data = {
                table: [
                    {**json.loads(body), "revision": rev}
                    for body, rev in db.execute(f"SELECT body, revision FROM {table} ORDER BY rowid")
                ] for table in ("athletes", "runs")
            }
            data["competitionDates"] = dict(db.execute("SELECT name_key, date FROM competition_dates"))
        self.json_response(data)

    def do_PUT(self):
        self.mutate()

    def do_DELETE(self):
        self.mutate()

    def mutate(self):
        if not self.request_is_local():
            return self.json_response({"error": "This service is available on this computer only."}, 403)
        parts = urlsplit(self.path).path.split("/")
        if len(parts) != 4 or parts[1] != "api" or parts[2] not in ("runs", "athletes"):
            return self.json_response({"error": "Unknown endpoint."}, 404)
        _, _, kind, record_id = parts
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 3_000_000 or self.headers.get_content_type() != "application/json":
                raise ValueError
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError
            revision = payload.pop("revision", None)
            if type(revision) is not int or revision < 0:
                raise ValueError
            with connect(self.server.db_path) as db:
                db.execute("BEGIN IMMEDIATE")
                if self.command == "DELETE":
                    cursor = db.execute(f"DELETE FROM {kind} WHERE id = ? AND revision = ?", (record_id, revision))
                    if not cursor.rowcount:
                        raise Conflict
                    result = {}
                else:
                    if payload.get("id") != record_id:
                        raise ValueError
                    if kind == "athletes" and not str(payload.get("name", "")).strip():
                        raise ValueError
                    if kind == "runs" and (payload.get("pool") not in (25, 50)
                                           or not isinstance(payload.get("events"), list)):
                        raise ValueError
                    changes_date = kind == "runs" and "competitionDate" in payload
                    competition_date = payload.pop("competitionDate") if changes_date else None
                    result = save_record(db, kind, payload, revision)
                    if changes_date:
                        save_competition_date(db, payload.get("competition"), competition_date)
                        result["competitionDate"] = competition_date
            self.json_response(result)
        except Conflict:
            self.json_response({"error": "Another window changed this record. Reload before editing it again."}, 409)
        except sqlite3.IntegrityError:
            self.json_response({"error": "This record is linked to other data."}, 422)
        except (ValueError, TypeError, KeyError, OverflowError):
            self.json_response({"error": "Invalid or oversized data."}, 400)
        except sqlite3.Error as error:
            print(error, file=sys.stderr)
            self.json_response({"error": "Could not write to the local database."}, 500)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "dnf.sqlite3")
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    initialize(args.db)
    with ThreadingHTTPServer((HOST, args.port), Handler) as server:
        server.db_path = args.db
        url = f"http://{HOST}:{server.server_address[1]}/"
        print(f"DNF Lab · {url}", flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
