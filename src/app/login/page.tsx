import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <form
        action={login}
        className="w-full max-w-sm bg-background border border-border rounded-lg p-8 space-y-5 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-foreground">Phone Assured</h1>
          <p className="text-sm text-muted mt-1">Enter access password</p>
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-border rounded-md text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Password"
          />
        </div>
        {hasError && <p className="text-sm text-danger">Incorrect password.</p>}
        <button
          type="submit"
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
