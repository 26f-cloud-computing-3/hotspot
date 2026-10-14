import type { IconName } from "../Icon";

export const NAVIGATION_ITEMS = [
  { id: "places", label: "장소 찾기", icon: "search" },
  { id: "popular", label: "인기", icon: "flame" },
  { id: "collections", label: "컬렉션", icon: "collection" },
  { id: "feed", label: "피드", icon: "feed" },
  { id: "followers", label: "팔로워", icon: "people" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];
export type Page = (typeof NAVIGATION_ITEMS)[number]["id"];
/** "me" is the signed-in user's own profile, reached from the sidebar footer. */
export type ActivePage = Page | "me";
