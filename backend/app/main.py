from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.collections import router as collections_router
from app.api.feed import router as feed_router
from app.api.follows import router as follows_router
from app.api.map import router as map_router
from app.api.me import router as me_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(collections_router)
app.include_router(feed_router)
app.include_router(follows_router)
app.include_router(map_router)
app.include_router(me_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
