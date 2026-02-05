/**
 * BigNum - Large number wrapper for idle/incremental games
 *
 * Handles very large numbers with proper formatting and precision.
 * Inspired by break_infinity.js but simplified for game PoCs.
 *
 * @example
 * const gold = BigNum.from(1000);
 * const reward = BigNum.from(500);
 * const total = gold.add(reward);
 * console.log(total.format()); // "1.50K"
 */
class BigNum {
  /**
   * Internal constructor - use BigNum.from() instead
   * @param {number} mantissa - Significand (1 <= |mantissa| < 10 or 0)
   * @param {number} exponent - Power of 10
   */
  constructor(mantissa, exponent) {
    this.mantissa = mantissa;
    this.exponent = exponent;
    this._normalize();
  }

  /**
   * Create a BigNum from various input types
   * @param {number|string|BigNum} value
   * @returns {BigNum}
   */
  static from(value) {
    if (value instanceof BigNum) {
      return new BigNum(value.mantissa, value.exponent);
    }

    if (typeof value === 'string') {
      value = parseFloat(value);
    }

    if (!Number.isFinite(value) || value === 0) {
      return new BigNum(0, 0);
    }

    const sign = value < 0 ? -1 : 1;
    const absValue = Math.abs(value);

    if (absValue < 1e-308) {
      return new BigNum(0, 0);
    }

    const exponent = Math.floor(Math.log10(absValue));
    const mantissa = sign * (absValue / Math.pow(10, exponent));

    return new BigNum(mantissa, exponent);
  }

  /**
   * Normalize the number so mantissa is in [1, 10) or 0
   * @private
   */
  _normalize() {
    if (this.mantissa === 0) {
      this.exponent = 0;
      return;
    }

    const sign = this.mantissa < 0 ? -1 : 1;
    let absMantissa = Math.abs(this.mantissa);

    while (absMantissa >= 10) {
      absMantissa /= 10;
      this.exponent++;
    }

    while (absMantissa < 1 && absMantissa > 0) {
      absMantissa *= 10;
      this.exponent--;
    }

    this.mantissa = sign * absMantissa;
  }

  /**
   * Convert to another BigNum (for operations)
   * @private
   */
  _toBigNum(other) {
    return other instanceof BigNum ? other : BigNum.from(other);
  }

  /**
   * Add another number
   * @param {number|string|BigNum} other
   * @returns {BigNum} New BigNum with result
   */
  add(other) {
    const b = this._toBigNum(other);

    if (this.mantissa === 0) return BigNum.from(b);
    if (b.mantissa === 0) return BigNum.from(this);

    // Align exponents
    const expDiff = this.exponent - b.exponent;

    if (Math.abs(expDiff) > 17) {
      // Numbers too different in magnitude, return the larger one
      return expDiff > 0 ? BigNum.from(this) : BigNum.from(b);
    }

    const alignedMantissa = b.mantissa * Math.pow(10, -expDiff);
    const newMantissa = this.mantissa + alignedMantissa;

    return new BigNum(newMantissa, this.exponent);
  }

  /**
   * Subtract another number
   * @param {number|string|BigNum} other
   * @returns {BigNum} New BigNum with result
   */
  sub(other) {
    const b = this._toBigNum(other);
    return this.add(new BigNum(-b.mantissa, b.exponent));
  }

  /**
   * Multiply by another number
   * @param {number|string|BigNum} other
   * @returns {BigNum} New BigNum with result
   */
  mul(other) {
    const b = this._toBigNum(other);
    return new BigNum(
      this.mantissa * b.mantissa,
      this.exponent + b.exponent
    );
  }

  /**
   * Divide by another number
   * @param {number|string|BigNum} other
   * @returns {BigNum} New BigNum with result
   */
  div(other) {
    const b = this._toBigNum(other);
    if (b.mantissa === 0) {
      console.warn('BigNum: Division by zero');
      return BigNum.from(Infinity);
    }
    return new BigNum(
      this.mantissa / b.mantissa,
      this.exponent - b.exponent
    );
  }

  /**
   * Less than comparison
   * @param {number|string|BigNum} other
   * @returns {boolean}
   */
  lt(other) {
    const b = this._toBigNum(other);
    if (this.exponent !== b.exponent) {
      return this.exponent < b.exponent;
    }
    return this.mantissa < b.mantissa;
  }

  /**
   * Less than or equal comparison
   * @param {number|string|BigNum} other
   * @returns {boolean}
   */
  lte(other) {
    return this.lt(other) || this.eq(other);
  }

  /**
   * Greater than comparison
   * @param {number|string|BigNum} other
   * @returns {boolean}
   */
  gt(other) {
    const b = this._toBigNum(other);
    if (this.exponent !== b.exponent) {
      return this.exponent > b.exponent;
    }
    return this.mantissa > b.mantissa;
  }

  /**
   * Greater than or equal comparison
   * @param {number|string|BigNum} other
   * @returns {boolean}
   */
  gte(other) {
    return this.gt(other) || this.eq(other);
  }

  /**
   * Equality comparison
   * @param {number|string|BigNum} other
   * @returns {boolean}
   */
  eq(other) {
    const b = this._toBigNum(other);
    return this.exponent === b.exponent &&
           Math.abs(this.mantissa - b.mantissa) < 1e-9;
  }

  /**
   * Floor the value
   * @returns {BigNum}
   */
  floor() {
    const num = this.toNumber();
    return BigNum.from(Math.floor(num));
  }

  /**
   * Ceil the value
   * @returns {BigNum}
   */
  ceil() {
    const num = this.toNumber();
    return BigNum.from(Math.ceil(num));
  }

  /**
   * Calculate log base 10
   * @returns {BigNum}
   */
  log10() {
    if (this.mantissa <= 0) {
      console.warn('BigNum: log10 of non-positive number');
      return BigNum.from(NaN);
    }
    // log10(m * 10^e) = log10(m) + e
    const result = Math.log10(this.mantissa) + this.exponent;
    return BigNum.from(result);
  }

  /**
   * Raise to a power
   * @param {number} n - Exponent
   * @returns {BigNum}
   */
  pow(n) {
    if (n === 0) return BigNum.from(1);
    if (n === 1) return BigNum.from(this);

    // (m * 10^e)^n = m^n * 10^(e*n)
    const newMantissa = Math.pow(this.mantissa, n);
    const newExponent = this.exponent * n;

    return new BigNum(newMantissa, newExponent);
  }

  /**
   * Convert to JavaScript number (may lose precision for very large numbers)
   * @returns {number}
   */
  toNumber() {
    if (this.exponent > 308) {
      return this.mantissa > 0 ? Infinity : -Infinity;
    }
    if (this.exponent < -308) {
      return 0;
    }
    return this.mantissa * Math.pow(10, this.exponent);
  }

  /**
   * Format number for display
   * @param {number} precision - Decimal places (default 2)
   * @returns {string}
   */
  format(precision = 2) {
    if (this.mantissa === 0) return '0';

    const suffixes = [
      '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'
    ];

    const sign = this.mantissa < 0 ? '-' : '';
    const absValue = Math.abs(this.toNumber());

    // Small numbers (< 1000) - show directly
    if (this.exponent < 3 && absValue < 1000) {
      // Handle decimals for small numbers
      if (Number.isInteger(absValue)) {
        return sign + Math.abs(absValue).toString();
      }
      return sign + Math.abs(absValue).toFixed(precision);
    }

    // Use suffixes for numbers up to 10^36
    const suffixIndex = Math.floor(this.exponent / 3);

    if (suffixIndex < suffixes.length) {
      const displayExponent = suffixIndex * 3;
      const displayValue = absValue / Math.pow(10, displayExponent);
      return sign + displayValue.toFixed(precision) + suffixes[suffixIndex];
    }

    // Use scientific notation for very large numbers
    const displayMantissa = Math.abs(this.mantissa).toFixed(precision);
    return sign + displayMantissa + 'e' + this.exponent;
  }

  /**
   * String representation
   * @returns {string}
   */
  toString() {
    return this.format();
  }
}

export { BigNum };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.BigNum = BigNum;
}
