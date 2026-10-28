import { inject } from "vitest";

// Runs before each test file: point DATABASE_URL at the test database from global setup.
process.env.DATABASE_URL = inject("testDatabaseUrl");
