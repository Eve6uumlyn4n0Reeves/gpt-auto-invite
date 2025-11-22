#!/usr/bin/env node
/*
  Domain import guard for front-end。
  - 针对 store/domains 目录执行简单的“黑名单字符串”检查；
  - 若命中跨域用法则退出 1。
*/
const fs = require('fs');
const path = require('path');

function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p));
    else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function contains(text, pattern) {
  return new RegExp(pattern).test(text);
}

const root = path.resolve(__dirname, '..');
const violations = [];

const DOMAIN_RULES = [
  {
    dir: ['store', 'pool'],
    id: 'pool-store-no-usersAdminRequest',
    patterns: ['\\busersAdminRequest\\b'],
  },
  {
    dir: ['store', 'users'],
    id: 'users-store-no-poolAdminRequest',
    patterns: ['\\bpoolAdminRequest\\b'],
  },
  {
    dir: ['domains', 'pool'],
    id: 'pool-domain-no-users-artifacts',
    patterns: ['\\busersAdminRequest\\b', '@/domains/users', '@/lib/api/users', '@/lib/api/codes'],
  },
  {
    dir: ['domains', 'users'],
    id: 'users-domain-no-pool-artifacts',
    patterns: ['\\bpoolAdminRequest\\b', '@/domains/pool', '@/lib/api/mothers', '@/lib/api/pool'],
  },
];

for (const rule of DOMAIN_RULES) {
  const dirPath = path.join(root, ...rule.dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const file of collectFiles(dirPath)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const pattern of rule.patterns) {
      if (contains(code, pattern)) {
        violations.push({ file, rule: rule.id, pattern });
        break;
      }
    }
  }
}

if (violations.length) {
  console.error('Domain import violations found:');
  for (const v of violations) {
    console.error(` - [${v.rule}] ${path.relative(path.join(__dirname, '..'), v.file)} (pattern: ${v.pattern})`);
  }
  process.exit(1);
}
console.log('Domain import check passed.');
