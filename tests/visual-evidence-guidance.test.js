const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const sharedVisualRules = require('./ai-config-parity.test');

const fidelityRoutingRules = sharedVisualRules.fidelityRoutingRules;
const paragraphWithTerms = sharedVisualRules.paragraphWithTerms;
const sectionSatisfiesRule = sharedVisualRules.sectionSatisfiesRule;

test('视觉能力路由存在于权威来源，而非用户入口文档', function() {
  const root = path.resolve(__dirname, '..');
  const files = [
    'SKILL.md',
    'src/core/ai-config-rules.js',
    'INTEGRATIONS.md'
  ];

  files.forEach(function(file) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.match(content, /affected-units|ui-impact/i, file + ' 应说明前端影响面判定');
    assert.match(content, /visual-context-intent|visual select/i, file + ' 应说明一次性视觉意图选择');
    assert.match(content, /visual discover/i, file + ' 应说明本地 Context 发现入口');
    assert.match(content, /Figma.*URL|URL.*Figma/i, file + ' 应将 Figma URL 视为统一来源');
    assert.match(content, /不联网|no network|不发起网络|does not access the network/i, file + ' 不应承诺自动读取远程内容');
    assert.match(content, /不自动批准|never fabricate.*approval|do not fabricate.*approval|does not.*approve/i, file + ' 应明确禁止自动批准视觉证据');
    assert.match(content, /不启动浏览器|不运行浏览器|不执行截图 diff|never fabricate.*browser.*screenshot diff|do not fabricate.*browser.*screenshot diff/i, file + ' 应明确不运行浏览器或截图 diff');
  });
});

test('README、GUIDE、SKILL 与 REFERENCE 保留视觉材料的只读安全边界', function() {
  const root = path.resolve(__dirname, '..');
  ['README.md', 'GUIDE.md', 'SKILL.md', 'REFERENCE.md'].forEach(function(file) {
    const content = fs.readFileSync(path.join(root, file), 'utf-8');
    assert.match(content, /不联网|no network|does not access the network/i, file + ' 应明确不联网读取视觉材料');
    assert.match(content, /不自动批准|never fabricate.*approval|do not fabricate.*approval|does not.*approve/i, file + ' 应明确不自动批准视觉证据');
    assert.match(content, /不启动浏览器|不运行浏览器|不执行截图 diff|never fabricate.*browser.*screenshot diff|do not fabricate.*browser.*screenshot diff/i, file + ' 应明确不启动浏览器或执行截图 diff');
  });
});

const PROJECT_ROOT = path.resolve(__dirname, '..');

function readProjectFile(file) {
  return fs.readFileSync(path.join(PROJECT_ROOT, file), 'utf-8');
}

function boundedSection(file, startPattern, endPattern) {
  const content = readProjectFile(file);
  const start = content.search(startPattern);
  assert.ok(start >= 0, file + ' must retain the expected visual-guidance section start');
  const remainder = content.slice(start);
  const relativeEnd = remainder.search(endPattern);
  assert.ok(relativeEnd > 0, file + ' must retain the expected visual-guidance section end');
  return remainder.slice(0, relativeEnd);
}

const humanVisualSections = {
  'README.md': function() {
    return boundedSection('README.md', /^### AI 会自动判断何时使用配套能力\s*$/m, /^## 它会留下什么\s*$/m);
  },
  'GUIDE.md': function() {
    const intake = boundedSection('GUIDE.md', /^## 场景一：开始一个新任务\s*$/m, /^## 场景二：/m);
    const execution = boundedSection('GUIDE.md', /^## 场景三：执行和验证\s*$/m, /^## 场景四：/m);
    return intake + '\n\n' + execution;
  },
  'REFERENCE.md': function() {
    return boundedSection('REFERENCE.md', /^### Visual Context Guidance（按需）\s*$/m, /^### Innovate\s*$/m);
  },
  'TEAM-GUIDE.md': function() {
    const hardStops = boundedSection('TEAM-GUIDE.md', /^## 4\. 不可委托的人工硬停\s*$/m, /^## 5\./m);
    const checklist = boundedSection('TEAM-GUIDE.md', /^## 7\. 渐进采用检查表\s*$/m, /\s*$/);
    return hardStops + '\n\n' + checklist;
  }
};

const baselineRejectPatterns = [
  /baseline\s*(?:是|作为|is|acts as|serves as)\s*(?!not\b|不是|并非)(?:a\s+)?(?:跨\s*Spec|cross[- ]?Spec)[^.;。\n]*(?:历史基线库|historical baseline librar)/i,
  /(?:Agent|Agents|AI|系统|system)[^.;。\n]{0,80}(?:will|can|may|会|可以|可)[^.;。\n]{0,40}(?:自动|automatically)[^.;。\n]{0,80}(?:创建|生成|批准|替换|版本化|管理|create|generate|approve|replace|version|manage)[^.;。\n]{0,60}(?:baseline|基线)/i,
  /(?:baseline|基线)[^.;。\n]{0,60}(?:will|can|may|会|可以|可)[^.;。\n]{0,40}(?:自动|automatically)[^.;。\n]{0,80}(?:创建|生成|批准|替换|版本化|管理|created|generated|approved|replaced|versioned|managed)/i
];

const baselineFixtureRules = {
  target: {
    terms: [/(?:baseline|基线)/i, /(?:当前|本次|current)[^\n]{0,40}Spec/i, /(?:冻结|freez(?:e[sd]?|ing)|frozen)/i, /(?:人工认可|人工确认|human[- ](?:approved|recognized))/i, /(?:目标|target)/i, /(?:UI|界面)/i, /PNG/i],
    rejectPatterns: baselineRejectPatterns
  },
  history: {
    terms: [/(?:baseline|基线)/i, /(?:不是|并非|not)/i, /(?:跨\s*Spec|cross[- ]?Spec)/i, /(?:历史基线库|historical baseline librar)/i],
    rejectPatterns: baselineRejectPatterns
  }
};

const humanResponsibilityMatrix = {
  'README.md': [
    {
      name: 'defines the current-Spec baseline as a frozen user-recognized target UI PNG',
      terms: [/(?:baseline|基线)/i, /(?:当前|本次|current)[^\n]{0,40}Spec/i, /(?:冻结|frozen)/i, /(?:当前用户认可|人工认可|human[- ](?:approved|recognized))/i, /(?:目标|target)/i, /(?:UI|界面)/i, /PNG/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'says a new Spec can directly use the latest UI PNG',
      terms: [/(?:新|new)[^\n]{0,20}Spec/i, /(?:最新|latest|newest)/i, /(?:UI|界面)/i, /PNG/i, /(?:直接采用|直接使用|can directly use|may directly use)/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'treats old screenshots as optional Context, not a cross-Spec historical library',
      terms: [/(?:旧页面|旧版页面|old[- ]page|previous page)/i, /(?:截图|screenshot)/i, /Context/i, /(?:可选|optional)/i, /(?:不是|并非|not)/i, /(?:跨\s*Spec|cross[- ]?Spec)/i, /(?:历史基线库|historical baseline librar)/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'links to the exact Visual Context Guidance reference',
      terms: [/\[REFERENCE：Visual Context Guidance\]\(\.\/REFERENCE\.md#visual-context-guidance按需\)/i]
    }
  ],
  'GUIDE.md': [
    {
      name: 'starts the UI flow from the latest target image confirmed by the current user',
      terms: [/(?:最新|latest|newest)/i, /(?:UI|界面)/i, /PNG/i, /(?:当前用户认可|人工认可|human[- ](?:approved|recognized))/i, /(?:当前|本次|current)[^\n]{0,40}Spec/i, /(?:目标图|目标图片|target image)/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'has AI explain why it recommends direction or fidelity',
      terms: [/(?:AI|Agent)/i, /(?:说明|解释|理由|reason|why)/i, /(?:推荐|recommend)/i, /direction/i, /fidelity/i]
    },
    {
      name: 'verifies a post-development current screenshot at exactly matching pixel width and height',
      terms: [/(?:开发完成后|after development)/i, /current screenshot|当前截图|实际截图|页面截图/i, /(?:像素宽度|pixel width)/i, /(?:高度|height)/i, /(?:分别|respectively)/i, /(?:完全一致|exactly (?:equal|identical|match))/i]
    },
    {
      name: 'does not require an old-page screenshot before strict visual verification',
      terms: [/(?:旧页面|旧版页面|old[- ]page|previous page)/i, /(?:截图|screenshot)/i, /Context/i, /(?:可选|optional)/i, /(?:不必|无需|不是必需|not required|need not)/i]
    }
  ],
  'REFERENCE.md': [
    {
      name: 'defines scenario.baseline.path and scenario.baseline.status',
      terms: [/scenario\.baseline\.path/i, /scenario\.baseline\.status/i, /pending/i, /approved/i]
    },
    {
      name: 'defines baseline as current-Spec state rather than cross-Spec management',
      terms: [/(?:baseline|基线)/i, /(?:当前|本次|current)[^\n]{0,40}Spec/i, /(?:不是|并非|not)/i, /(?:跨\s*Spec|cross[- ]?Spec)/i, /(?:历史基线库|historical baseline librar)/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'requires a decodable PNG for fidelity',
      terms: [/fidelity/i, /PNG/i, /(?:可解码|decodable)/i],
      rejectPatterns: fidelityRoutingRules[0].rejectPatterns
    },
    {
      name: 'requires explicit scenario, route, state, and viewport',
      terms: [/(?:scenario|场景)/i, /(?:route|路由)/i, /(?:state|状态)/i, /(?:viewport|视口)/i, /(?:明确|显式|explicit)/i],
      rejectPatterns: fidelityRoutingRules[1].rejectPatterns
    },
    {
      name: 'requires target and current pixel width and height to match exactly',
      terms: [/(?:baseline|目标)/i, /PNG/i, /current screenshot|当前截图|实际截图/i, /(?:像素宽度|pixel width)/i, /(?:高度|height)/i, /(?:分别|respectively)/i, /(?:完全一致|exactly (?:equal|identical|match))/i]
    },
    {
      name: 'requires stable test data, fonts, and assets',
      terms: [/(?:测试数据|test data)/i, /(?:字体|fonts?)/i, /(?:资源|assets?)/i, /(?:稳定|stable)/i],
      rejectPatterns: fidelityRoutingRules[3].rejectPatterns
    },
    {
      name: 'keeps candidates and defaults unapproved and forbids an automatic baseline lifecycle',
      terms: [/(?:候选|candidate)/i, /(?:默认(?:图片|图像|图)|default image)/i, /(?:人工认可|人工批准|human approval|human-approved)/i, /(?:不等同|不代表|不能视为|does not (?:equal|mean|constitute))/i, /(?:不提供|不得|never|must not)/i, /(?:自动|automatic)/i, /(?:创建|生成|批准|替换|版本化|管理|create|generate|approve|replace|version|manage)/i],
      rejectPatterns: baselineRejectPatterns
    },
    {
      name: 'documents both path containment and stale-result handling',
      allOf: [
        { terms: [/scenario\.baseline\.path/i, /(?:lexical|词法)/i, /realpath/i, /containment/i, /(?:project-local|项目内|项目本地)/i] },
        { terms: [/(?:Provider|配置|合同|baseline|代码状态)/i, /stale/i] }
      ]
    }
  ],
  'TEAM-GUIDE.md': [
    {
      name: 'requires the current user to confirm the latest target UI PNG',
      terms: [/(?:当前用户|current user)/i, /(?:确认|认可|confirm|recognize)/i, /(?:最新|latest|newest)/i, /(?:目标|target)/i, /(?:UI|界面)/i, /PNG/i]
    },
    {
      name: 'assigns stable environment and static project-local mapping to the team or Provider maintainer',
      terms: [/(?:团队|team)/i, /Provider/i, /(?:维护者|maintainer)/i, /(?:静态|static)/i, /(?:项目内|项目本地|project-local)/i, /(?:映射|mapping)/i, /(?:测试数据|test data)/i, /(?:字体|fonts?)/i, /(?:资源|assets?)/i, /(?:环境|environment)/i, /(?:稳定|stable)/i]
    },
    {
      name: 'forbids a worker from reusing stale evidence and requires a fresh record',
      terms: [/worker/i, /stale/i, /(?:没有复用|不得复用|must not reuse|does not reuse)/i, /Execute Log/i, /(?:记录原因|record(?:s|ed)? the reason)/i, /(?:重新获取证据|fresh evidence|reacquire evidence)/i]
    },
    {
      name: 'forbids the automatic baseline lifecycle',
      terms: [/(?:Agent|AI)/i, /(?:不得|never|must not)/i, /(?:创建|生成|替换|批准|版本化|管理|create|generate|replace|approve|version|manage)/i, /(?:baseline|基线)/i],
      rejectPatterns: baselineRejectPatterns
    }
  ]
};

function responsibilityIsSatisfied(section, responsibility) {
  const rules = responsibility.allOf || [responsibility];
  return rules.every(function(rule) { return sectionSatisfiesRule(section, rule); });
}

const expectedHumanResponsibilityCounts = {
  'README.md': 4,
  'GUIDE.md': 4,
  'REFERENCE.md': 8,
  'TEAM-GUIDE.md': 4
};

Object.keys(humanResponsibilityMatrix).forEach(function(file) {
  humanResponsibilityMatrix[file].forEach(function(responsibility) {
    test(file + ' visual section ' + responsibility.name, function() {
      assert.equal(
        humanResponsibilityMatrix[file].length,
        expectedHumanResponsibilityCounts[file],
        file + ' must retain its complete, non-duplicated responsibility set'
      );
      assert.ok(
        responsibilityIsSatisfied(humanVisualSections[file](), responsibility),
        file + ' visual section must satisfy its responsibility: ' + responsibility.name
      );
    });
  });
});

const agentVisualSections = {
  'SKILL.md': function() {
    return boundedSection('SKILL.md', /^### Visual Context Guidance\s*$/m, /^## Innovate Phase\s*$/m);
  },
  'protocols/sdd-riper-one.md': function() {
    return boundedSection('protocols/sdd-riper-one.md', /^## 阶段\s*$/m, /^## 子代理策略\s*$/m);
  },
  'protocols/sdd-riper-one-light.md': function() {
    return boundedSection('protocols/sdd-riper-one-light.md', /^## Micro 模式\s*$/m, /^## Challenge 与 Completion Verification\s*$/m);
  }
};

test('baseline rule helper accepts reverse word order and rejects historical-library or automatic-management claims', function() {
  const targetRule = baselineFixtureRules.target;
  const historyRule = baselineFixtureRules.history;
  assert.equal(
    sectionSatisfiesRule('PNG 形式的 UI 目标由人工认可，并冻结为当前 Spec 的 baseline。', targetRule),
    true,
    '目标图词序不应影响正向识别'
  );
  assert.equal(
    sectionSatisfiesRule('The baseline is not a cross-Spec historical baseline library.', historyRule),
    true,
    '明确否认跨 Spec 历史库必须作为正确合同通过'
  );
  assert.equal(
    sectionSatisfiesRule('The current Spec freezes a human-recognized target UI PNG as its baseline. Agents must not automatically approve baseline.', targetRule),
    true,
    '同节禁止 Agent 自动批准 baseline 不得被误判为自动批准承诺'
  );
  assert.equal(
    paragraphWithTerms('Context 中的 PNG 可以作为 UI 目标。', [/PNG/i, /(?:UI|界面)/i, /Context/i]),
    true,
    'PNG、UI 与 Context 不应依赖单一词序'
  );
  assert.equal(
    sectionSatisfiesRule('PNG 形式的 UI 目标由人工认可，并冻结为当前 Spec 的 baseline。\n\nbaseline 是跨Spec历史基线库。', targetRule),
    false,
    '跨 Spec 历史库反义声明必须使局部章节失败'
  );
  assert.equal(
    sectionSatisfiesRule('PNG 形式的 UI 目标由人工认可，并冻结为当前 Spec 的 baseline。\n\n系统会自动创建、批准、版本化并管理 baseline。', targetRule),
    false,
    '自动 baseline 生命周期声明必须使局部章节失败'
  );
});

Object.keys(agentVisualSections).forEach(function(file) {
  fidelityRoutingRules.forEach(function(rule) {
    test(file + ' visual section states that ' + rule.name, function() {
      const section = agentVisualSections[file]();
      assert.ok(
        sectionSatisfiesRule(section, rule),
        file + ' visual section must state: ' + rule.name
      );
    });
  });
});
