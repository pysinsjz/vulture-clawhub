import { ArrowDownToLine } from "lucide-react";
import { formatSkillStatsTriplet, type SkillStatsTriplet } from "../lib/numberFormat";

export function SkillStatsTripletLine({ stats }: { stats: SkillStatsTriplet }) {
  const formatted = formatSkillStatsTriplet(stats);
  return (
    <span className="skill-stats-triplet">
      <span className="skill-stats-item">
        <ArrowDownToLine size={14} aria-hidden="true" />
        {formatted.downloads}
      </span>
    </span>
  );
}
