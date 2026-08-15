const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const aiConfigRules = require('../src/core/ai-config-rules');
const genAiConfigs = require('../src/commands/_gen-ai-configs');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.resolve(ROOT, file), 'utf-8');
}

function paragraphWithTerms(text, terms) {
  return text.split(/\r?\n\s*\r?\n/).some(function(paragraph) {
    return terms.every(function(pattern) { return pattern.test(paragraph); });
  });
}

function sectionSatisfiesRule(text, rule) {
  const paragraphs = text.split(/\r?\n\s*\r?\n/);
  const hasPositive = paragraphs.some(function(paragraph) {
    return rule.terms.every(function(pattern) { return pattern.test(paragraph); });
  });
  const hasRejectedMeaning = (rule.rejectPatterns || []).some(function(pattern) {
    return paragraphs.some(function(paragraph) { return pattern.test(paragraph); });
  });
  return hasPositive && !hasRejectedMeaning;
}

function visualCapabilitySource() {
  return aiConfigRules.CAPABILITY_ROUTING.join('\n');
}

const CURRENT_SCREENSHOT = /(?:current(?: screenshot)?|当前截图|实际截图)/i;

const fidelityRoutingRules = [
  {
    name: 'fidelity requires a decodable PNG',
    terms: [/fidelity/i, /PNG/i, /(?:可解码|decodable)/i],
    rejectPatterns: [
      /fidelity(?=[^.;。\n]{0,220}PNG)(?=[^.;。\n]{0,220}(?:decodable|可解码))(?=[^.;。\n]{0,220}(?:does not require|do not require|need not(?: be| require)?|doesn't require|is not required|不要求|不需要|无需|不必))[^.;。\n]*/i,
      /(?:decodable|可解码)[^.;。\n]{0,30}PNG[^.;。\n]{0,100}(?:is not required|not required|并非必须|不是必需)[^.;。\n]{0,60}fidelity/i
    ]
  },
  {
    name: 'fidelity requires explicit scenario, route, state, and viewport',
    terms: [/fidelity/i, /(?:scenario|场景)/i, /(?:route|路由)/i, /(?:state|状态)/i, /(?:viewport|视口)/i, /(?:明确|显式|explicit)/i],
    rejectPatterns: [
      /fidelity(?=[^.;。\n]{0,320}(?:does not require|do not require|need not require|doesn't require|不要求|不需要|无需|不必))(?=[^.;。\n]{0,320}(?:scenario|场景))(?=[^.;。\n]{0,320}(?:route|路由))(?=[^.;。\n]{0,320}(?:state|状态))(?=[^.;。\n]{0,320}(?:viewport|视口))[^.;。\n]*/i
    ]
  },
  {
    name: 'fidelity requires comparable target and current dimensions',
    terms: [/fidelity/i, /(?:target|目标)/i, CURRENT_SCREENSHOT, /(?:尺寸|维度|size|dimensions)/i, /(?:可比|comparable)/i],
    rejectPatterns: [
      /fidelity[^.;。\n]{0,220}(?:need not be comparable|do not need to be comparable|does not require comparable|不要求可比|不需要可比|无需可比|不必可比)/i,
      /(?:target|目标)[^.;。\n]{0,160}(?:current screenshot|当前截图|实际截图)[^.;。\n]{0,160}(?:need not be comparable|do not need to be comparable|不需要可比|无需可比|不必可比)[^.;。\n]{0,80}fidelity/i
    ]
  },
  {
    name: 'fidelity requires stable data, fonts, and assets',
    terms: [/fidelity/i, /(?:测试数据|test data)/i, /(?:字体|fonts?)/i, /(?:资源|assets?)/i, /(?:稳定|stable)/i],
    rejectPatterns: [
      /fidelity[^.;。\n]{0,160}(?:does not require|do not require|need not require|doesn't require|不要求|不需要|无需|不必)[^.;。\n]{0,120}(?:stable|稳定)[^.;。\n]{0,160}(?:test data|测试数据)[^.;。\n]{0,160}(?:fonts?|字体)[^.;。\n]{0,160}(?:assets?|资源)/i
    ]
  },
  {
    name: 'otherwise routes to direction',
    terms: [/fidelity/i, /direction/i, /(?:否则|不满足|otherwise|else)/i]
  },
  {
    name: 'the Agent explains why it recommends direction or fidelity',
    terms: [/(?:Agent|AI)/i, /direction/i, /fidelity/i, /(?:推荐|recommend)/i, /(?:说明|解释|理由|reason|why)/i]
  },
  {
    name: 'candidate and default images do not constitute human approval',
    terms: [/(?:候选|candidate)/i, /(?:默认(?:图片|图像|图)|default image)/i, /(?:人工批准|人工认可|human approval|human-approved)/i, /(?:不等同|不代表|不能视为|does not (?:equal|mean|constitute)|do not (?:equal|mean|constitute))/i]
  }
];

const strictVisualBoundaryRules = [
  {
    name: 'strict visual evidence activates only when the current user explicitly runs visual init',
    terms: [/(?:strict visual evidence|严格视觉证据)/i, /(?:activat(?:e[sd]?|ion)|becomes? active|启用|激活|生效)/i, /(?:only (?:when|if|after|via)|仅当|只有)/i, /(?:current user|当前用户)/i, /(?:explicit(?:ly)?\s+(?:runs?|run)|显式运行)/i, /visual init/i],
    rejectPatterns: [
      /(?:strict visual evidence|严格视觉证据)[^.;。\n]{0,160}(?:activat(?:e[sd]?)?|启用|激活|生效)[^.;。\n]{0,160}(?:even when|without|无需|不需要|即使)[^.;。\n]{0,120}(?:current user|当前用户)[^.;。\n]{0,120}(?:does not|不)[^.;。\n]{0,80}(?:explicitly run|显式运行)[^.;。\n]{0,80}visual init/i
    ]
  },
  {
    name: 'scenario.baseline.path is contained in the current Spec Context lexically and by realpath',
    terms: [/scenario\.baseline\.path/i, /(?:current|当前|本次)[^\n]{0,30}Spec/i, /Context/i, /(?:lexical|词法)/i, /realpath/i, /(?:project-local|项目内|项目本地)/i, /containment/i],
    rejectPatterns: [
      /scenario\.baseline\.path[^.;。\n]{0,220}(?:need not|does not (?:need|have) to|does not require|无需|不必)[^.;。\n]{0,220}(?:current Spec Context|当前 Spec Context|lexical|词法|realpath|project-local|项目内|项目本地|containment)/i
    ]
  },
  {
    name: 'Provider scenario mapping is static and project-local',
    terms: [/Provider/i, /(?:scenario|场景)/i, /(?:mapping|映射)/i, /(?:static|静态)/i, /(?:project-local|项目内|项目本地)/i],
    rejectPatterns: [
      /(?:Provider[^.;。\n]{0,100}(?:scenario|场景)[^.;。\n]{0,80}(?:mapping|映射)|(?:scenario|场景)[^.;。\n]{0,80}(?:mapping|映射)[^.;。\n]{0,100}Provider)[^.;。\n]{0,120}(?:need not|does not (?:need|have) to|does not require|无需|不必)[^.;。\n]{0,80}(?:static|静态|project-local|项目内|项目本地)/i
    ]
  },
  {
    name: 'any Provider, config, contract, baseline, or code-state change makes the Visual Run stale',
    terms: [/Provider/i, /(?:config|配置)/i, /(?:contract|合同)/i, /(?:baseline|基线)/i, /(?:code[- ]state|code state|代码状态)/i, /(?:any|each|任一|任何)/i, /(?:change|变化)/i, /(?:Visual Run|视觉运行|Run)/i, /stale/i],
    rejectPatterns: [
      /(?:Provider|config|配置|contract|合同|baseline|基线|code[- ]state|code state|代码状态)[^.;。\n]{0,260}(?:changes?|变化)[^.;。\n]{0,100}(?:do not|does not|不会|不)[^.;。\n]{0,80}(?:make|become|标为|变为)?[^.;。\n]{0,40}stale/i
    ]
  },
  {
    name: 'the visual contract does not create an Archive Gate',
    terms: [/(?:visual contract|视觉合同)/i, /(?:does not|doesn't|must not|never|不得|不会|不)/i, /(?:create|add|introduce|新增|创建)/i, /Archive Gate/i],
    rejectPatterns: [
      /(?:visual contract|视觉合同)\s+(?:creates?|adds?|introduces?|新增|创建)[^.;。\n]{0,80}(?:an? )?Archive Gate/i,
      /(?:visual contract|视觉合同)[^.;。\n]{0,60}(?:does not|doesn't|不会|不)[^.;。\n]{0,40}(?:avoid|prevent|避免|阻止)[^.;。\n]{0,40}(?:creating|adding|introducing|新增|创建)[^.;。\n]{0,80}(?:an? )?Archive Gate/i
    ]
  }
];

const visualProviderBoundaryRules = [
  {
    name: 'visual routing must not implicitly initialize or approve its Provider',
    terms: [/(?:visual (?:routing|contract)|视觉(?:路由|合同))/i, /Provider/i, /(?:implicitly|隐式)/i, /(?:initialize|初始化)/i, /(?:approve|批准)/i, /(?:must (?:not|never)|does not|never|不得|不会)/i],
    rejectPatterns: [
      /visual init[^.;。\n]{0,120}(?:also|同时|也)[^.;。\n]{0,80}(?:authoriz(?:e[sd]?)?|approv(?:e[sd]?)?|授权|批准)[^.;。\n]{0,80}(?:visual )?Provider/i,
      /(?:visual (?:routing|contract)|视觉(?:路由|合同))[^.;。\n]{0,120}(?:may|can|will|可以|可|会)[^.;。\n]{0,80}(?:implicitly|隐式)[^.;。\n]{0,80}(?:initialize|初始化)[^.;。\n]{0,80}(?:approve|批准)[^.;。\n]{0,80}Provider/i
    ]
  },
  {
    name: 'only an approved fidelity contract may configure the separate playwright-visual Provider',
    terms: [/(?:only|仅|只有)/i, /(?:approved|获批|批准完成)/i, /fidelity/i, /contract|合同/i, /(?:configur(?:e[sd]?|ation)|配置)/i, /(?:separate|独立)/i, /playwright-visual/i, /Provider/i],
    rejectPatterns: [
      /(?:any|every|任意|所有)[^.;。\n]{0,80}(?:visual )?(?:contract|合同)[^.;。\n]{0,100}(?:may|can|可以|可)[^.;。\n]{0,80}(?:configur(?:e[sd]?|ation)|配置)[^.;。\n]{0,100}playwright-visual[^.;。\n]{0,40}Provider/i,
      /(?:direction|pending|unapproved|未批准|待批准)[^.;。\n]{0,80}(?:contract|合同)[^.;。\n]{0,100}(?:may|can|可以|可)[^.;。\n]{0,80}(?:configur(?:e[sd]?|ation)|配置)[^.;。\n]{0,100}playwright-visual[^.;。\n]{0,40}Provider/i
    ]
  }
];

if (!module.parent) {

test('CORE_RULES stays within the confirmed 20-line budget', function() {
  assert.ok(aiConfigRules.CORE_RULES.length <= 20,
    'CORE_RULES must stay <= 20 lines, got ' + aiConfigRules.CORE_RULES.length);
});

test('every canonical core rule line appears in SKILL.md', function() {
  const skill = read('SKILL.md');
  aiConfigRules.CORE_RULES.forEach(function(line) {
    const needle = line.replace(/^- /, '').trim();
    assert.ok(skill.indexOf(needle) !== -1, 'SKILL.md must contain canonical rule: ' + line);
  });
});

test('generated AI config block never references REFERENCE.md', function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-parity-'));
  genAiConfigs.run(root, 'lite');
  ['AGENTS.md', 'CLAUDE.md', '.cursorrules', path.join('.github', 'copilot-instructions.md')].forEach(function(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.strictEqual(text.indexOf('REFERENCE.md'), -1, file + ' must not depend on unreachable REFERENCE.md');
  });
});

test('shared visual rule helpers accept reverse word order and reject negated boundaries', function() {
  const positiveFixtures = [
    'A decodable PNG is required for fidelity.',
    'Explicit viewport and state with route and scenario are required for fidelity.',
    'Comparable dimensions between current screenshot and target are required for fidelity.',
    'Stable fonts, assets, and test data are required for fidelity.'
  ];
  const negativeFixtures = [
    'For fidelity, a PNG need not be decodable.',
    'Fidelity does not require an explicit viewport, state, route, or scenario.',
    'For fidelity, target and current screenshot dimensions need not be comparable.',
    'Fidelity does not require stable test data, fonts, or assets.'
  ];

  fidelityRoutingRules.slice(0, 4).forEach(function(rule, index) {
    assert.equal(sectionSatisfiesRule(positiveFixtures[index], rule), true, rule.name + ' positive reverse-order fixture');
    assert.equal(sectionSatisfiesRule(negativeFixtures[index], rule), false, rule.name + ' negated fixture');
  });
  assert.equal(
    sectionSatisfiesRule('Fidelity requires a decodable PNG; an old-page screenshot is not required.', fidelityRoutingRules[0]),
    true,
    'an unrelated safe negative clause must not negate the decodable-PNG prerequisite'
  );

  const strictPositiveFixtures = [
    'Only when the current user explicitly runs `sdd visual init` does strict visual evidence activate.',
    '`scenario.baseline.path` uses current Spec Context; project-local realpath and lexical containment both apply.',
    'Static and project-local is the Provider scenario mapping.',
    'Any change to code-state, baseline, contract, config, or Provider makes the Visual Run stale.',
    'The visual contract does not create an Archive Gate.'
  ];
  const strictNegativeFixtures = [
    'Strict visual evidence activates even when the current user does not explicitly run `sdd visual init`.',
    '`scenario.baseline.path` need not pass current Spec Context lexical, realpath, project-local containment.',
    'The Provider scenario mapping need not be static or project-local.',
    'Provider, config, contract, baseline, and code-state changes do not make any Visual Run stale.',
    'The visual contract creates an Archive Gate.'
  ];

  strictVisualBoundaryRules.forEach(function(rule, index) {
    assert.equal(sectionSatisfiesRule(strictPositiveFixtures[index], rule), true, rule.name + ' positive reverse-order fixture');
    assert.equal(sectionSatisfiesRule(strictNegativeFixtures[index], rule), false, rule.name + ' negated fixture');
  });

  const equivalentPositiveFixtures = [
    'Strict visual evidence is activated only via `sdd visual init` explicitly run by the current user.',
    'The baseline path `scenario.baseline.path` has lexical and realpath containment in project-local Context for the current Spec.',
    'Project-local and static scenario mapping is maintained by the Provider.',
    'Each Provider, config, contract, baseline, or code state change marks the Run stale.',
    'The visual contract never adds an Archive Gate.'
  ];
  strictVisualBoundaryRules.forEach(function(rule, index) {
    assert.equal(sectionSatisfiesRule(equivalentPositiveFixtures[index], rule), true, rule.name + ' equivalent English fixture');
  });
  assert.equal(
    sectionSatisfiesRule('The visual contract does not avoid creating an Archive Gate.', strictVisualBoundaryRules[4]),
    false,
    'a double-negative Archive Gate claim must not satisfy the no-gate boundary'
  );

  const providerPositiveFixtures = [
    'Visual routing must not implicitly initialize or approve its visual Provider.',
    'Only an approved fidelity contract may configure the separate `playwright-visual` Provider.'
  ];
  const providerNegativeFixtures = [
    '`sdd visual init` also authorizes the visual Provider.',
    'Any visual contract may configure the separate `playwright-visual` Provider.'
  ];
  visualProviderBoundaryRules.forEach(function(rule, index) {
    assert.equal(sectionSatisfiesRule(providerPositiveFixtures[index], rule), true, rule.name + ' positive fixture');
    assert.equal(sectionSatisfiesRule(providerNegativeFixtures[index], rule), false, rule.name + ' negative fixture');
    assert.equal(
      sectionSatisfiesRule(providerPositiveFixtures[index] + '\n\n' + providerNegativeFixtures[index], rule),
      false,
      rule.name + ' must reject a contradictory Visual rule'
    );
  });
});

fidelityRoutingRules.forEach(function(rule) {
  test('src/core/ai-config-rules.js states that ' + rule.name, function() {
    assert.ok(
      sectionSatisfiesRule(visualCapabilitySource(), rule),
      'CAPABILITY_ROUTING must state: ' + rule.name
    );
  });
});

strictVisualBoundaryRules.forEach(function(rule) {
  test('src/core/ai-config-rules.js states that ' + rule.name, function() {
    assert.ok(
      sectionSatisfiesRule(visualCapabilitySource(), rule),
      'CAPABILITY_ROUTING must state: ' + rule.name
    );
  });
});

visualProviderBoundaryRules.forEach(function(rule) {
  test('src/core/ai-config-rules.js states that ' + rule.name, function() {
    assert.ok(
      sectionSatisfiesRule(visualCapabilitySource(), rule),
      'CAPABILITY_ROUTING must state: ' + rule.name
    );
  });
});

const managedFiles = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', path.join('.github', 'copilot-instructions.md')];
let generatedManagedRoot;

function generatedManagedBlock(file) {
  if (!generatedManagedRoot) {
    generatedManagedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-visual-parity-'));
    genAiConfigs.run(generatedManagedRoot, 'standard');
  }
  const text = fs.readFileSync(path.join(generatedManagedRoot, file), 'utf-8');
  const managed = text.match(/<!-- sdd-riper:start -->([\s\S]*?)<!-- sdd-riper:end -->/);
  assert.ok(managed, file + ' must contain one generated managed block');
  return managed[1];
}

managedFiles.forEach(function(file) {
  fidelityRoutingRules.forEach(function(rule) {
    test(file + ' managed block states that ' + rule.name, function() {
      assert.ok(
        sectionSatisfiesRule(generatedManagedBlock(file), rule),
        file + ' managed block must state: ' + rule.name
      );
    });
  });
});

managedFiles.forEach(function(file) {
  strictVisualBoundaryRules.forEach(function(rule) {
    test(file + ' managed block states that ' + rule.name, function() {
      assert.ok(
        sectionSatisfiesRule(generatedManagedBlock(file), rule),
        file + ' managed block must state: ' + rule.name
      );
    });
  });
});

managedFiles.forEach(function(file) {
  visualProviderBoundaryRules.forEach(function(rule) {
    test(file + ' managed block states that ' + rule.name, function() {
      assert.ok(
        sectionSatisfiesRule(generatedManagedBlock(file), rule),
        file + ' managed block must state: ' + rule.name
      );
    });
  });
});
}

module.exports = {
  CURRENT_SCREENSHOT: CURRENT_SCREENSHOT,
  fidelityRoutingRules: fidelityRoutingRules,
  paragraphWithTerms: paragraphWithTerms,
  sectionSatisfiesRule: sectionSatisfiesRule
};
