
class JARVIS:
    def __init__(self):
        self.name = "J.A.R.V.I.S."
        self.version = "1.0"
        self.running = True

    def think(self, command):
        print(f"[J.A.R.V.I.S.] Analyzing: {command}")
        return "Command received and analyzed."

    def start(self):
        print("J.A.R.V.I.S. SYSTEM ONLINE")
        print("Ready for your commands.")

        while self.running:
            command = input("You: ")

            if command.lower() in ["exit", "quit"]:
                self.running = False
                break

            print(self.think(command))


if __name__ == "__main__":
    jarvis = JARVIS()
    jarvis.start()
  
