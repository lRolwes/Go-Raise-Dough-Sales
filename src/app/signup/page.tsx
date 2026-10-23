import Link from "next/link";
import { signUp } from "../auth-actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form action={signUp} className="card">
        <h1>Create your account</h1>
        <p className="muted small" style={{ margin: 0 }}>
          Only emails on the sales team list can sign up. Choose a password of at least 8 characters.
        </p>
        {sp.error && <div className="error">{sp.error}</div>}
        <label>
          Work email
          <input id="email" name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          New password
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <button className="btn" type="submit">Create account</button>
        <p className="small muted" style={{ margin: 0 }}>
          Already set up? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
