/**
 * BigNum Tests
 * Tests for large number wrapper
 */

import { TestRunner, assert } from './TestRunner.js';
import { BigNum } from '../BigNum.js';

const runner = new TestRunner();

runner.describe('BigNum - Creation', () => {
  runner.it('should create from number', () => {
    const num = BigNum.from(100);
    assert.notNull(num);
    assert.equal(num.toNumber(), 100);
  });

  runner.it('should create from string', () => {
    const num = BigNum.from('1000');
    assert.equal(num.toNumber(), 1000);
  });

  runner.it('should create from scientific notation string', () => {
    const num = BigNum.from('1e10');
    assert.equal(num.toNumber(), 1e10);
  });

  runner.it('should create from another BigNum', () => {
    const a = BigNum.from(500);
    const b = BigNum.from(a);
    assert.equal(b.toNumber(), 500);
  });

  runner.it('should handle zero', () => {
    const num = BigNum.from(0);
    assert.equal(num.toNumber(), 0);
  });

  runner.it('should handle negative numbers', () => {
    const num = BigNum.from(-100);
    assert.equal(num.toNumber(), -100);
  });
});

runner.describe('BigNum - Arithmetic', () => {
  runner.it('should add two numbers', () => {
    const a = BigNum.from(100);
    const b = BigNum.from(50);
    const result = a.add(b);
    assert.equal(result.toNumber(), 150);
  });

  runner.it('should add number directly', () => {
    const a = BigNum.from(100);
    const result = a.add(25);
    assert.equal(result.toNumber(), 125);
  });

  runner.it('should subtract two numbers', () => {
    const a = BigNum.from(100);
    const b = BigNum.from(30);
    const result = a.sub(b);
    assert.equal(result.toNumber(), 70);
  });

  runner.it('should multiply two numbers', () => {
    const a = BigNum.from(12);
    const b = BigNum.from(10);
    const result = a.mul(b);
    assert.equal(result.toNumber(), 120);
  });

  runner.it('should divide two numbers', () => {
    const a = BigNum.from(100);
    const b = BigNum.from(4);
    const result = a.div(b);
    assert.equal(result.toNumber(), 25);
  });

  runner.it('should chain operations', () => {
    const result = BigNum.from(10).add(5).mul(2).sub(10);
    assert.equal(result.toNumber(), 20); // (10+5)*2-10 = 20
  });

  runner.it('should handle large number multiplication', () => {
    const a = BigNum.from(1e10);
    const b = BigNum.from(1e10);
    const result = a.mul(b);
    // 1e20 - should preserve precision
    assert.approximately(result.toNumber(), 1e20, 1e10);
  });
});

runner.describe('BigNum - Comparisons', () => {
  runner.it('should compare less than', () => {
    const a = BigNum.from(10);
    const b = BigNum.from(20);
    assert.true(a.lt(b));
    assert.false(b.lt(a));
    assert.false(a.lt(a));
  });

  runner.it('should compare less than or equal', () => {
    const a = BigNum.from(10);
    const b = BigNum.from(20);
    const c = BigNum.from(10);
    assert.true(a.lte(b));
    assert.true(a.lte(c));
    assert.false(b.lte(a));
  });

  runner.it('should compare greater than', () => {
    const a = BigNum.from(30);
    const b = BigNum.from(20);
    assert.true(a.gt(b));
    assert.false(b.gt(a));
    assert.false(a.gt(a));
  });

  runner.it('should compare greater than or equal', () => {
    const a = BigNum.from(30);
    const b = BigNum.from(20);
    const c = BigNum.from(30);
    assert.true(a.gte(b));
    assert.true(a.gte(c));
    assert.false(b.gte(a));
  });

  runner.it('should compare equal', () => {
    const a = BigNum.from(100);
    const b = BigNum.from(100);
    const c = BigNum.from(50);
    assert.true(a.eq(b));
    assert.false(a.eq(c));
  });

  runner.it('should compare with raw numbers', () => {
    const a = BigNum.from(50);
    assert.true(a.lt(100));
    assert.true(a.gt(25));
    assert.true(a.eq(50));
  });
});

runner.describe('BigNum - Math Operations', () => {
  runner.it('should floor values', () => {
    const a = BigNum.from(10.7);
    assert.equal(a.floor().toNumber(), 10);
  });

  runner.it('should ceil values', () => {
    const a = BigNum.from(10.2);
    assert.equal(a.ceil().toNumber(), 11);
  });

  runner.it('should calculate log10', () => {
    const a = BigNum.from(1000);
    assert.approximately(a.log10().toNumber(), 3, 0.001);
  });

  runner.it('should calculate pow', () => {
    const a = BigNum.from(2);
    assert.equal(a.pow(10).toNumber(), 1024);
  });

  runner.it('should handle pow with 0', () => {
    const a = BigNum.from(5);
    assert.equal(a.pow(0).toNumber(), 1);
  });
});

runner.describe('BigNum - Formatting', () => {
  runner.it('should format small numbers normally', () => {
    const a = BigNum.from(123);
    assert.equal(a.format(), '123');
  });

  runner.it('should format numbers with K suffix', () => {
    const a = BigNum.from(1500);
    assert.equal(a.format(), '1.50K');
  });

  runner.it('should format numbers with M suffix', () => {
    const a = BigNum.from(2300000);
    assert.equal(a.format(), '2.30M');
  });

  runner.it('should format numbers with B suffix', () => {
    const a = BigNum.from(1e9);
    assert.equal(a.format(), '1.00B');
  });

  runner.it('should format numbers with T suffix', () => {
    const a = BigNum.from(1e12);
    assert.equal(a.format(), '1.00T');
  });

  runner.it('should use scientific notation for very large numbers', () => {
    const a = BigNum.from(1e100);
    // Should be something like "1.00e100"
    const formatted = a.format();
    assert.true(formatted.includes('e'), `Expected scientific notation, got ${formatted}`);
  });

  runner.it('should format negative numbers', () => {
    const a = BigNum.from(-1500);
    assert.equal(a.format(), '-1.50K');
  });

  runner.it('should format zero', () => {
    const a = BigNum.from(0);
    assert.equal(a.format(), '0');
  });

  runner.it('should format decimal numbers', () => {
    const a = BigNum.from(123.456);
    assert.equal(a.format(), '123.46');
  });
});

// Run tests and export
export { runner };
