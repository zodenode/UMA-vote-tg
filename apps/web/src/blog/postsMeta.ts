export type BlogPostMeta = {
  slug: string;
  title: string;
  subtitle: string;
  dateLabel: string;
};

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "why-i-built-uma-vote",
    title: "Why I built uma.vote",
    subtitle:
      "April 7th, 2026, a geopolitical market, and the quiet rage of a coder who still believes truth should win.",
    dateLabel: "April 2026",
  },
];

export function getPostMeta(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
