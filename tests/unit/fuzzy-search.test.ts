import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fuzzyScore, fuzzyScoreAcross } from '../../src/lib/fuzzy';

/**
 * The one matcher both search boxes use.
 *
 * These cases pin the behaviour a shopper sees: a typed start finds the word, letters in order find a
 * longer word, one wrong character is still a match, and an unrelated term matches nothing. They also
 * pin that a short term is not allowed to fuzz into noise, which is the failure mode that makes a
 * type-ahead feel random.
 */

describe('fuzzy search', () => {
  it('ranks an exact field above a prefix, and a prefix above a word inside the field', () => {
    const exact = fuzzyScore('serum', 'Serum');
    const prefix = fuzzyScore('ser', 'Serum 30ml');
    const word = fuzzyScore('serum', 'Lilac Serum 30ml');
    const inner = fuzzyScore('rum', 'Lilac Serum 30ml');

    assert.notEqual(exact, null);
    assert.notEqual(prefix, null);
    assert.notEqual(word, null);
    assert.notEqual(inner, null);
    assert.ok((exact as number) > (prefix as number));
    assert.ok((prefix as number) > (word as number));
    assert.ok((word as number) > (inner as number));
  });

  it('finds a single typed character at the start of a word, which is what search-as-you-type needs', () => {
    assert.notEqual(fuzzyScore('a', 'Aura Glow Serum'), null);
    assert.notEqual(fuzzyScore('l', 'Lilac Serum'), null);
    assert.equal(fuzzyScore('z', 'Lilac Serum'), null);
  });

  it('matches letters in order inside one word, and never across a whole product name', () => {
    assert.notEqual(fuzzyScore('srm', 'Serum'), null);
    assert.notEqual(fuzzyScore('srm', 'Lilac Serum 30ml'), null);
    assert.equal(
      fuzzyScore('lcsrm', 'Lilac Serum'),
      null,
      'the loose match is per word: spanning words would match unrelated words by accident',
    );
    assert.equal(fuzzyScore('mrs', 'Serum'), null, 'order matters, so a transposition is not a subsequence');
  });

  it('tolerates one wrong character in a long enough word', () => {
    assert.notEqual(fuzzyScore('serun', 'Serum'), null);
    assert.notEqual(fuzzyScore('seurm', 'Serum'), null);
    assert.notEqual(fuzzyScore('shampo', 'Shampoo'), null);
    assert.equal(fuzzyScore('sxrun', 'Serum'), null, 'two differences is a different word');
  });

  it('does not fuzz a short term into a false match', () => {
    // Two letters are only matched as a prefix or a substring; a subsequence at this length would
    // match most names in the catalog.
    assert.equal(fuzzyScore('sr', 'Serum'), null);
    assert.equal(fuzzyScore('sm', 'Lilac Serum'), null);
  });

  it('matches each word of a term against the field that holds it', () => {
    const fields = ['Lilac Serum', 'Lilac', '30 ml'];
    assert.notEqual(fuzzyScoreAcross('lilac 30ml', fields), null);
    assert.notEqual(fuzzyScoreAcross('serum 30', fields), null);
    assert.equal(fuzzyScoreAcross('lilac 60ml', fields), null);
  });

  it('treats an empty term as no filter and an empty haystack as no match', () => {
    assert.equal(fuzzyScore('', 'Serum'), 0);
    assert.equal(fuzzyScoreAcross('  ', ['Serum']), 0);
    assert.equal(fuzzyScore('serum', ''), null);
    assert.equal(fuzzyScoreAcross('serum', [null, undefined, '']), null);
  });

  it('folds case and normalises Bengali before comparing', () => {
    assert.notEqual(fuzzyScore('LILAC', 'lilac serum'), null);
    assert.notEqual(fuzzyScore('স্কিন', 'স্কিনকেয়ার'), null);
    assert.equal(fuzzyScore('হেয়ার', 'স্কিনকেয়ার'), null);
  });
});
