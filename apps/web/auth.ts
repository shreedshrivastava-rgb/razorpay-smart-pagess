import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Sign-in is via Google OAuth. Sessions use the default JWT strategy (no DB
 * adapter needed). A page's owner is identified by the signed-in user's email,
 * which is stable and unique — see `ownerId()` below and the page store.
 *
 * Required env vars (see .env.local):
 *   AUTH_SECRET          – random secret (npx auth secret)
 *   AUTH_GOOGLE_ID       – Google OAuth client id
 *   AUTH_GOOGLE_SECRET   – Google OAuth client secret
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    // Keep the user id (email) available on the session token.
    jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
    session({ session, token }) {
      if (token.email && session.user) session.user.email = token.email;
      return session;
    },
  },
});

/**
 * The owner identifier for the currently signed-in user, or null when not
 * authenticated. Pages are scoped to this value.
 */
export async function ownerId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}
