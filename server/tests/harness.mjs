export async function runSuite(suiteName, tests) {
  let passed = 0;
  let failed = 0;

  console.log(`\n${suiteName}`);

  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      console.log(`  PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL ${test.name}`);
      console.log(`    ${error.message}`);
    }
  }

  return { passed, failed };
}
