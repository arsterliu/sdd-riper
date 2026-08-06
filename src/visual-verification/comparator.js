'use strict';

function visualImageError(message) {
  var error = new Error(message);
  error.name = 'VisualImageError';
  error.code = 'VISUAL_IMAGE_INVALID';
  return error;
}

function validateImage(image, name) {
  if (!image || !Number.isInteger(image.width) || image.width < 1 || !Number.isInteger(image.height) || image.height < 1 ||
      !Buffer.isBuffer(image.data) || image.data.length !== image.width * image.height * 4) {
    throw visualImageError(name + ' must contain complete RGBA pixels');
  }
}

function validateThreshold(options) {
  var threshold = options && options.threshold;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw visualImageError('threshold must be a finite ratio from 0 to 1');
  }
  return threshold;
}

function validateMasks(options) {
  var masks = options && options.masks;
  if (masks === undefined) return [];
  if (!Array.isArray(masks)) throw visualImageError('masks must be an array of static pixel rectangles');
  return masks.map(function(mask) {
    if (!mask || typeof mask !== 'object' || Array.isArray(mask) ||
        !Number.isInteger(mask.x) || !Number.isInteger(mask.y) || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) ||
        mask.x < 0 || mask.y < 0 || mask.width < 1 || mask.height < 1 ||
        Object.keys(mask).some(function(field) { return ['x', 'y', 'width', 'height'].indexOf(field) === -1; })) {
      throw visualImageError('masks must contain static pixel rectangles');
    }
    return mask;
  });
}

function masked(x, y, masks) {
  return masks.some(function(mask) {
    return x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height;
  });
}

function comparePixels(baseline, current, options) {
  validateImage(baseline, 'baseline');
  validateImage(current, 'current');
  var threshold = validateThreshold(options);
  var masks = validateMasks(options);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw visualImageError('baseline and current image dimensions must match');
  }

  var totalPixels = baseline.width * baseline.height;
  var diffPixels = Buffer.alloc(totalPixels);
  var changedPixels = 0;
  var maskedPixels = 0;
  for (var pixel = 0; pixel < totalPixels; pixel++) {
    var x = pixel % baseline.width;
    var y = Math.floor(pixel / baseline.width);
    if (masked(x, y, masks)) {
      maskedPixels += 1;
      continue;
    }
    var offset = pixel * 4;
    var changed = baseline.data[offset] !== current.data[offset] ||
      baseline.data[offset + 1] !== current.data[offset + 1] ||
      baseline.data[offset + 2] !== current.data[offset + 2] ||
      baseline.data[offset + 3] !== current.data[offset + 3];
    if (changed) {
      diffPixels[pixel] = 255;
      changedPixels += 1;
    }
  }
  var comparedPixels = totalPixels - maskedPixels;
  if (comparedPixels < 1) throw visualImageError('masks must leave at least one comparable pixel');
  var changedRatio = changedPixels / comparedPixels;
  return {
    decision: changedRatio <= threshold ? 'PASS' : 'FAIL',
    changedPixels: changedPixels,
    totalPixels: comparedPixels,
    maskedPixels: maskedPixels,
    changedRatio: changedRatio,
    threshold: threshold,
    diffPixels: diffPixels
  };
}

module.exports = { comparePixels: comparePixels };
