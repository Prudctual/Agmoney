from openai import OpenAI
import time
import os

# 🛠️ Client Configuration
PROXY_URL = "https://agmoney-proxy.xgolo70.workers.dev/v1"
# Can be set via environment variable or replaced manually
AGENT_KEY = os.getenv("TEST_AGENT_KEY", "PLACEHOLDER_KEY") 

print(f"📡 Connecting to: {PROXY_URL}")
print(f"🔑 Using Key: {AGENT_KEY[:5]}..." if AGENT_KEY != "PLACEHOLDER_KEY" else "🔑 Key not set!")

if AGENT_KEY == "PLACEHOLDER_KEY":
    print("❌ Error: Please replace 'PLACEHOLDER_KEY' with your real Agent Key or set TEST_AGENT_KEY env var.")
    exit(1)

client = OpenAI(
    api_key=AGENT_KEY,
    base_url=PROXY_URL
)

print("⏳ Sending request...")

try:
    # Simple request
    response = client.chat.completions.create(
        model="gpt-4o-mini", # Cheap model for testing
        messages=[{"role": "user", "content": "Say 'Hello Agmoney' in one word."}]
    )
    
    print("\n✅ Connection Successful!")
    print(f"🤖 Agent Response: {response.choices[0].message.content}")
    
    print("\n👀 Now check the dashboard, did the budget bar move?")

except Exception as e:
    print(f"\n❌ An error occurred: {e}")
