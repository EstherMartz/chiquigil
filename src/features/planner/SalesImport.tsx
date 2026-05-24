import { useRef, useState } from 'react';
import { usePlannerStore } from './plannerStore';
import { parseSalesCsv } from './parseSalesCsv';

export function SalesImport() {
  const importCsv = usePlannerStore((s) => s.importCsv);
  const rollbackLastImport = usePlannerStore((s) => s.rollbackLastImport);
  const lastImportBatchId = usePlannerStore((s) => s.lastImportBatchId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ imported: number; matched: number; skipped: number } | null>(null);
  const [rolledBack, setRolledBack] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseSalesCsv(text);
      const res = importCsv(rows);
      setResult(res);
      setRolledBack(false);
    };
    reader.readAsText(file);
  }

  function handleRollback() {
    const count = rollbackLastImport();
    if (count > 0) {
      setResult(null);
      setRolledBack(true);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={onInputChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="font-mono text-[10px] tracking-widest uppercase border border-border-base text-text-dim px-3 py-2 hover:text-gold hover:border-gold transition-colors"
      >
        Import Sales CSV
      </button>
      {result && (
        <span className="font-mono text-[11px] text-text-low">
          {result.imported > 0 ? (
            <>
              <span className="text-jade">+{result.imported}</span> imported
              {result.matched > 0 && <>{' · '}<span className="text-gold">{result.matched}</span> matched</>}
              {result.skipped > 0 && <>{' · '}<span className="text-text-low">{result.skipped}</span> skipped</>}
            </>
          ) : result.skipped > 0 ? (
            <span>All {result.skipped} rows already imported</span>
          ) : (
            <span>No valid rows found</span>
          )}
        </span>
      )}
      {lastImportBatchId && !rolledBack && (
        <button
          type="button"
          onClick={handleRollback}
          className="font-mono text-[10px] tracking-widest uppercase text-crimson border border-crimson/30 px-2 py-1 hover:bg-crimson/10 transition-colors"
        >
          Undo last import
        </button>
      )}
      {rolledBack && (
        <span className="font-mono text-[11px] text-crimson">Import rolled back</span>
      )}
    </div>
  );
}
