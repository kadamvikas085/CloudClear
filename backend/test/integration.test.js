const { execSync } = require('child_process');
const path = require('path');

describe('AI service integration', () => {
  test('predict contract and health check', (done) => {
    const script = path.join(__dirname, '..', 'scripts', 'integration-runner.js');
    const node = process.execPath;
    const proc = require('child_process').spawn(node, [script], {
      stdio: 'inherit',
      env: Object.assign({}, process.env),
    });

    proc.on('close', (code) => {
      expect(code).toBe(0);
      done();
    });
  }, 60000);
});
