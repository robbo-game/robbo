const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Source bytes are a compatibility contract, including on Windows checkouts.
// These hashes include the original level 26 layout restored in 77daa32.
const hashes = {
  'robbo01.dat': '17d1a9552e2f0b70f2f792e051a135ddc515b638d09ccc8a639ab9a5bdc3b556',
  'robbo02.dat': '827c2fc67293f3db89d42745e270daf92951c46f40844abebc2d00c775294ca4'
};
for (const [file, expected] of Object.entries(hashes)) {
  test(`${file} retains its canonical source bytes`, () => {
    const bytes = readFileSync(path.join(__dirname, '../../resources/levels', file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  });
}
