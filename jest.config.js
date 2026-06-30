// This project uses node:test (node --test tests/*.test.js), not Jest.
// This config prevents `npx jest` from accidentally running node:test files,
// which would fail because Jest does not understand node:test's describe/it API.
// To run tests: npm test
module.exports = {
  // Only match a pattern that will never exist in this repo
  testMatch: ['**/jest-tests-are-not-used-here/**/*.test.js'],
};
