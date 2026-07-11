function classifyIrreversibility(value) {
  var text = String(value || '').trim().toLowerCase();
  if (!text) return 'unknown';

  if (/无不可逆|不存在不可逆|没有不可逆|no irreversible|not irreversible/.test(text)) return 'reversible';
  if (/不可回滚|永久删除|永久清除|清空数据|不可恢复|delete data permanently|permanent(?:ly)? delete|cannot roll back|non-reversible/.test(text)) return 'irreversible';
  if (/\bnone\b|fully reversible|\breversible\b|no destructive|可回滚|全部可逆|完全可逆|无破坏性/.test(text)) return 'reversible';
  if (/\birreversible\b|\bdestructive\b|不可逆|破坏性|删除数据/.test(text)) return 'irreversible';
  return 'unknown';
}

module.exports = {
  classifyIrreversibility: classifyIrreversibility
};
