import type { ReactNode } from "react";
import LandingNav from "./LandingNav";

type Props = {
  children: ReactNode;
};

/** Same chrome as the marketing home: fixed gradient mesh + Outfit nav. */
export default function BlogLayout({ children }: Props) {
  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden />
      <LandingNav />
      <main className="landing-main landing-main--blog">{children}</main>
    </div>
  );
}
