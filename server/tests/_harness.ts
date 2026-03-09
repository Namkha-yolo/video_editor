export interface SuiteResult {
  passed: number;
  failed: number;
}

export async function runSuite(
  suiteName: string,
  tests: Array<{ name: string; run: () => void | Promise<void> }>
): Promise<SuiteResult> {
  let passed = 0;
  let failed = 0;

  console.log(`\n${suiteName}`);

  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      console.log(`  PASS ${test.name}`);
    } catch (error: any) {
      failed += 1;
      console.log(`  FAIL ${test.name}`);
      console.log(`    ${error.message}`);
    }
  }

  return { passed, failed };
}
