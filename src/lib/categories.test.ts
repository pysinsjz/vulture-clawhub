import { describe, expect, it } from "vitest";
import { buildSkillCategoryBrowseHref } from "./categories";

describe("buildSkillCategoryBrowseHref", () => {
  it("builds a browse link from the category filter slug", () => {
    expect(buildSkillCategoryBrowseHref({ slug: "sourcing", label: "货源与选品" })).toBe(
      "/skills?category=sourcing",
    );
  });
});
