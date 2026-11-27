
import json
import os

class JarvisMemory:
    def __init__(self, file="memory.json"):
        self.file = file
        self.data = self.load()

    def load(self):
        if os.path.exists(self.file):
            with open(self.file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"preferences": {}, "history": []}

    def remember(self, key, value):
        self.data["preferences"][key] = value
        self.save()

    def recall(self, key):
        return self.data["preferences"].get(key)

    def save(self):
        with open(self.file, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=4)
              
