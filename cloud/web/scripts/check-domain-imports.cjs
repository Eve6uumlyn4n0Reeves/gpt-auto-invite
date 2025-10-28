#!/usr/bin/env node
/*
  Domain import guard for front-end.
  - Forbid using `usersAdminRequest` in `store/pool/**`.
  - Forbid using `poolAdminRequest` in `store/users/**`.
  Exit with code 1 if violations found.
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

// Pool store must not import users client
const poolDir = path.join(root, 'store', 'pool');
if (fs.existsSync(poolDir)) {
  for (const file of collectFiles(poolDir)) {
    const code = fs.readFileSync(file, 'utf8');
    if (contains(code, '\\busersAdminRequest\\b')) {
      violations.push({ file, rule: 'pool-store-no-usersAdminRequest' });
    }
  }
}

// Users store must not import pool client
const usersDir = path.join(root, 'store', 'users');
if (fs.existsSync(usersDir)) {
  for (const file of collectFiles(usersDir)) {
    const code = fs.readFileSync(file, 'utf8');
    if (contains(code, '\\bpoolAdminRequest\\b')) {
      violations.push({ file, rule: 'users-store-no-poolAdminRequest' });
    }
  }
}

if (violations.length) {
  console.error('Domain import violations found:');
  for (const v of violations) {
    console.error(` - [${v.rule}] ${path.relative(path.join(__dirname, '..'), v.file)}`);
  }
  process.exit(1);
}
console.log('Domain import check passed.');
