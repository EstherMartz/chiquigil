import { useState, useRef } from 'react';
import { btnPrimaryLarge, btnDanger } from '../../components/buttonStyles';

interface AllaganPasteBoxProps {
  onParse: (csvText: string) => void;
  onClear: () => void;
  parseError: string | null;
  parsedSummary: string | null;
}

export function AllaganPasteBox({ onParse, onClear, parseError, parsedSummary }: AllaganPasteBoxProps) {
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const csv = await file.text();
    setText(csv);
    onParse(csv);
    // Reset so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] text-text-low tracking-widest uppercase">
          Inventory Analyzer
        </p>
        <p className="font-mono text-[10px] text-text-low mt-1">
          Paste your inventory CSV to find items worth selling.{' '}
          <span className="text-aether cursor-help" title="Export your inventory from the Allagan Tools or Inventory Tools FFXIV plugin (Inventory → Export as CSV), then paste the contents here or use Upload CSV.">
            How to export ⓘ
          </span>
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full font-mono text-xs bg-bg-card-hi text-text-cream border border-border-base p-3"
        placeholder={'Item ID,Item Name,Quantity,HQ,Location\n5,Fire Shard,42,false,bag\n...'}
        aria-label="Allagan CSV paste"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={() => onParse(text)}
          disabled={!text.trim()}
          className={btnPrimaryLarge}
        >
          Parse
        </button>
        <label className={btnPrimaryLarge + ' cursor-pointer'}>
          Upload CSV
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFile}
            className="hidden"
            aria-label="Upload Allagan CSV file"
          />
        </label>
        <button
          onClick={() => { setText(''); onClear(); }}
          className={btnDanger}
        >
          Clear
        </button>
        {parsedSummary && (
          <span className="font-mono text-[11px] text-text-low">{parsedSummary}</span>
        )}
        {parseError && (
          <span className="font-mono text-[11px] text-crimson">{parseError}</span>
        )}
      </div>
    </div>
  );
}
