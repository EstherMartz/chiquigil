import { describe, it, expect } from 'vitest';
import { toCsv, type CsvColumn } from './csv';

interface Row {
  id: number;
  name: string;
  price: number;
  hq: boolean;
}

const cols: CsvColumn<Row>[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'hq', label: 'HQ' },
];

const rows: Row[] = [
  { id: 1, name: 'Wind Shard', price: 10, hq: false },
  { id: 2, name: "O'aharu, the Wandering Star", price: 5000, hq: true },
];

describe('toCsv', () => {
  it('emits header row + data rows separated by \\r\\n', () => {
    const out = toCsv(rows, cols);
    const lines = out.split('\r\n');
    expect(lines[0]).toBe('ID,Name,Price,HQ');
    expect(lines[1]).toBe('1,Wind Shard,10,false');
    expect(lines[2]).toBe('2,"O\'aharu, the Wandering Star",5000,true');
  });

  it('quotes values containing commas, double-quotes, or newlines', () => {
    const r = [{ id: 1, name: 'a,b', price: 0, hq: false }];
    expect(toCsv(r, cols).split('\r\n')[1]).toBe('1,"a,b",0,false');
  });

  it('escapes double quotes by doubling them', () => {
    const r = [{ id: 1, name: 'has "quotes"', price: 0, hq: false }];
    expect(toCsv(r, cols).split('\r\n')[1]).toBe('1,"has ""quotes""",0,false');
  });

  it('supports custom cell formatters via column.value', () => {
    const fmtCols: CsvColumn<Row>[] = [
      { key: 'id', label: 'ID' },
      { key: 'price', label: 'Price (gil)', value: (r) => r.price.toLocaleString('en-US') },
    ];
    const out = toCsv([{ id: 1, name: 'x', price: 1234567, hq: false }], fmtCols);
    expect(out.split('\r\n')[1]).toBe('1,"1,234,567"'); // quoted because of commas
  });

  it('renders null/undefined as empty', () => {
    interface R2 {
      a: number | null;
      b: string | undefined;
    }
    const c: CsvColumn<R2>[] = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ];
    const out = toCsv([{ a: null, b: undefined }], c);
    expect(out.split('\r\n')[1]).toBe(',');
  });
});
