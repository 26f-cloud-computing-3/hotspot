import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.follow import Follow

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
CAROL = str(uuid.uuid4())

PROFILES = {
    ALICE: {"email": "alice@example.com", "name": "Alice Kim"},
    BOB: {"email": "bob@example.com", "name": "Bob Lee"},
    CAROL: {"email": "carol_99@example.com", "name": "Carol Kim"},
}


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=user_id, **PROFILES.get(user_id, {})
    )


@pytest.fixture
def client(engine):
    """A client whose database already holds Alice, Bob and Carol."""
    app.dependency_overrides[get_engine] = lambda: engine
    client = TestClient(app)
    for user_id in PROFILES:
        _sign_in(user_id)
        assert client.get("/api/me").status_code == 200
    yield client
    app.dependency_overrides.clear()


def _handles(res):
    assert res.status_code == 200
    return [(user["handle"], user["is_following"]) for user in res.json()]


def test_requires_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/users?q=a").status_code == 401
    assert client.get(f"/api/users/{BOB}").status_code == 401
    assert client.get(f"/api/users/{BOB}/collections").status_code == 401
    assert client.get("/api/follows/following").status_code == 401
    assert client.get("/api/follows/followers").status_code == 401
    assert client.put(f"/api/follows/{BOB}").status_code == 401
    assert client.delete(f"/api/follows/{BOB}").status_code == 401


def test_follow_shows_up_on_both_sides(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    assert _handles(client.get("/api/follows/following")) == [("bob", True)]
    assert _handles(client.get("/api/follows/followers")) == []

    _sign_in(BOB)
    assert _handles(client.get("/api/follows/following")) == []
    # Bob has not followed Alice back.
    assert _handles(client.get("/api/follows/followers")) == [("alice", False)]


def test_followers_report_follow_back(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    _sign_in(BOB)
    client.put(f"/api/follows/{ALICE}")
    assert _handles(client.get("/api/follows/followers")) == [("alice", True)]


def test_lists_only_cover_the_signed_in_user(client):
    _sign_in(BOB)
    client.put(f"/api/follows/{CAROL}")
    _sign_in(ALICE)
    assert _handles(client.get("/api/follows/following")) == []
    assert _handles(client.get("/api/follows/followers")) == []


def test_follow_is_idempotent(client, engine):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    with Session(engine) as db:
        rows = db.scalars(select(Follow)).all()
    assert [(str(r.follower_id), str(r.followee_id)) for r in rows] == [(ALICE, BOB)]


def test_unfollow(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    client.put(f"/api/follows/{CAROL}")
    assert client.delete(f"/api/follows/{BOB}").status_code == 204
    assert _handles(client.get("/api/follows/following")) == [("carol_99", True)]
    # Unfollowing again, or someone never followed, changes nothing.
    assert client.delete(f"/api/follows/{BOB}").status_code == 204
    assert client.delete(f"/api/follows/{uuid.uuid4()}").status_code == 204


def test_unfollow_does_not_remove_the_other_direction(client):
    _sign_in(BOB)
    client.put(f"/api/follows/{ALICE}")
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    client.delete(f"/api/follows/{BOB}")
    assert _handles(client.get("/api/follows/followers")) == [("bob", False)]


def test_cannot_follow_yourself(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{ALICE}").status_code == 400


def test_cannot_follow_unknown_user(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{uuid.uuid4()}").status_code == 404
    assert client.put("/api/follows/not-a-uuid").status_code == 422


def test_search_matches_handle_prefix_and_name(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{CAROL}")
    # "kim" is in Alice's and Carol's names; the searcher is left out.
    assert _handles(client.get("/api/users?q=KIM")) == [("carol_99", True)]
    assert _handles(client.get("/api/users?q=@bo")) == [("bob", False)]
    # Handles match from the start only.
    assert _handles(client.get("/api/users?q=arol_9")) == []


def test_search_treats_wildcards_literally(client):
    _sign_in(ALICE)
    assert _handles(client.get("/api/users?q=%25")) == []
    assert _handles(client.get("/api/users?q=carol_")) == [("carol_99", False)]
    assert _handles(client.get("/api/users?q=c_rol")) == []


def test_search_needs_a_term(client):
    _sign_in(ALICE)
    assert _handles(client.get("/api/users?q=%20%20")) == []
    assert client.get("/api/users").status_code == 422


def _join(client, email, name):
    """Adds a user beyond Alice, Bob and Carol; the handle comes from the email."""
    user_id = str(uuid.uuid4())
    PROFILES[user_id] = {"email": email, "name": name}
    _sign_in(user_id)
    assert client.get("/api/me").status_code == 200
    return user_id


@pytest.fixture
def extra_profiles():
    yield
    for user_id in [key for key in PROFILES if key not in (ALICE, BOB, CAROL)]:
        del PROFILES[user_id]


def test_search_ranks_exact_then_prefix_then_substring(client, extra_profiles):
    # Handles run the other way round, so ordering by handle would reverse the result.
    _join(client, "zz@example.com", "동우")
    _join(client, "yy@example.com", "동우진")
    _join(client, "aa@example.com", "가동우")
    _sign_in(ALICE)
    assert _handles(client.get("/api/users?q=동우")) == [
        ("zz", False),
        ("yy", False),
        ("aa", False),
    ]
    # A couple of letters are enough to find someone whose name starts with them.
    assert _handles(client.get("/api/users?q=동")) == [("zz", False), ("yy", False), ("aa", False)]


def test_search_ranks_an_exact_handle_first(client, extra_profiles):
    _join(client, "bobby@example.com", "Bobby Park")
    _sign_in(ALICE)
    # "bob" is Bob's whole handle and only the start of Bobby's.
    assert _handles(client.get("/api/users?q=bob")) == [("bob", False), ("bobby", False)]


def test_search_ranks_people_known_through_followed_users_first(client, extra_profiles):
    dave = _join(client, "dave@example.com", "Dave Kim")
    # Alice follows Bob, and Bob follows Dave: Dave is someone Alice may know.
    _sign_in(BOB)
    client.put(f"/api/follows/{dave}")
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    # Carol and Dave both only contain "kim"; by name alone Carol would come first.
    assert _handles(client.get("/api/users?q=kim")) == [("dave", False), ("carol_99", False)]


def test_search_ranks_people_already_followed_before_strangers(client, extra_profiles):
    _join(client, "dave@example.com", "Dave Kim")
    _sign_in(ALICE)
    dave = next(user["id"] for user in client.get("/api/users?q=dave").json())
    client.put(f"/api/follows/{dave}")
    assert _handles(client.get("/api/users?q=kim")) == [("dave", True), ("carol_99", False)]


def _collection(client, name, is_public):
    res = client.post("/api/collections", json={"name": name, "is_public": is_public})
    return res.json()


def test_profile(client):
    _sign_in(ALICE)
    assert client.get(f"/api/users/{BOB}").json() == {
        "id": BOB,
        "name": "Bob Lee",
        "handle": "bob",
        "avatar_url": None,
        "is_following": False,
        "is_me": False,
        "public_collection_count": 0,
    }
    client.put(f"/api/follows/{BOB}")
    assert client.get(f"/api/users/{BOB}").json()["is_following"] is True


def test_own_profile(client):
    _sign_in(ALICE)
    body = client.get(f"/api/users/{ALICE}").json()
    assert (body["handle"], body["is_me"], body["is_following"]) == ("alice", True, False)


def test_unknown_profile_is_not_found(client):
    _sign_in(ALICE)
    assert client.get(f"/api/users/{uuid.uuid4()}").status_code == 404
    assert client.get(f"/api/users/{uuid.uuid4()}/collections").status_code == 404
    assert client.get("/api/users/not-a-uuid").status_code == 422


def test_profile_lists_only_public_collections(client):
    _sign_in(BOB)
    cafes = _collection(client, "Cafes", True)
    _collection(client, "Secret", False)
    _sign_in(CAROL)
    _collection(client, "Carol's", True)

    # Alice follows nobody: public collections are open to every signed-in user.
    _sign_in(ALICE)
    assert client.get(f"/api/users/{BOB}").json()["public_collection_count"] == 1
    res = client.get(f"/api/users/{BOB}/collections")
    assert res.status_code == 200
    assert res.json() == [{**cafes, "is_owner": False}]
    assert res.json()[0]["owner"]["handle"] == "bob"


def test_own_profile_leaves_out_private_collections_too(client):
    _sign_in(BOB)
    _collection(client, "Cafes", True)
    _collection(client, "Secret", False)
    assert client.get(f"/api/users/{BOB}").json()["public_collection_count"] == 1
    res = client.get(f"/api/users/{BOB}/collections")
    assert [(c["name"], c["is_owner"]) for c in res.json()] == [("Cafes", True)]


def _recommended(res):
    assert res.status_code == 200
    return [
        (user["handle"], user["reason"], user["mutual_count"], user["follows_you"])
        for user in res.json()
    ]


def test_recommendations_require_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/users/recommendations").status_code == 401


def test_recommendations_start_empty(client):
    # Nobody follows anybody and there are no public collections yet.
    _sign_in(ALICE)
    assert _recommended(client.get("/api/users/recommendations")) == []


def test_recommends_people_followed_by_people_i_follow(client, extra_profiles):
    dave = _join(client, "dave@example.com", "Dave Kim")
    _sign_in(BOB)
    client.put(f"/api/follows/{CAROL}")
    client.put(f"/api/follows/{dave}")
    _sign_in(CAROL)
    client.put(f"/api/follows/{dave}")
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    client.put(f"/api/follows/{CAROL}")
    # Bob and Carol, whom Alice follows, both follow Dave; Bob is already followed.
    assert _recommended(client.get("/api/users/recommendations")) == [("dave", "mutual", 2, False)]


def test_recommends_followers_not_followed_back(client):
    _sign_in(BOB)
    client.put(f"/api/follows/{ALICE}")
    _sign_in(ALICE)
    assert _recommended(client.get("/api/users/recommendations")) == [
        ("bob", "follows_you", 0, True)
    ]
    client.put(f"/api/follows/{BOB}")
    assert _recommended(client.get("/api/users/recommendations")) == []


def test_fills_in_with_users_who_share_public_collections(client):
    _sign_in(BOB)
    _collection(client, "Cafes", True)
    _sign_in(CAROL)
    _collection(client, "Bars", True)
    _collection(client, "Bakeries", True)
    _collection(client, "Secret", False)
    _sign_in(ALICE)
    # Carol has more public collections; private ones count for nothing.
    assert _recommended(client.get("/api/users/recommendations")) == [
        ("carol_99", "popular", 0, False),
        ("bob", "popular", 0, False),
    ]


def test_recommendations_put_closer_people_first(client, extra_profiles):
    dave = _join(client, "dave@example.com", "Dave Kim")
    erin = _join(client, "erin@example.com", "Erin Choi")
    _sign_in(dave)
    _collection(client, "Lots", True)
    _sign_in(BOB)
    client.put(f"/api/follows/{erin}")
    _sign_in(CAROL)
    client.put(f"/api/follows/{ALICE}")
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    assert _recommended(client.get("/api/users/recommendations")) == [
        ("erin", "mutual", 1, False),
        ("carol_99", "follows_you", 0, True),
        ("dave", "popular", 0, False),
    ]
    assert len(client.get("/api/users/recommendations?limit=1").json()) == 1
    assert client.get("/api/users/recommendations?limit=0").status_code == 422
