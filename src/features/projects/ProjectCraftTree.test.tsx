import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProjectCraftTree } from './ProjectCraftTree';
import type { ProjectTreeNode } from './projectTree';
import type { StoredTask } from '../../bot/craftTypes';

const tk = (itemId: number, name: string, source: StoredTask['source'], over: Partial<StoredTask> = {}): StoredTask => ({
  id: itemId, projectId: 1, itemId, itemName: name, qtyNeeded: 2, qtyDone: 0,
  source, meta: null, assigneeId: null, status: 'open', updatedAt: 0, ...over,
});
const node = (task: StoredTask, children: ProjectTreeNode[] = []): ProjectTreeNode => ({ task, children });

const renderTree = (roots: ProjectTreeNode[]) =>
  render(<MemoryRouter><ProjectCraftTree roots={roots} /></MemoryRouter>);

describe('ProjectCraftTree', () => {
  it('renders a main craft with nested components and source tags', () => {
    renderTree([node(tk(100, 'Hammer', 'craft'), [
      node(tk(200, 'Ore', 'gather')),
      node(tk(300, 'Flux', 'market')),
    ])]);
    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.getByText('Ore')).toBeInTheDocument();
    expect(screen.getByText('Gather')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
  });

  it('collapses and expands a craft\'s children', async () => {
    renderTree([node(tk(100, 'Hammer', 'craft'), [node(tk(200, 'Ore', 'gather'))])]);
    expect(screen.getByText('Ore')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.queryByText('Ore')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText('Ore')).toBeInTheDocument();
  });
});
