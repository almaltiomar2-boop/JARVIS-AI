from brain import JarvisBrain

class JARVIS:

    def __init__(self):
        self.name = "J.A.R.V.I.S."
        self.brain = JarvisBrain()

    def start(self):
        print("J.A.R.V.I.S. SYSTEM ONLINE")
        print("Ready for your commands.")

        while True:
            command = input("You: ")

            if command.lower() in ["exit", "quit"]:
                print("J.A.R.V.I.S. OFFLINE")
                break

            response = self.brain.respond(command)
            print(response)


if __name__ == "__main__":
    jarvis = JARVIS()
    jarvis.start()
