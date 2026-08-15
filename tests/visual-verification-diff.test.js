const assert = require('node:assert/strict');
const test = require('node:test');

const comparator = require('../src/visual-verification/comparator');

function image(width, height, pixels) {
  return { width, height, data: Buffer.from(pixels) };
}

test('returns an auditable PASS when every pixel is within the explicit threshold', () => {
  const baseline = image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
  const current = image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);

  const result = comparator.comparePixels(baseline, current, { threshold: 0 });

  assert.deepEqual(result, {
    decision: 'PASS',
    changedPixels: 0,
    totalPixels: 2,
    maskedPixels: 0,
    changedRatio: 0,
    threshold: 0,
    diffPixels: Buffer.from([0, 0])
  });
});

test('returns FAIL and a per-pixel diff artifact when the changed ratio exceeds the explicit threshold', () => {
  const baseline = image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
  const current = image(2, 1, [255, 0, 0, 255, 255, 255, 255, 255]);

  const result = comparator.comparePixels(baseline, current, { threshold: 0.4 });

  assert.equal(result.decision, 'FAIL');
  assert.equal(result.changedPixels, 1);
  assert.equal(result.totalPixels, 2);
  assert.equal(result.changedRatio, 0.5);
  assert.equal(result.threshold, 0.4);
  assert.deepEqual(result.diffPixels, Buffer.from([255, 0]));
});

test('excludes only explicitly configured static mask rectangles from pixel comparison', () => {
  const baseline = image(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
  const current = image(2, 1, [255, 0, 0, 255, 255, 255, 255, 255]);

  const result = comparator.comparePixels(baseline, current, {
    threshold: 0,
    masks: [{ x: 0, y: 0, width: 1, height: 1 }]
  });

  assert.equal(result.decision, 'PASS');
  assert.equal(result.changedPixels, 0);
  assert.equal(result.maskedPixels, 1);
  assert.deepEqual(result.diffPixels, Buffer.from([0, 0]));
});

test('rejects images with different dimensions even when both contain complete RGBA data', () => {
  const baseline = image(1, 1, [0, 0, 0, 255]);
  const current = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]);

  assert.throws(
    () => comparator.comparePixels(baseline, current, { threshold: 0 }),
    {
      code: 'VISUAL_IMAGE_INVALID',
      message: 'baseline and current image dimensions must match'
    }
  );
});

test('rejects images with incomplete RGBA data', () => {
  const baseline = image(1, 1, [0, 0, 0, 255]);

  assert.throws(
    () => comparator.comparePixels(baseline, image(1, 1, [0, 0]), { threshold: 0 }),
    error => error.code === 'VISUAL_IMAGE_INVALID'
  );
});
