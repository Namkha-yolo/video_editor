import type { StatusFilter } from "./types";
import { STATUS_LABEL } from "./utils";

interface StatusFiltersProps {
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

export function StatusFilters({ activeFilter, onFilterChange, counts }: StatusFiltersProps) {
  const filters: StatusFilter[] = ["all", "queued", "analyzing", "grading", "complete", "failed"];

  return (
    <div className="dashboard-filters">
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          className={`dashboard-filter-btn ${activeFilter === filter ? "dashboard-filter-btn--active" : ""}`}
          onClick={() => onFilterChange(filter)}
          disabled={filter !== "all" && counts[filter] === 0}
        >
          <span>{filter === "all" ? "All Jobs" : (STATUS_LABEL[filter as keyof typeof STATUS_LABEL] || filter)}</span>
          <span className="dashboard-filter-count">{counts[filter]}</span>
        </button>
      ))}
    </div>
  );
}
