import { Link, Navigate, useParams } from "react-router-dom";
import { getPostMeta } from "../blog/postsMeta";
import WhyIBuiltUmaVote from "../blog/posts/WhyIBuiltUmaVote";
import BlogLayout from "../components/BlogLayout";

function PostBody({ slug }: { slug: string }) {
  switch (slug) {
    case "why-i-built-uma-vote":
      return <WhyIBuiltUmaVote />;
    default:
      return null;
  }
}

export default function BlogPost() {
  const { slug = "" } = useParams();

  if (!getPostMeta(slug)) {
    return <Navigate to="/blog" replace />;
  }

  return (
    <BlogLayout>
      <nav className="landing-blog-back" aria-label="Breadcrumb">
        <Link to="/blog" className="landing-feed-link">
          ← All posts
        </Link>
      </nav>
      <PostBody slug={slug} />
    </BlogLayout>
  );
}
