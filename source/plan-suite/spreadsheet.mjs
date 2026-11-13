export class SheetError extends Error {}

const indexes = new WeakMap();
const columnIndex = name => [...name].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;

function number(value) {
  if (value === null || typeof value === 'boolean') return Number(value);
  if (typeof value === 'number' || typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  throw new SheetError('#VALUE!');
}

function string(value) {
  if (value === null) return '';
  return typeof value === 'boolean' ? String(value).toUpperCase() : String(value);
}

function compare(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = value => typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') { a = a.toUpperCase(); b = b.toUpperCase(); }
  return a === b ? 0 : a < b ? -1 : 1;
}

function numericResult(value) {
  if (!Number.isFinite(value)) throw new SheetError('#NUM!');
  return value;
}

function irr(values, guess) {
  if (!values.some(value => value > 0) || !values.some(value => value < 0)) throw new SheetError('#NUM!');
  for (const start of [guess, 0.01, -0.3, -0.75, 0.5, 2]) {
    let rate = start;
    for (let i = 0; i < 64 && rate > -1 && Number.isFinite(rate); i++) {
      let total = 0;
      let slope = 0;
      for (const [year, payment] of values.entries()) {
        const pv = payment / (1 + rate) ** year;
        total += pv;
        slope -= pv * year / (1 + rate);
      }
      const change = total / slope;
      if (Math.abs(change) <= 1e-12) return rate - change;
      rate -= change;
    }
  }
  throw new SheetError('#NUM!');
}

function lookupKey(value) {
  return typeof value === 'string' ? `s:${value.toUpperCase()}` : value;
}

class CellRange {
  constructor(engine, sheet, row, end, col, right) {
    Object.assign(this, { engine, sheet, row, end, col, right });
  }

  *values() {
    for (let row = this.row; row <= this.end; row++) {
      for (let col = this.col; col <= this.right; col++) yield this.engine.cell(this.sheet, row, col);
    }
  }
}

export class Spreadsheet {
  constructor(model, inputs = {}) {
    this.model = model;
    this.overrides = new Map();
    this.memo = new Map();
    this.active = new Set();
    this.references = new Map();
    for (const [sheet, cells] of Object.entries(inputs)) {
      for (const [address, value] of Object.entries(cells)) {
        const [, col, row] = /^([A-Z]+)(\d+)$/.exec(address);
        this.overrides.set(`${sheet}!${Number(row) - 1}:${columnIndex(col)}`, value);
      }
    }
  }

  cell(sheet, row, col) {
    const source = this.model.sheets[sheet];
    if (!source) throw new SheetError('#REF!');
    const entry = source.rows[row]?.[col] ?? null;
    if (source.static) {
      if (Array.isArray(entry)) throw new SheetError(entry[1]);
      return entry;
    }
    const key = `${sheet}!${row}:${col}`;
    if (this.overrides.has(key)) return this.overrides.get(key);
    if (!Array.isArray(entry)) return entry;
    if (this.memo.has(key)) {
      const result = this.memo.get(key);
      if (result instanceof SheetError) throw result;
      return result;
    }
    if (this.active.has(key)) throw new Error(`Circular reference at ${key}`);
    this.active.add(key);
    try {
      const result = this.scalar(this.evaluate(entry, sheet, row, col)) ?? 0;
      this.memo.set(key, result);
      return result;
    } catch (error) {
      if (error instanceof SheetError) this.memo.set(key, error);
      throw error;
    } finally {
      this.active.delete(key);
    }
  }

  reference(address, sheet) {
    const key = `${sheet}!${address}`;
    if (!this.references.has(key)) {
      const named = this.model.names[address.toLowerCase()];
      if (named) return this.reference(named, sheet);
      if (address.includes('#REF!') || address.includes('[')) throw new SheetError('#REF!');
      const mark = address.lastIndexOf('!');
      const target = mark < 0 ? sheet : address.slice(0, mark).replace(/^'|'$/g, '').replaceAll("''", "'");
      const coords = address.slice(mark + 1).replaceAll('$', '').toUpperCase();
      const [start, end] = coords.split(':');
      const first = /^([A-Z]{1,3})(\d*)$/.exec(start);
      const last = /^([A-Z]{1,3})(\d*)$/.exec(end ?? start);
      if (!first || !last || !end && !first[2]) throw new SheetError('#NAME?');
      const targetSheet = this.model.sheets[target];
      if (!targetSheet) throw new SheetError('#REF!');
      const row = first[2] ? Number(first[2]) - 1 : 0;
      const lastRow = last[2] ? Number(last[2]) - 1 : targetSheet.rows.length - 1;
      const col = columnIndex(first[1]);
      const right = columnIndex(last[1]);
      this.references.set(key, { target, row, lastRow, col, right, range: !!end });
    }
    const { target, row, lastRow, col, right, range } = this.references.get(key);
    return range ? new CellRange(this, target, row, Math.min(lastRow, this.model.sheets[target].rows.length - 1), col, right) : this.cell(target, row, col);
  }

  scalar(value) {
    return value instanceof CellRange ? this.cell(value.sheet, value.row, value.col) : value;
  }

  lookup(key, range, index, exact) {
    if (!(range instanceof CellRange)) throw new SheetError('#VALUE!');
    const offset = Math.trunc(number(index)) - 1;
    if (offset < 0 || offset + range.col > range.right) throw new SheetError('#REF!');
    const source = this.model.sheets[range.sheet];
    let found;
    if (exact && source.static) {
      if (!indexes.has(source)) indexes.set(source, new Map());
      const sourceIndexes = indexes.get(source);
      const indexKey = `${range.row}:${range.end}:${range.col}`;
      if (!sourceIndexes.has(indexKey)) {
        const keys = new Map();
        for (let row = range.row; row <= range.end; row++) {
          const item = source.rows[row]?.[range.col];
          if (item !== null && item !== undefined && !Array.isArray(item) && !keys.has(lookupKey(item))) keys.set(lookupKey(item), row);
        }
        sourceIndexes.set(indexKey, keys);
      }
      found = sourceIndexes.get(indexKey).get(lookupKey(key));
    } else {
      for (let row = range.row; row <= range.end; row++) {
        const current = this.cell(range.sheet, row, range.col);
        if (current === null) continue;
        const relation = compare(current, key);
        if (relation === 0) { found = row; break; }
        if (!exact && relation < 0) found = row;
        if (!exact && relation > 0) break;
      }
    }
    if (found === undefined) throw new SheetError('#N/A');
    return this.cell(range.sheet, found, range.col + offset) ?? 0;
  }

  evaluate(node, sheet, row, col) {
    if (!Array.isArray(node)) return node;
    const [op, ...args] = node;
    const calculate = value => this.evaluate(value, sheet, row, col);
    const read = i => this.scalar(calculate(args[i]));
    const expand = value => value instanceof CellRange ? [...value.values()] : Array.isArray(value) ? value : [value];
    if (op === 'err') throw new SheetError(args[0]);
    if (op === 'ref') return this.reference(args[0], sheet);
    if (op === 'prefix') return number(read(1)) * (args[0] === '-' ? -1 : 1);
    if (op === 'percent') return number(read(0)) / 100;
    if (op === 'union') return args.flatMap(argument => expand(calculate(argument)));
    if (op === 'fn') {
      const fn = args.shift();
      const values = () => args.flatMap(argument => expand(calculate(argument)));
      switch (fn) {
        case 'IF': return read(0) ? calculate(args[1] ?? 0) : calculate(args.length < 3 ? false : args[2] ?? 0);
        case 'IFERROR': {
          try { return calculate(args[0]); }
          catch (error) { if (!(error instanceof SheetError)) throw error; return calculate(args[1]); }
        }
        case 'AND': return values().every(Boolean);
        case 'OR': return values().some(Boolean);
        case 'SUM': return values().reduce((sum, value) => typeof value === 'number' ? sum + value : sum, 0);
        case 'MAX': {
          const items = values().filter(value => typeof value === 'number');
          return items.length ? Math.max(...items) : 0;
        }
        case 'MIN': {
          const items = values().filter(value => typeof value === 'number');
          return items.length ? Math.min(...items) : 0;
        }
        case 'VLOOKUP': return this.lookup(read(0), calculate(args[1]), read(2), args.length > 3 && !read(3));
        case 'MATCH': {
          const wanted = read(0);
          const list = calculate(args[1]);
          const mode = args.length > 2 ? number(read(2)) : 1;
          if (!(list instanceof CellRange)) throw new SheetError('#N/A');
          let match = 0;
          let index = 0;
          for (const value of list.values()) {
            index++;
            const order = compare(value, wanted);
            if (!order) return index;
            if (mode && order * mode < 0) match = index;
            if (mode && order * mode > 0) break;
          }
          if (!match) throw new SheetError('#N/A');
          return match;
        }
        case 'IRR': {
          const payments = calculate(args[0]);
          return irr(expand(payments).filter(value => typeof value === 'number'), args.length > 1 ? number(read(1)) : 0.1);
        }
        case 'INDIRECT': return this.reference(string(read(0)), sheet);
        case 'COLUMN': return col + 1;
        default: throw new Error(`Unsupported spreadsheet function ${fn}`);
      }
    }
    const left = read(0);
    const right = read(1);
    switch (op) {
      case '&': return string(left) + string(right);
      case '=': return compare(left, right) === 0;
      case '<>': return compare(left, right) !== 0;
      case '<': return compare(left, right) < 0;
      case '<=': return compare(left, right) <= 0;
      case '>': return compare(left, right) > 0;
      case '>=': return compare(left, right) >= 0;
      case '+': return numericResult(number(left) + number(right));
      case '-': return numericResult(number(left) - number(right));
      case '*': return numericResult(number(left) * number(right));
      case '/': {
        const divisor = number(right);
        if (!divisor) throw new SheetError('#DIV/0!');
        return numericResult(number(left) / divisor);
      }
      case '^': return numericResult(number(left) ** number(right));
      default: throw new Error(`Unsupported spreadsheet operator ${op}`);
    }
  }
}

export function columnNumber(column) {
  return columnIndex(column);
}
