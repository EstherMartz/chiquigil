import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TaskSource } from '../../bot/craftTypes';
import type { ProjectTreeNode } from './projectTree';

const SOURCE_TAG: Record<TaskSource, string> = {
  craft: 'Craft', workshop: 'Workshop', gather: 'Gather',
  currency: 'Currency', vendor: 'Vendor', market: 'Market',
};

function statusClass(status: string): string {
  return status === 'done' ? 'text-green-400' : status === 'claimed' ? 'text-yellow-400' : 'text-text-low';
}

export function ProjectCraftTree({ roots }: { roots: ProjectTreeNode[] }) {
  return (
    <div className="border border-border-base rounded p-3">
      <ul className="space-y-0.5">
        {roots.map((n) => <TreeRow key={n.task.id} node={n} depth={0} />)}
      </ul>
    </div>
  );
}

function TreeRow({ node, depth }: { node: ProjectTreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const { task } = node;
  const hasChildren = node.children.length > 0;
  const pct = task.qtyNeeded > 0 ? Math.round((task.qtyDone / task.qtyNeeded) * 100) : 0;
  const isMain = depth === 0;

  return (
    <li>
      <div
        className={[
          'flex items-center gap-2 py-1.5 px-1 rounded border-b border-border-base/20',
          task.status === 'done' ? 'bg-green-400/5' : task.status === 'claimed' ? 'bg-yellow-400/5' : '',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-4 text-text-low hover:text-text-base font-mono text-[10px] leading-none"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-xs text-text-low">{task.qtyNeeded}×</span>
        <Link
          to={`/item/${task.itemId}`}
          className={`flex-1 min-w-0 truncate hover:underline ${isMain ? 'font-semibold text-text-base' : 'text-text-low'}`}
        >
          {task.itemName}
        </Link>
        <span className="font-mono text-[10px] tracking-wide text-text-low/70 border border-border-base/40 rounded px-1.5 py-0.5">
          {SOURCE_TAG[task.source]}
        </span>
        <span className="font-mono text-xs text-text-low w-20 text-right">{task.qtyDone}/{task.qtyNeeded} ({pct}%)</span>
        <span className={`font-mono text-xs w-16 text-right font-semibold ${statusClass(task.status)}`}>
          {task.status === 'done' ? '✓ done' : task.status === 'claimed' ? '⚒ claimed' : 'open'}
        </span>
      </div>
      {hasChildren && open && (
        <ul className="space-y-0.5">
          {node.children.map((child, i) => (
            <TreeRow key={`${child.task.id}:${i}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
