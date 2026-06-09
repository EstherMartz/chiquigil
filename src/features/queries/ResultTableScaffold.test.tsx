import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultTableScaffold } from './ResultTableScaffold';
import { useSettingsStore } from '../settings/store';

interface Row { id: number }

function renderScaffold(rows: Row[], onVisibleRows: (v: Row[]) => void) {
  return render(
    <ResultTableScaffold<Row>
      rows={rows}
      totalCandidates={rows.length}
      skippedChunks={0}
      emptyState={<div>empty</div>}
      onVisibleRows={onVisibleRows}
      renderTable={(visible) => <table><tbody>{visible.map((r) => <tr key={r.id}><td>{r.id}</td></tr>)}</tbody></table>}
    />,
  );
}

describe('ResultTableScaffold onVisibleRows', () => {
  it('fires with the visible slice on mount', () => {
    const spy = vi.fn();
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    renderScaffold(rows, spy);
    expect(spy).toHaveBeenCalled();
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0] as Row[];
    expect(lastCall.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('does not throw when onVisibleRows is omitted', () => {
    expect(() =>
      render(
        <ResultTableScaffold<Row>
          rows={[{ id: 1 }]}
          totalCandidates={1}
          skippedChunks={0}
          emptyState={<div>empty</div>}
          renderTable={(visible) => <div>{visible.length}</div>}
        />,
      ),
    ).not.toThrow();
  });
});

describe('ResultTableScaffold ignore filtering', () => {
  beforeEach(() => useSettingsStore.setState({ ignoredItemIds: [], hideIgnored: true }));

  it('drops ignored rows when hideIgnored is on', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: true });
    const rows = [{ id: 1, name: 'Keep' }, { id: 2, name: 'Drop' }];
    render(
      <ResultTableScaffold
        rows={rows}
        totalCandidates={2}
        skippedChunks={0}
        emptyState={<div>empty</div>}
        renderTable={(visible) => (
          <ul>{visible.map((r) => <li key={r.id}>{(r as any).name}</li>)}</ul>
        )}
      />,
    );
    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.queryByText('Drop')).toBeNull();
    expect(screen.getByText(/1 matches from 2 candidates/)).toBeInTheDocument();
  });

  it('keeps ignored rows when hideIgnored is off', () => {
    useSettingsStore.setState({ ignoredItemIds: [2], hideIgnored: false });
    const rows = [{ id: 1, name: 'Keep' }, { id: 2, name: 'Drop' }];
    render(
      <ResultTableScaffold
        rows={rows}
        totalCandidates={2}
        skippedChunks={0}
        emptyState={<div>empty</div>}
        renderTable={(visible) => (
          <ul>{visible.map((r) => <li key={r.id}>{(r as any).name}</li>)}</ul>
        )}
      />,
    );
    expect(screen.getByText('Drop')).toBeInTheDocument();
  });
});
