import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Icon } from "../../components/Icon";
import { queryKeys } from "../../lib/query";
import { type CollectionCategoryNode, getCollectionCategoryStats } from "./api";

const CategoryTreeNode = ({ node }: { node: CollectionCategoryNode }) => {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          className="category-tree-toggle"
          aria-expanded={expanded}
          aria-label={`${node.name} 하위 카테고리 ${expanded ? "접기" : "펼치기"}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="category-tree-name">
            <Icon name="chevron" />
            <strong>{node.name}</strong>
          </span>
          <span>{node.count.toLocaleString()}곳</span>
        </button>
      ) : (
        <div className="category-tree-row">
          <strong>{node.name}</strong>
          <span>{node.count.toLocaleString()}곳</span>
        </div>
      )}
      {hasChildren && expanded && <CategoryTree nodes={node.children} />}
    </li>
  );
};

const CategoryTree = ({
  nodes,
  root = false,
}: {
  nodes: CollectionCategoryNode[];
  root?: boolean;
}) => (
  <ul className={root ? "category-tree-root" : undefined}>
    {nodes.map((node) => (
      <CategoryTreeNode key={node.name} node={node} />
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
