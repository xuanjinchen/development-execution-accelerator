# Fixture Execution Contract

- Treat the catalog and billing changes as two medium, independent conflict domains. Keep one writer in each domain.
- Prevent concurrent writers from editing the same file.
- Do not change `package.json`, the corpus verifier, or the tests.
- Run `npm run test:catalog` and `npm run test:billing` for the focused domains, then run the aggregate `npm test` gate exactly once for the final input identity.
- Use only the Node.js standard library and preserve unrelated worktree changes.
