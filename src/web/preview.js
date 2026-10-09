function qs(id) { return document.getElementById(id); }
var params = new URLSearchParams(window.location.search);
var specId = params.get('spec') || '';
var artifact = params.get('artifact') || 'spec';
var readOnly = true;
var previewLoaded = false;

function setError(message) {
  qs('preview-error').textContent = message;
  qs('edit-artifact').hidden = true;
  qs('edit-artifact').disabled = true;
}
function setMode(raw) {
  qs('preview-content').hidden = raw;
  qs('preview-raw').hidden = !raw;
  qs('preview-formatted').setAttribute('aria-pressed', String(!raw));
  qs('preview-source').setAttribute('aria-pressed', String(raw));
}
function jsonResponse(res) {
  return res.json().then(function(body) {
    if (!res.ok || body.error) throw new Error(body.error || '无法读取制品');
    return body;
  });
}
function openForEdit() {
  if (readOnly || !previewLoaded) return;
  var button = qs('edit-artifact');
  button.disabled = true;
  button.textContent = '正在打开…';
  fetch('/api/specs/' + encodeURIComponent(specId) + '/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifact: artifact })
  }).then(jsonResponse).then(function() {
    qs('preview-error').textContent = '已在本地编辑器打开';
  }).catch(function(err) {
    setError(err.message || String(err));
  }).finally(function() {
    button.disabled = !previewLoaded || readOnly;
    button.textContent = '打开本地文件';
  });
}
function loadPreview() {
  if (!specId) { setError('缺少任务标识'); return; }
  Promise.all([
    fetch('/api/specs/' + encodeURIComponent(specId)).then(jsonResponse),
    fetch('/api/specs/' + encodeURIComponent(specId) + '/artifact?artifact=' + encodeURIComponent(artifact)).then(jsonResponse)
  ]).then(function(results) {
    var spec = results[0], body = results[1];
    readOnly = ConsoleView.isArchived(spec);
    previewLoaded = true;
    qs('preview-eyebrow').textContent = body.label || '制品阅读';
    qs('preview-title').textContent = spec.taskName || body.relativePath;
    qs('preview-path').textContent = body.relativePath || '';
    qs('preview-access').textContent = readOnly ? '已归档 · 只读' : '任务制品';
    qs('preview-content').innerHTML = ConsoleView.documentHtml(body.content);
    qs('preview-raw').textContent = body.content || '';
    qs('edit-artifact').hidden = readOnly;
    qs('edit-artifact').disabled = readOnly;
    qs('edit-artifact').onclick = openForEdit;
  }).catch(function(err) {
    qs('preview-title').textContent = '无法读取制品';
    setError(err.message || String(err));
  });
}
qs('preview-formatted').addEventListener('click', function() { setMode(false); });
qs('preview-source').addEventListener('click', function() { setMode(true); });
loadPreview();
