from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from brain import JarvisBrain

app = FastAPI(
    title="J.A.R.V.I.S.",
    description="Personal assistant API and mobile web interface",
    version="1.1",
)

brain = JarvisBrain()
WEB_DIR = Path(__file__).resolve().parent / "web"


class CommandRequest(BaseModel):
    command: str = Field(max_length=2000)


@app.get("/")
def home():
    return {
        "assistant": "J.A.R.V.I.S.",
        "status": "ONLINE",
        "message": "JARVIS server is ready",
        "interface": "/app/",
    }


@app.get("/status")
def status():
    return {
        "name": "J.A.R.V.I.S.",
        "status": "ONLINE",
        "brain": "RULE_BASED",
        "brain_mode": "rules",
        "model_configured": False,
    }


@app.post("/command")
def process_command(request: CommandRequest):
    command = request.command.strip()

    if not command:
        return {
            "success": False,
            "message": "Please enter a command",
        }

    response = brain.respond(command)

    return {
        "success": True,
        "assistant": "J.A.R.V.I.S.",
        "command": command,
        "response": response,
    }


@app.get("/health")
def health():
    return {
        "healthy": True,
        "system": "J.A.R.V.I.S.",
    }


app.mount("/app", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
