import os

from .api.app import create_app

# Run with: uvicorn sipc_engine.main:app --host 0.0.0.0 --port 8000
app = create_app(api_key=os.environ.get("ENGINE_API_KEY"))
