const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { targetForRun, installSite } = require('../../scripts/release/pages-preview.cjs');
const repo = 'owner/robbo', sha = 'a'.repeat(40);
const pull = { state: 'open', number: 16, title: 'Gesture <test>', head: { sha, ref: 'gestures', repo: { full_name: repo } } };
const build = { conclusion: 'success', event: 'pull_request', head_branch: 'gestures', head_sha: sha, head_repository: { full_name: repo } };
test('Pages publishes current main and matching same-repo PRs, rejecting forks and stale runs', () => {
  assert.equal(targetForRun(build, repo, sha, [pull]).directory, 'previews/pr-16');
  assert.equal(targetForRun({ ...build, event: 'push', head_branch: 'main' }, repo, sha, []).directory, '.');
  assert.equal(targetForRun({ ...build, conclusion: 'failure' }, repo, sha, [pull]), null);
  assert.equal(targetForRun({ ...build, head_sha: 'old' }, repo, sha, [pull]), null);
  assert.equal(targetForRun({ ...build, head_repository: { full_name: 'fork/robbo' } }, repo, sha, [pull]), null);
  assert.equal(targetForRun({ ...build, event: 'push', head_branch: 'main' }, repo, 'new', []), null);
  assert.equal(targetForRun(build, repo, sha, [{ ...pull, state: 'closed' }]), null);
});
test('updating a PR preserves main and other PRs; updating main preserves previews', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'robbo-pages-'));
  try {
    const release = path.join(temp, 'release'), tree = path.join(temp, 'tree');
    fs.mkdirSync(release); fs.mkdirSync(tree);
    const html = text => `<html><div id="play-area">${text}</div></html>`;
    fs.writeFileSync(path.join(release, 'index.html'), html('main'));
    fs.writeFileSync(path.join(release, 'obsolete.txt'), 'old');
    installSite(tree, release, { directory: '.', name: 'main', sha });
    fs.writeFileSync(path.join(release, 'index.html'), html('variant 16'));
    installSite(tree, release, { directory: 'previews/pr-16', name: '<gestures>', pr: 16, sha });
    installSite(tree, release, { directory: 'previews/pr-17', name: 'D-pad', pr: 17, sha });
    assert.match(fs.readFileSync(path.join(tree, 'index.html'), 'utf8'), />main</);
    assert.match(fs.readFileSync(path.join(tree, 'previews/pr-16/index.html'), 'utf8'), /&lt;gestures&gt;/);
    assert.match(fs.readFileSync(path.join(tree, 'previews/index.html'), 'utf8'), /pr-17/);
    fs.rmSync(path.join(release, 'obsolete.txt'));
    fs.writeFileSync(path.join(release, 'index.html'), html('new main'));
    installSite(tree, release, { directory: '.', name: 'main', sha: 'new' });
    assert.equal(fs.existsSync(path.join(tree, 'obsolete.txt')), false);
    assert.match(fs.readFileSync(path.join(tree, 'previews/pr-16/index.html'), 'utf8'), /variant 16/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('artifact extraction rejects traversal and symlinks', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'robbo-archive-'));
  try {
    for (const name of ['../escaped', '/tmp/escaped', 'robbo/../../escaped', 'robbo/.git/config']) {
      execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr(sys.argv[2],"bad"); z.close()', path.join(temp, 'bad.zip'), name]);
      assert.throws(() => execFileSync('python3', ['scripts/release/extract-pages.py', path.join(temp, 'bad.zip'), path.join(temp, 'out')], { stdio: 'pipe' }));
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
