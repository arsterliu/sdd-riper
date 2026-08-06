'use strict';

var zlib = require('zlib');

var SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var MAX_PIXELS = 25 * 1024 * 1024;

function pngError(message) {
  var error = new Error(message);
  error.name = 'VisualPngError';
  error.code = 'VISUAL_IMAGE_INVALID';
  return error;
}

function crc32(buffer) {
  var value = 0xffffffff;
  for (var index = 0; index < buffer.length; index++) {
    value ^= buffer[index];
    for (var bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  var trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, Buffer.from(type, 'ascii'), data, trailer]);
}

function paeth(left, above, upperLeft) {
  var prediction = left + above - upperLeft;
  var leftDistance = Math.abs(prediction - left);
  var aboveDistance = Math.abs(prediction - above);
  var upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decode(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < SIGNATURE.length || !buffer.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw pngError('input is not a PNG');
  var offset = SIGNATURE.length;
  var header;
  var compressed = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw pngError('PNG chunk is truncated');
    var length = buffer.readUInt32BE(offset);
    var type = buffer.toString('ascii', offset + 4, offset + 8);
    var dataStart = offset + 8;
    var dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw pngError('PNG chunk data is truncated');
    var data = buffer.subarray(dataStart, dataEnd);
    if (buffer.readUInt32BE(dataEnd) !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) throw pngError('PNG chunk checksum is invalid');
    if (type === 'IHDR') header = data;
    else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') break;
    offset = dataEnd + 4;
  }
  if (!header || header.length !== 13 || !compressed.length) throw pngError('PNG header or data is missing');
  var width = header.readUInt32BE(0);
  var height = header.readUInt32BE(4);
  var colorType = header[9];
  var bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || width * height > MAX_PIXELS || header[8] !== 8 || !bytesPerPixel || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) {
    throw pngError('PNG must be a non-interlaced 8-bit RGB or RGBA image within the size limit');
  }
  var scanlines;
  try { scanlines = zlib.inflateSync(Buffer.concat(compressed)); }
  catch (_) { throw pngError('PNG data cannot be inflated'); }
  var stride = width * bytesPerPixel;
  if (scanlines.length !== (stride + 1) * height) throw pngError('PNG scanline length is invalid');
  var output = Buffer.alloc(stride * height);
  for (var row = 0; row < height; row++) {
    var filter = scanlines[row * (stride + 1)];
    if (filter > 4) throw pngError('PNG filter is unsupported');
    var sourceOffset = row * (stride + 1) + 1;
    var targetOffset = row * stride;
    for (var column = 0; column < stride; column++) {
      var raw = scanlines[sourceOffset + column];
      var left = column >= bytesPerPixel ? output[targetOffset + column - bytesPerPixel] : 0;
      var above = row ? output[targetOffset - stride + column] : 0;
      var upperLeft = row && column >= bytesPerPixel ? output[targetOffset - stride + column - bytesPerPixel] : 0;
      output[targetOffset + column] = filter === 0 ? raw : filter === 1 ? (raw + left) & 255 : filter === 2 ? (raw + above) & 255 :
        filter === 3 ? (raw + Math.floor((left + above) / 2)) & 255 : (raw + paeth(left, above, upperLeft)) & 255;
    }
  }
  if (bytesPerPixel === 4) return { width: width, height: height, data: output };
  var rgba = Buffer.alloc(width * height * 4);
  for (var pixel = 0; pixel < width * height; pixel++) {
    output.copy(rgba, pixel * 4, pixel * 3, pixel * 3 + 3);
    rgba[pixel * 4 + 3] = 255;
  }
  return { width: width, height: height, data: rgba };
}

function encode(image) {
  if (!image || !Number.isInteger(image.width) || image.width < 1 || !Number.isInteger(image.height) || image.height < 1 ||
      image.width * image.height > MAX_PIXELS || !Buffer.isBuffer(image.data) || image.data.length !== image.width * image.height * 4) throw pngError('RGBA image is invalid');
  var header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  var stride = image.width * 4;
  var scanlines = Buffer.alloc((stride + 1) * image.height);
  for (var row = 0; row < image.height; row++) image.data.copy(scanlines, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function diffImage(width, height, diffPixels) {
  if (!Buffer.isBuffer(diffPixels) || diffPixels.length !== width * height) throw pngError('diff pixels are invalid');
  var data = Buffer.alloc(width * height * 4);
  for (var pixel = 0; pixel < diffPixels.length; pixel++) {
    if (diffPixels[pixel]) {
      data[pixel * 4] = 255;
      data[pixel * 4 + 3] = 255;
    }
  }
  return { width: width, height: height, data: data };
}

module.exports = { decode: decode, encode: encode, diffImage: diffImage };
