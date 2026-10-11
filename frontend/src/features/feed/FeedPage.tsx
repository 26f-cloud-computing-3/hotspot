import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { loadFailed, queryKeys, retryLoad } from "../../lib/query";
import { UserAvatar } from "../follows/UserAvatar";
import { type FeedItem, getFeed } from "./api";
import { relativeTime } from "./relativeTime";
import "./FeedPage.css";

const fullDate = new Intl.DateTimeFormat("ko", {
  dateStyle: "long",
  timeStyle: "short",
});

/** What the actor did, and the place or collection they did it to. */
function describe(item: FeedItem): { action: string; subject: string } {
  const collection = `「${item.collection_name}」`;
  switch (item.type) {
    case "place_added":
      return {
        action: `${collection}에 장소를 담았어요`,
        subject: item.place_name ?? "",
      };
    case "place_removed":
      return {
        action: `${collection}에서 장소를 제외했어요`,
        subject: item.place_name ?? "",
      };
    case "collection_added":
      return { action: "컬렉션을 공개했어요", subject: item.collection_name };
    case "collection_renamed":
      return {
        action: "컬렉션 이름을 바꿨어요",
        subject: item.collection_name,
      };
    case "collection_removed":
      return { action: "컬렉션을 삭제했어요", subject: item.collection_name };
  }
}

export function FeedPage() {
  const feedQuery = useInfiniteQuery({
    queryKey: queryKeys.feed,
    queryFn: ({ pageParam }) => getFeed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.continuation ?? undefined,
  });

  if (loadFailed(feedQuery)) {
    return (
      <section className="empty-panel" role="alert">
        <p>피드를 불러오지 못했습니다.</p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => retryLoad(feedQuery)}
        >
          다시 시도
        </button>
      </section>
    );
  }
  if (feedQuery.data === undefined) {
    return (
      <p className="feed-status" role="status">
        불러오는 중…
      </p>
    );
  }
  const items = feedQuery.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <section className="empty-panel">
        <Icon name="feed" />
        <h2>아직 새 소식이 없어요</h2>
        <p>친구를 팔로우하면 공개 컬렉션의 활동이 여기에 모여요.</p>
        <Link className="button button-primary" to="/followers">
          친구 찾기
        </Link>
      </section>
    );
  }

  const now = new Date();
  return (
    <section aria-label="피드">
      <ul className="feed-list">
        {items.map((item) => {
          const { action, subject } = describe(item);
          const date = new Date(item.created_at);
          return (
            <li key={item.id} className="feed-card">
              <UserAvatar user={item.actor} />
              <div className="feed-card-body">
                <p>
                  <strong>{item.actor.name}</strong> 님이 {action}
                </p>
                <p className="feed-card-subject">{subject}</p>
                <time dateTime={item.created_at} title={fullDate.format(date)}>
                  {relativeTime(date, now)}
                </time>
              </div>
            </li>
          );
        })}
      </ul>
      {feedQuery.hasNextPage && (
        <div className="feed-more">
          {feedQuery.isFetchNextPageError && (
            <p className="feed-status feed-error" role="alert">
              더 불러오지 못했습니다. 다시 시도해 주세요.
            </p>
          )}
          <button
            type="button"
            className="button button-secondary"
            disabled={feedQuery.isFetchingNextPage}
            onClick={() => feedQuery.fetchNextPage()}
          >
            {feedQuery.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
          </button>
        </div>
      )}
    </section>
  );
}
