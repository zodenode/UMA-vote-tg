export default function BlogGithubCta() {
  return (
    <aside className="landing-blog-cta" aria-label="Follow the author">
      <h2 className="landing-blog-cta-title">Stay posted</h2>
      <p className="landing-blog-cta-lead">
        I ship notes here first. For diffs, issues, and occasional static drops via{" "}
        <strong>GitHub Pages</strong>, follow the work in public.
      </p>
      <ul className="landing-blog-cta-links">
        <li>
          <a href="https://github.com/zodenode" target="_blank" rel="noreferrer">
            GitHub — @zodenode
          </a>
        </li>
        <li>
          <a href="https://uk.linkedin.com/in/edozie" target="_blank" rel="noreferrer">
            LinkedIn — Edozie
          </a>
        </li>
      </ul>
      <p className="landing-blog-cta-foot muted">Thank you for reading. More soon.</p>
    </aside>
  );
}
