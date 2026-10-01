from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.map import router as map_router
from app.api.me import router as me_router
from app.core.config import get_settings
from app.mcp.server import mcp


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(mcp.session_manager.run())
        yield


settings = get_settings()

app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(map_router)
app.include_router(me_router)
app.mount("/mcp", mcp.streamable_http_app(streamable_http_path="/"))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
