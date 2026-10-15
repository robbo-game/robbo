const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
const gh = args => JSON.parse(run('gh', ['api', ...args]));
function targetForRun(build, repository, mainSha, pulls) {
  if (build.conclusion !== 'success' || build.head_repository?.full_name !== repository) return null;
  if (build.event === 'push' && build.head_branch === 'main' && build.head_sha === mainSha) return { directory: '.', name: 'main', sha: build.head_sha };
  if (!['pull_request', 'workflow_dispatch'].includes(build.event)) return null;
  const pr = pulls.find(pr => pr.state === 'open' && pr.head.repo?.full_name === repository && pr.head.sha === build.head_sha && pr.head.ref === build.head_branch);
  return pr ? { directory: `previews/pr-${pr.number}`, name: pr.title, pr: pr.number, sha: build.head_sha } : null;
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function installSite(tree, release, target) {
  const destination = path.join(tree, target.directory);
  if (target.directory === '.') {
    for (const name of fs.readdirSync(tree)) if (!['.git', 'previews'].includes(name)) fs.rmSync(path.join(tree, name), { force: true, recursive: true });
  } else fs.rmSync(destination, { force: true, recursive: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(release)) {
    if (['.git', 'previews'].includes(name)) throw Error('Reserved path in Pages release');
    fs.cpSync(path.join(release, name), path.join(destination, name), { recursive: true });
  }
  fs.writeFileSync(path.join(destination, 'version.json'), JSON.stringify(target, null, 2));
  fs.writeFileSync(path.join(tree, '.nojekyll'), '');
  if (target.pr) {
    const html = path.join(destination, 'index.html');
    const nav = `<nav aria-label="Preview navigation" style="display:flex;align-items:center;gap:12px;padding:6px 10px;background:#16241b;color:#dfffac;font:12px system-ui;flex:none"><strong style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1" title="${escape(target.name)}">PR #${target.pr} · ${escape(target.name)}</strong><a style="color:inherit" href="../../">main</a><a style="color:inherit" href="../">Warianty</a></nav>`;
    fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<div id="play-area">', `<div id="play-area">${nav}`));
  }
  const previews = path.join(tree, 'previews'); fs.mkdirSync(previews, { recursive: true });
  const entries = fs.readdirSync(previews).filter(name => /^pr-\d+$/.test(name)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3))).map(name => {
    const info = JSON.parse(fs.readFileSync(path.join(previews, name, 'version.json'), 'utf8'));
    return `<li><a href="${name}/">PR #${info.pr} — ${escape(info.name)}</a><small>${escape(info.sha.slice(0, 12))}</small></li>`;
  });
  fs.writeFileSync(path.join(previews, 'index.html'), `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Warianty Robbo</title><style>body{font:18px/1.6 system-ui;background:#111b13;color:#e6efdd;max-width:800px;margin:40px auto;padding:20px}a{color:#d3ff70}li{margin:22px 0}small{display:block;color:#9cae92;font-size:12px}</style><h1>Warianty Robbo</h1><p>Wybierz wersję do testowania. Każdy podgląd ma oddzielny zapis gry.</p><ul><li><a href="../">main — wersja główna</a></li>${entries.join('')}</ul></html>`);
}
function stage() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = process.env.GITHUB_REPOSITORY;
  const build = event.workflow_run;
  const mainSha = gh([`repos/${repository}/git/ref/heads/main`]).object.sha;
  const pulls = gh([`repos/${repository}/pulls?state=open&per_page=100`]);
  const target = targetForRun(build, repository, mainSha, pulls);
  if (!target) { fs.appendFileSync(process.env.GITHUB_OUTPUT, 'publish=false\n'); return; }
  const incoming = path.join(process.env.RUNNER_TEMP, 'robbo-pages-incoming'); fs.mkdirSync(incoming, { recursive: true });
  run('gh', ['run', 'download', String(build.id), '--repo', repository, '--name', 'robbo', '--dir', incoming]);
  const release = path.join(incoming, 'extracted');
  run('python3', [path.join(__dirname, 'extract-pages.py'), path.join(incoming, 'robbo.zip'), release]);
  const tree = path.join(process.env.RUNNER_TEMP, 'robbo-pages-tree');
  // Optimistic pushes preserve other PR slots even when builds finish together.
  for (let attempt = 0; attempt < 6; attempt++) {
    let exists = true;
    try { run('git', ['fetch', 'origin', 'pages-site']); } catch { exists = false; }
    if (!fs.existsSync(tree)) run('git', ['worktree', 'add', '--detach', tree, exists ? 'FETCH_HEAD' : 'HEAD']);
    if (exists) run('git', ['-C', tree, 'reset', '--hard', 'FETCH_HEAD']);
    else {
      run('git', ['-C', tree, 'checkout', '--orphan', `pages-bootstrap-${Date.now()}`]);
      for (const name of fs.readdirSync(tree)) if (name !== '.git') fs.rmSync(path.join(tree, name), { recursive: true, force: true });
    }
    const current = targetForRun(build, repository, gh([`repos/${repository}/git/ref/heads/main`]).object.sha, gh([`repos/${repository}/pulls?state=open&per_page=100`]));
    if (!current) { fs.appendFileSync(process.env.GITHUB_OUTPUT, 'publish=false\n'); return; }
    installSite(tree, path.join(release, 'robbo'), current);
    run('git', ['-C', tree, 'add', '-A']);
    run('git', ['-C', tree, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '--allow-empty', '-m', `Publish ${target.directory} at ${target.sha}`]);
    try {
      run('git', ['-C', tree, 'push', 'origin', 'HEAD:refs/heads/pages-site']);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, 'publish=true\n');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published slot: ${target.directory}\n\nCommit: ${target.sha}\n`);
      return;
    } catch (error) { if (attempt === 5) throw error; }
  }
}
module.exports = { targetForRun, installSite };
if (require.main === module) stage();
