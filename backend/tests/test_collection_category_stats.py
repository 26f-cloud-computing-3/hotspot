import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_engine
from app.main import app

USER_ID = str(uuid.uuid4())


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine] = lambda: engine
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=USER_ID)
    yield TestClient(app)
    app.dependency_overrides.clear()


def _place(place_id, category=None, provider="kakao"):
    return {
        "id": place_id,
        "provider": provider,
        "name": place_id,
        "address": "",
        "category": category,
        "lat": 37.5,
        "lng": 127.0,
    }


def test_category_stats_build_category_hierarchy(client):
    collection_id = client.post("/api/collections", json={"name": "맛집"}).json()["id"]
    url = f"/api/collections/{collection_id}/places"
    client.post(url, json=_place("soup", "음식점 > 한식 > 해장국"))
    client.post(url, json=_place("lamb", "음식점 > 중식 > 양꼬치"))
    client.post(url, json=_place("fish", "음식점 > 한식 > 해물,생선"))
    client.post(url, json=_place("uncategorized"))
    client.post(url, json=_place("naver", "음식점 > 한식", provider="naver"))

    response = client.get(f"/api/collections/{collection_id}/category-stats")

    assert response.status_code == 200
    assert response.json() == {
        "total": 3,
        "categories": [
            {
                "name": "음식점",
                "count": 3,
                "children": [
                    {
                        "name": "한식",
                        "count": 2,
                        "children": [
                            {"name": "해물,생선", "count": 1, "children": []},
                            {"name": "해장국", "count": 1, "children": []},
                        ],
                    },
                    {
                        "name": "중식",
                        "count": 1,
                        "children": [{"name": "양꼬치", "count": 1, "children": []}],
                    },
                ],
            }
        ],
    }


def test_category_stats_ignore_blank_category_paths(client):
    collection_id = client.post("/api/collections", json={"name": "기타"}).json()["id"]
    client.post(
        f"/api/collections/{collection_id}/places",
        json=_place("blank", "   "),
    )

    assert client.get(f"/api/collections/{collection_id}/category-stats").json() == {
        "total": 0,
        "categories": [],
    }
