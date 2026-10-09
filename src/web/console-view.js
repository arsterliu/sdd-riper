(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ConsoleView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var phaseNames = { research: '调研', innovate: '方案', design: '设计', acceptance: '验收', plan: '计划',
    execute: '实施', challenge: '审查', learning: '学习', archive_authorization: '待授权归档', archived: '已归档' };
  var statusNames = { draft: '草稿', active: '活动', in_progress: '进行中', completed: '已完成', archived: '已归档' };
  var workNames = { archived: '已归档 · 只读', awaiting_archive_authorization: '待授权归档',
    needs_repair: '待修复', awaiting_plan_approval: '待批准计划', awaiting_challenge: '待独立审查',
    in_progress: '进行中', unavailable: '状态暂不可用' };

  function escape(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isArchived(spec) {
    return !!spec && (spec.status === 'archived' || spec.phase === 'archived' ||
      spec.workState && spec.workState.id === 'archived');
  }
  function phaseLabel(value) { return phaseNames[value] || value || '未提供'; }
  function statusLabel(value) { return statusNames[value] || value || '未提供'; }
  function workLabel(spec) {
    if (isArchived(spec)) return workNames.archived;
    var work = spec && spec.workState || {};
    return workNames[work.id] || work.label || workNames.unavailable;
  }
  function filterTasks(specs, query, scope) {
    query = String(query || '').trim().toLowerCase();
    return specs.filter(function(spec) {
      if (!isTaskRecord(spec)) return false;
      if (scope === 'active' && isArchived(spec) || scope === 'archived' && !isArchived(spec)) return false;
      return !query || [spec.taskName, spec.slug, spec.version, spec.relativePath, spec.mode, spec.phase,
        spec.status, spec.reviewVerdict, spec.workState && spec.workState.id, spec.workState && spec.workState.label,
        phaseLabel(spec.phase), statusLabel(spec.status), workLabel(spec)].join(' ').toLowerCase().indexOf(query) !== -1;
    });
  }
  function isTaskRecord(spec) { return String(spec.fileName || '').toLowerCase() !== 'index.md'; }
  function goalFromSpec(content) {
    var intake = (String(content || '').match(/^## Intake\s*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m) || [])[1] || '';
    return ((intake.match(/^Goal:\s*(.+)$/m) || intake.match(/^Requirement:\s*(.+)$/m) || [])[1] || '').trim();
  }
  function inline(value) {
    var html = '', cursor = 0;
    var tokens = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    var match;
    while ((match = tokens.exec(value))) {
      html += escape(value.slice(cursor, match.index));
      if (match[1]) html += '<code>' + escape(match[1]) + '</code>';
      else {
        var safe = false;
        try { var url = new URL(match[3]); safe = url.protocol === 'http:' || url.protocol === 'https:'; } catch (e) {}
        html += safe ? '<a href="' + escape(match[3]) + '" target="_blank" rel="noopener noreferrer">' + escape(match[2]) + '</a>' : escape(match[2]);
      }
      cursor = tokens.lastIndex;
    }
    return html + escape(value.slice(cursor));
  }
  function documentHtml(content) {
    var source = String(content || '').replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    var html = [], paragraph = [], code = null, list = false, section = 0;
    function flush() { if (paragraph.length) { html.push('<p>' + paragraph.map(inline).join('<br>') + '</p>'); paragraph = []; } }
    function closeList() { if (list) { html.push('</ul>'); list = false; } }
    source.split(/\r?\n/).forEach(function(line) {
      if (/^\s*```/.test(line)) {
        flush(); closeList();
        if (code !== null) { html.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>'); code = null; }
        else code = [];
        return;
      }
      if (code !== null) { code.push(line); return; }
      var heading = line.match(/^(#{1,6})\s+(.+)$/);
      var item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      if (heading) {
        flush(); closeList();
        var level = heading[1].length;
        html.push('<h' + level + ' id="document-section-' + section++ + '" data-section="' + escape(heading[2]) + '" tabindex="-1">' + inline(heading[2]) + '</h' + level + '>');
      } else if (item) {
        flush(); if (!list) { html.push('<ul>'); list = true; }
        html.push('<li>' + inline(item[1]) + '</li>');
      } else if (!line.trim()) { flush(); closeList(); }
      else { closeList(); paragraph.push(line); }
    });
    flush(); closeList();
    if (code !== null) html.push('<pre><code>' + escape(code.join('\n')) + '</code></pre>');
    return html.join('') || '<p>制品暂无正文，可切换原文查看。</p>';
  }
  return { isArchived: isArchived, phaseLabel: phaseLabel, statusLabel: statusLabel, workLabel: workLabel,
    filterTasks: filterTasks, isTaskRecord: isTaskRecord, goalFromSpec: goalFromSpec, documentHtml: documentHtml };
});
