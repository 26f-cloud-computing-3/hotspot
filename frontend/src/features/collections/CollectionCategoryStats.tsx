import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query";
import { type CollectionCategoryNode, getCollectionCategoryStats } from "./api";

const CategoryTree = ({
  nodes,
  root = false,
}: {
  nodes: CollectionCategoryNode[];
  root?: boolean;
}) => (
  <ul className={root ? "category-tree-root" : undefined}>
    {nodes.map((node) => (
      <li key={node.name}>
        <div>
          <strong>{node.name}</strong>
          <span>{node.count.toLocaleString()}곳</span>
        </div>
        {node.children.length > 0 && <CategoryTree nodes={node.children} />}
      </li>
    ))}
  </ul>
);

export const CollectionCategoryStats = ({
  collectionId,
}: {
  collectionId: string;
}) => {
  const stats = useQuery({
    queryKey: queryKeys.collections.categoryStats(collectionId),
    queryFn: () => getCollectionCategoryStats(collectionId),
  });

  return (
    <section
      className="collection-category-stats"
      aria-label="컬렉션 카테고리 통계"
    >
      <header>
        <h2>컬렉션 카테고리 구성</h2>
        <p>담긴 장소의 카카오 카테고리 경로를 단계별로 집계한 결과예요.</p>
      </header>
      {stats.isPending && <p aria-busy="true">컬렉션을 분석하고 있어요.</p>}
      {stats.isError && (
        <p role="alert">
          통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      {stats.data?.categories.length === 0 && (
        <p>카테고리 정보가 있는 장소를 담으면 통계를 볼 수 있어요.</p>
      )}
      {stats.data && stats.data.categories.length > 0 && (
        <CategoryTree nodes={stats.data.categories} root />
      )}
    </section>
  );
};
