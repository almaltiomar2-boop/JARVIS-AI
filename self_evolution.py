 
"""
J.A.R.V.I.S - SELF EVOLUTION ENGINE
محرك اكتشاف المهارات وتطوير القدرات

Python 3.10+
يستخدم مكتبات Python الأساسية فقط.
"""

import json
import os
import sqlite3
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone


BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "jarvis_skills.db"

HF_URL = "https://huggingface-hf-discover.hf.space/search"
GITHUB_URL = "https://api.github.com/search/repositories"
BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"


class SelfEvolutionEngine:

    def __init__(self):
        self.create_database()

    # -----------------------------
    # DATABASE
    # -----------------------------

    def connect(self):
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        return db

    def create_database(self):
        with self.connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS skills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    description TEXT,
                    source TEXT,
                    url TEXT UNIQUE,
                    status TEXT DEFAULT 'pending',
                    discovered_at TEXT
                )
            """)

    # -----------------------------
    # INTERNET REQUEST
    # -----------------------------

    def request(self, url, data=None, headers=None):

        headers = headers or {}
        headers.setdefault("User-Agent", "JARVIS-Skill-Discovery/1.0")

        body = None

        if data is not None:
            body = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            url,
            data=body,
            headers=headers
        )

        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))

        except Exception as error:
            print("Search error:", error)
            return {}

    # -----------------------------
    # SAVE DISCOVERED SKILLS
    # -----------------------------

    def save_skill(self, name, description, source, url):

        if not url or not url.startswith("https://"):
            return

        with self.connect() as db:
            db.execute("""
                INSERT OR IGNORE INTO skills
                (name, description, source, url, status, discovered_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
            """, (
                name,
                description,
                source,
                url,
                datetime.now(timezone.utc).isoformat()
            ))

    # -----------------------------
    # SEARCH HUGGING FACE
    # -----------------------------

    def search_huggingface(self, query):

        payload = {
            "query": {
                "text": query,
                "filter": {
                    "type": ["application/ai-skill"]
                }
            },
            "pageSize": 10
        }

        results = self.request(HF_URL, data=payload)

        for item in results.get("results", []):

            data = item.get("data") or {}

            name = (
                item.get("displayName")
                or item.get("name")
                or "Unknown skill"
            )

            description = (
                item.get("description")
                or data.get("description")
                or ""
            )

            url = item.get("url") or data.get("url")

            self.save_skill(
                name,
                description,
                "Hugging Face",
                url
            )

    # -----------------------------
    # SEARCH GITHUB
    # -----------------------------

    def search_github(self, query):

        params = urllib.parse.urlencode({
            "q": query + " skill",
            "sort": "updated",
            "order": "desc",
            "per_page": 10
        })

        headers = {
            "Accept": "application/vnd.github+json"
        }

        token = os.getenv("GITHUB_TOKEN")

        if token:
            headers["Authorization"] = "Bearer " + token

        results = self.request(
            GITHUB_URL + "?" + params,
            headers=headers
        )

        for item in results.get("items", []):

            self.save_skill(
                item.get("full_name", "GitHub skill"),
                item.get("description") or "",
                "GitHub",
                item.get("html_url")
            )

    # -----------------------------
    # SEARCH THE GENERAL WEB
    # Requires BRAVE_SEARCH_API_KEY
    # -----------------------------

    def search_web(self, query):

        api_key = os.getenv("BRAVE_SEARCH_API_KEY")

        if not api_key:
            print("General web search requires BRAVE_SEARCH_API_KEY.")
            return

        params = urllib.parse.urlencode({
            "q": query + " AI agent skills",
            "count": 10
        })

        results = self.request(
            BRAVE_URL + "?" + params,
            headers={
                "X-Subscription-Token": api_key,
                "Accept": "application/json"
            }
        )

        web_results = results.get("web", {}).get("results", [])

        for item in web_results:

            self.save_skill(
                item.get("title", "Web skill"),
                item.get("description", ""),
                "Web search",
                item.get("url")
            )

    # -----------------------------
    # DEEP DISCOVERY
    # -----------------------------

    def discover(self, topic="AI agent skills"):

        queries = [
            topic,
            "latest AI agent skills and tools",
            "new MCP tools and integrations",
            "Python automation agent skills",
            "voice assistant capabilities",
            "AI memory and reasoning tools",
            "new developer agent capabilities"
        ]

        for query in queries:

            print("Searching:", query)

            self.search_huggingface(query)
            self.search_github(query)
            self.search_web(query)

        print("\nDiscovery completed.")
        print("Pending skills:", len(self.pending_skills()))

    # -----------------------------
    # REVIEW SKILLS
    # -----------------------------

    def pending_skills(self):

        with self.connect() as db:
            rows = db.execute("""
                SELECT * FROM skills
                WHERE status = 'pending'
                ORDER BY discovered_at DESC
            """).fetchall()

        return [dict(row) for row in rows]

    def approved_skills(self):

        with self.connect() as db:
            rows = db.execute("""
                SELECT * FROM skills
                WHERE status = 'approved'
                ORDER BY discovered_at DESC
            """).fetchall()

        return [dict(row) for row in rows]

    # -----------------------------
    # APPROVE A SKILL
    # -----------------------------

    def approve_skill(self, skill_id):

        with self.connect() as db:

            result = db.execute("""
                UPDATE skills
                SET status = 'approved'
                WHERE id = ? AND status = 'pending'
            """, (skill_id,))

            return result.rowcount == 1

    # -----------------------------
    # REJECT A SKILL
    # -----------------------------

    def reject_skill(self, skill_id):

        with self.connect() as db:

            result = db.execute("""
                UPDATE skills
                SET status = 'rejected'
                WHERE id = ? AND status = 'pending'
            """, (skill_id,))

            return result.rowcount == 1

    # -----------------------------
    # CONNECT APPROVED SKILLS TO AI
    # -----------------------------

    def get_skills_context(self):

        skills = self.approved_skills()

        if not skills:
            return "No approved skills available."

        context = [
            "J.A.R.V.I.S APPROVED SKILLS:",
            "Use these descriptions as guidance.",
            "Do not claim a tool is connected unless it is.",
            ""
        ]

        for skill in skills:

            context.append("Skill: " + skill["name"])
            context.append("Description: " + skill["description"])
            context.append("Source: " + skill["source"])
            context.append("Reference: " + skill["url"])
            context.append("")

        return "\n".join(context)

    # -----------------------------
    # STATISTICS
    # -----------------------------

    def statistics(self):

        with self.connect() as db:

            total = db.execute(
                "SELECT COUNT(*) FROM skills"
            ).fetchone()[0]

            pending = db.execute(
                "SELECT COUNT(*) FROM skills WHERE status='pending'"
            ).fetchone()[0]

            approved = db.execute(
                "SELECT COUNT(*) FROM skills WHERE status='approved'"
            ).fetchone()[0]

            rejected = db.execute(
                "SELECT COUNT(*) FROM skills WHERE status='rejected'"
            ).fetchone()[0]

        return {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected
        }


# -----------------------------
# TEST
# -----------------------------

if __name__ == "__main__":

    jarvis = SelfEvolutionEngine()

    print("J.A.R.V.I.S SELF EVOLUTION ENGINE")
    print("--------------------------------")

    jarvis.discover("AI agent skills")

    print("\nDISCOVERED SKILLS:")

    for skill in jarvis.pending_skills():
        print("\nID:", skill["id"])
        print("Name:", skill["name"])
        print("Source:", skill["source"])
        print("Description:", skill["description"])
        print("URL:", skill["url"])

    print("\nSTATISTICS:")
    print(jarvis.statistics())
