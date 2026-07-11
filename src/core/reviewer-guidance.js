var AUDITABLE_REVIEWER_TYPES = 'subagent:<id>, external-agent:<id>, human:<name>';
var REVIEWER_AUTHORIZATION_HINT = 'If you use a subagent, external-agent, review bot, or any other automated reviewer tool that requires authorization, pause and request explicit user authorization before proceeding.';
var REVIEWER_INTEGRITY_HINT = 'Do not skip the gate or fabricate reviewer evidence.';

function reviewerTypeLine() {
  return 'Auditable reviewer types: ' + AUDITABLE_REVIEWER_TYPES + '; micro Challenge may use inline.';
}

function authorizationLine() {
  return REVIEWER_AUTHORIZATION_HINT;
}

function integrityLine() {
  return REVIEWER_INTEGRITY_HINT;
}

function guidanceLines() {
  return [
    reviewerTypeLine(),
    authorizationLine(),
    integrityLine()
  ];
}

function inlineGuidance() {
  return reviewerTypeLine() + ' ' + authorizationLine() + ' ' + integrityLine();
}

module.exports = {
  AUDITABLE_REVIEWER_TYPES: AUDITABLE_REVIEWER_TYPES,
  REVIEWER_AUTHORIZATION_HINT: REVIEWER_AUTHORIZATION_HINT,
  REVIEWER_INTEGRITY_HINT: REVIEWER_INTEGRITY_HINT,
  reviewerTypeLine: reviewerTypeLine,
  authorizationLine: authorizationLine,
  integrityLine: integrityLine,
  guidanceLines: guidanceLines,
  inlineGuidance: inlineGuidance
};
