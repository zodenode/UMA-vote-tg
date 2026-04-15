import { Link } from "react-router-dom";
import { BLOG_POSTS } from "../blog/postsMeta";
import BlogGithubCta from "../components/BlogGithubCta";
import BlogLayout from "../components/BlogLayout";

export default function BlogIndex() {
  return (
    <BlogLayout>
      <header className="landing-blog-header">
        <p className="landing-blog-eyebrow">Journal</p>
        <h1 className="landing-blog-h1">
          Notes from the <span className="landing-title-accent">builder&apos;s bench</span>
        </h1>
        <p className="landing-blog-index-lead">
          Longer writing about oracles, markets, and the human cost of bad resolutions — plus where to follow the code.
        </p>
      </header>

      <ul className="landing-blog-list">
        {BLOG_POSTS.map((p) => (
          <li key={p.slug}>
            <Link to={`/blog/${p.slug}`} className="landing-blog-list-card">
              <span className="landing-blog-list-date">{p.dateLabel}</span>
              <span className="landing-blog-list-title">{p.title}</span>
              <span className="landing-blog-list-sub">{p.subtitle}</span>
            </Link>
          </li>
        ))}
      </ul>

      <BlogGithubCta />
    </BlogLayout>
  );
}
