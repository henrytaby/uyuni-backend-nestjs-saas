import { config } from 'dotenv';

// Load environment for e2e tests. Prefer .env.test for test-specific overrides
// (e.g. a low RATE_LIMIT_LIMIT to exercise the 429 path within an e2e run).
// Fall back to .env if .env.test is absent. Defaults keep the suite runnable
// without any local .env (DATABASE_URL still required for a live instance).
try {
  const result = config({ path: '.env.test' });
  if (result.error) {
    config({ path: '.env' });
  }
} catch {
  config({ path: '.env' });
}
