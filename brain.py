class JarvisBrain:

    def __init__(self):
        self.name = "J.A.R.V.I.S."
        self.status = "ONLINE"

    def analyze(self, command):
        command = command.strip()

        if not command:
            return "لم يصلني أي أمر."

        return {
            "assistant": self.name,
            "status": "analyzed",
            "command": command
        }

    def respond(self, command):
        result = self.analyze(command)

        if isinstance(result, str):
            return result

        return f"تم تحليل طلبك: {result['command']}"
