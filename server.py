from fastapi import FastAPI
from pydantic import BaseModel
from brain import JarvisBrain

app = FastAPI(
    title="J.A.R.V.I.S.",
    description="Advanced Personal AI Assistant",
    version="1.0"
)

brain = JarvisBrain()


class CommandRequest(BaseModel):
    command: str


@app.get("/")
def home():
    return {
        "assistant": "J.A.R.V.I.S.",
        "status": "ONLINE",
        "message": "JARVIS server is ready"
    }


@app.get("/status")
def status():
    return {
        "name": "J.A.R.V.I.S.",
        "status": "ONLINE",
        "brain": "CONNECTED"
    }


@app.post("/command")
def process_command(request: CommandRequest):

    command = request.command.strip()

    if not command:
        return {
            "success": False,
            "message": "Please enter a command"
        }

    response = brain.respond(command)

    return {
        "success": True,
        "assistant": "J.A.R.V.I.S.",
        "command": command,
        "response": response
    }


@app.get("/health")
def health():
    return {
        "healthy": True,
        "system": "J.A.R.V.I.S."
    }
