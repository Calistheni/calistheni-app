const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;

export const safeLocalDatabase = (() => {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    return (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      /test/i.test(url.pathname)
    );
  } catch {
    return false;
  }
})();

if (process.env.REQUIRE_DATABASE_INTEGRATION === "1" && !safeLocalDatabase) {
  throw new Error(
    "Required database integration tests need AUTH_TEST_DATABASE_URL to point to a localhost database with a test-named database."
  );
}

export { databaseUrl };
