import Link from "next/link";
import { signIn } from "../auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form action={signIn} className="card">
        <h1>
          GRD <span style={{ color: "var(--blue)" }}>Sales</span>
        </h1>
        <p className="muted small" style={{ margin: 0 }}>Go Raise Dough prospects and follow-ups. Team members only.</p>
        {sp.error && <div className="error">{sp.error}</div>}
        {sp.notice && <div className="notice">{sp.notice}</div>}
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <label>
          Email
          <input id="email" name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn" type="submit">Sign in</button>
        <p className="small muted" style={{ margin: 0 }}>
          First time here? <Link href="/signup">Create your account</Link> with your work email.
        </p>
      </form>
    </div>
  );
}
