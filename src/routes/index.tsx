import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronRight,
  Code2,
  Package,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { convexHttp } from "../convex/client";
import { fetchFeaturedPlugins } from "../lib/featuredCatalog";
import type { PackageListItem } from "../lib/packageApi";
import type { PublicSkill, PublicUser } from "../lib/publicUser";
import { getSiteName } from "../lib/site";

export const Route = createFileRoute("/")({
  component: SkillsHome,
});

type SkillPageEntry = {
  skill: PublicSkill;
  ownerHandle?: string | null;
  owner?: PublicUser | null;
  latestVersion?: unknown;
};

function SkillsHome() {
  const [latestSkills, setLatestSkills] = useState<SkillPageEntry[]>([]);
  const [latestPlugins, setLatestPlugins] = useState<PackageListItem[]>([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    convexHttp
      .query(api.skills.listPublicPageV4, { numItems: 6, dir: "desc" })
      .then((r) => {
        if (cancelled) return;
        const page = Array.isArray(r) ? [] : ((r as { page?: SkillPageEntry[] }).page ?? []);
        setLatestSkills(page);
      })
      .catch(() => {});
    fetchFeaturedPlugins(6)
      .then((items) => {
        if (!cancelled) setLatestPlugins(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void navigate({
      to: "/search",
      search: { q: trimmedQuery || undefined },
    });
  };

  const handleSuggestion = (term: string) => {
    void navigate({
      to: "/search",
      search: { q: term },
    });
  };

  const skillLink = (entry: SkillPageEntry) =>
    `/${encodeURIComponent(entry.ownerHandle || entry.owner?.handle || entry.skill.ownerUserId)}/${entry.skill.slug}`;

  return (
    <main className="home-v2-main">
      <section className="home-v2-hero">
        <div className="home-v2-hero-bg">
          <div className="home-v2-glow" />
          <div className="home-v2-dots" />
          <div className="home-v2-ring home-v2-ring-1" />
          <div className="home-v2-ring home-v2-ring-2" />
          <div className="home-v2-ring home-v2-ring-3" />
        </div>

        <h1 className="home-v2-headline">
          <span className="home-v2-headline-inner">
            <span className="home-v2-action-word">{getSiteName()}</span>
          </span>
        </h1>

        <p className="home-v2-sub">Internal registry — search and install skills and plugins.</p>

        <div className="home-v2-search-container">
          <form className="home-v2-search-bar" onSubmit={handleSearch}>
            <Search className="home-v2-search-icon" size={20} />
            <input
              autoFocus
              type="text"
              placeholder="Search skills or plugins"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="home-v2-search-go" aria-label="Search">
              <span className="home-v2-search-go-label">Search</span> <ArrowRight size={16} />
            </button>
          </form>
        </div>

        <div className="home-v2-suggestions">
          <button
            type="button"
            className="home-v2-suggestion"
            onClick={() => handleSuggestion("agent")}
          >
            agent
          </button>
          <button
            type="button"
            className="home-v2-suggestion"
            onClick={() => handleSuggestion("github")}
          >
            github
          </button>
          <button
            type="button"
            className="home-v2-suggestion"
            onClick={() => handleSuggestion("security")}
          >
            security
          </button>
          <button
            type="button"
            className="home-v2-suggestion"
            onClick={() => handleSuggestion("dashboard")}
          >
            dashboard
          </button>
        </div>
      </section>

      <section className="home-v2-categories">
        <div className="home-v2-categories-grid" data-count={3} data-layout="1-3">
          <Link
            to="/skills"
            search={{
              q: undefined,
              sort: undefined,
              dir: undefined,
              highlighted: undefined,
              view: undefined,
              focus: undefined,
            }}
            className="home-v2-cat-item"
          >
            <div className="home-v2-cat-icon">
              <Package size={20} />
            </div>
            <div className="home-v2-cat-text">
              <div className="home-v2-cat-name">Skills</div>
              <div className="home-v2-cat-desc">Agent skill bundles</div>
            </div>
            <span className="home-v2-cat-arrow">
              <ChevronRight size={16} />
            </span>
          </Link>
          <Link to="/plugins" className="home-v2-cat-item">
            <div className="home-v2-cat-icon">
              <Code2 size={20} />
            </div>
            <div className="home-v2-cat-text">
              <div className="home-v2-cat-name">Plugins</div>
              <div className="home-v2-cat-desc">Gateway plugins</div>
            </div>
            <span className="home-v2-cat-arrow">
              <ChevronRight size={16} />
            </span>
          </Link>
          <Link to="/publishers" className="home-v2-cat-item">
            <div className="home-v2-cat-icon">
              <Users size={20} />
            </div>
            <div className="home-v2-cat-text">
              <div className="home-v2-cat-name">Publishers</div>
              <div className="home-v2-cat-desc">Builders and orgs</div>
            </div>
            <span className="home-v2-cat-arrow">
              <ChevronRight size={16} />
            </span>
          </Link>
        </div>
      </section>

      {latestSkills.length > 0 && (
        <section className="home-v2-trending-section">
          <div className="home-v2-section-header">
            <h2>Latest skills</h2>
            <Link
              to="/skills"
              search={{
                q: undefined,
                sort: undefined,
                dir: undefined,
                featured: undefined,
                highlighted: undefined,
                view: undefined,
                focus: undefined,
              }}
              className="home-v2-section-link"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="home-v2-trending-grid">
            {latestSkills.map((entry) => (
              <Link key={entry.skill._id} to={skillLink(entry)} className="home-v2-trend-card">
                <div className="home-v2-trend-head">
                  <div className="home-v2-trend-title">
                    {entry.skill.displayName || entry.skill.slug}
                  </div>
                  <div className="home-v2-trend-creator">
                    by {entry.ownerHandle || entry.owner?.handle || "unknown"}
                  </div>
                </div>
                <div className="home-v2-trend-desc">
                  {entry.skill.summary || "Agent skill bundle."}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {latestPlugins.length > 0 && (
        <section className="home-v2-trending-section">
          <div className="home-v2-section-header">
            <h2>Latest plugins</h2>
            <Link
              to="/plugins"
              search={{
                q: undefined,
                cursor: undefined,
                family: undefined,
                featured: undefined,
                official: undefined,
                executesCode: undefined,
              }}
              className="home-v2-section-link"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="home-v2-trending-grid">
            {latestPlugins.slice(0, 6).map((plugin) => (
              <Link
                key={plugin.name}
                to="/plugins/$name"
                params={{ name: plugin.name }}
                className="home-v2-trend-card"
              >
                <div className="home-v2-trend-head">
                  <div className="home-v2-trend-title">{plugin.displayName || plugin.name}</div>
                  <div className="home-v2-trend-creator">
                    {plugin.ownerHandle ? `by @${plugin.ownerHandle}` : "community plugin"}
                  </div>
                </div>
                <div className="home-v2-trend-desc">
                  {plugin.summary || "Gateway plugin."}
                </div>
                <div className="home-v2-trend-bottom">
                  <div className="home-v2-trend-signals">
                    {plugin.isOfficial ? <span>Official</span> : null}
                    {plugin.latestVersion ? <span>v{plugin.latestVersion}</span> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
