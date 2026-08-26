function labelValue(content, label) {
  var escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var lines = String(content || '').replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  var re = new RegExp('^' + escaped + ':[ \\t]*(.*)$', 'i');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var match = line.match(re);
    if (!match) continue;
    if (match[1] && match[1].trim()) return match[1].trim();
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (!next || next.startsWith('<!--') || next.startsWith('|') || /^#+\s/.test(next)) continue;
      if (/^[A-Za-z][A-Za-z0-9 /&_-]*:[ \\t]*/.test(next)) break;
      return next;
    }
  }
  return '';
}

function sameLineLabelValue(content, label) {
  var escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('^\\s*' + escaped + ':[ \\t]*(.*)$', 'im');
  var match = String(content || '').replace(/<!--[\s\S]*?-->/g, '').match(re);
  return match && match[1] ? match[1].trim() : '';
}

module.exports = { labelValue: labelValue, sameLineLabelValue: sameLineLabelValue };
