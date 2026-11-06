'use strict';
/** Petits utilitaires HTTP / validation partagés par les routes. */

class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const bad = (code, details) => new HttpError(400, code, details);
const notFound = (code = 'not_found') => new HttpError(404, code);

/** Enveloppe un handler async pour transmettre les erreurs à Express. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, { min = 0, max = 10000, field = 'value' } = {}) => {
  if (typeof v !== 'string') throw bad('invalid_field', { field });
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad('invalid_length', { field, min, max });
  return s;
};

const int = (v, { min = -Infinity, max = Infinity, field = 'value' } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad('invalid_field', { field });
  return n;
};

const optInt = (v, opts) => (v === undefined || v === null || v === '' ? null : int(v, opts));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = { HttpError, bad, notFound, wrap, str, int, optInt, EMAIL_RE };
