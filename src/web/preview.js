function qs(id) {
  return document.getElementById(id);
}

function text(value) {
  return value == null || value === '' ? '-' : String(value);
}

var params = new URLSearchParams(window.location.search);
var specId = params.get('spec') || '';
var artifact = params.get('artifact') || 'spec';

function setError(message) {
  qs('preview-title').textContent = 'Unable to preview artifact';
  qs('preview-path').textContent = '';
  qs('preview-content').textContent = message;
  qs('edit-artifact').disabled = true;
}

function openForEdit() {
  qs('edit-artifact').disabled = true;
  qs('edit-artifact').textContent = 'Opening';
  fetch('/api/specs/' + encodeURIComponent(specId) + '/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact: artifact })
  })
    .then(function(res) {
      return res.json().then(function(body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function(result) {
      if (!result.ok || result.body.error) throw new Error(result.body.error || 'Unable to open artifact.');
    })
    .catch(function(err) {
      setError(err.message || String(err));
    })
    .finally(function() {
      qs('edit-artifact').disabled = false;
      qs('edit-artifact').textContent = 'Edit';
    });
}

function loadPreview() {
  if (!specId) {
    setError('Missing spec id.');
    return;
  }
  fetch('/api/specs/' + encodeURIComponent(specId) + '/artifact?artifact=' + encodeURIComponent(artifact))
    .then(function(res) {
      return res.json().then(function(body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function(result) {
      if (!result.ok || result.body.error) throw new Error(result.body.error || 'Unable to load artifact.');
      qs('preview-eyebrow').textContent = text(result.body.label);
      qs('preview-title').textContent = text(result.body.relativePath);
      qs('preview-path').textContent = text(result.body.relativePath);
      qs('preview-content').textContent = text(result.body.content);
      qs('edit-artifact').disabled = false;
      qs('edit-artifact').onclick = openForEdit;
    })
    .catch(function(err) {
      setError(err.message || String(err));
    });
}

loadPreview();
