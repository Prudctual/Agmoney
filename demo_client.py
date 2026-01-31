from openai import OpenAI
import time

# To use this demo:
# 1. Start the Agmoney proxy (wrangler dev)
# 2. Create an agent in the dashboard with a low budget (e.g. $0.01)
# 3. Paste your ag_sk_... key below

AGMONEY_KEY = "ag_sk_your_key_here"
PROXY_URL = "http://localhost:8787/v1" # Local wrangler dev address

client = OpenAI(
    api_key=AGMONEY_KEY,
    base_url=PROXY_URL
)

print("🚀 Starting Agmoney Demo Client...")
print(f"Targeting Proxy: {PROXY_URL}")

try:
    while True:
        print("🔍 Agent sending request...")
        response = client.chat.completions.create(
            model="gpt-4o", # The proxy forwards this to OpenAI
            messages=[{"role": "user", "content": "Say hello!"}]
        )
        print(f"✅ Response received: {response.choices[0].message.content}")
        print("---")
        time.sleep(1)
except Exception as e:
    if "402" in str(e) or "Budget exceeded" in str(e):
        print("\n🛑 BUDGET GUARD TRIGGERED!")
        print(f"Error Message: {e}")
        print("Success: The Guardian Proxy successfully blocked the runaway request.")
    else:
        print(f"\n❌ Error: {e}")
