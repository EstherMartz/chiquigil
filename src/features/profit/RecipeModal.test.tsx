import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecipeModal } from './RecipeModal';
import type { Recipe } from '../../lib/recipes';

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const recipe: Recipe = {
  itemResultId: 49281, classJob: 'LTW', recipeLevel: 100,
  ingredients: [{ itemId: 7, amount: 5 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: { '49281': { entries: [] } } }),
  }));
});

describe('RecipeModal', () => {
  it('renders ingredient name when nameMap has it', () => {
    render(wrap(
      <RecipeModal
        item={{ id: 49281, name: "Courtly Lover's Temple Chain of Striking", crafter: 'LTW', lvl: 100, cat: 'Raid' }}
        recipe={recipe}
        recipeMap={new Map()}
        phantom={{}}
        dc={{}}
        nameMap={new Map([[7, 'Wind Shard']])}
        craftIntermediates={false}
        onToggleCraftIntermediates={() => {}}
        craftTimeSeconds={undefined}
        defaultCraftTimeSeconds={60}
        onChangeCraftTime={() => {}}
        historyScope={'Chaos'}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText(/Wind Shard/)).toBeInTheDocument();
    expect(screen.queryByText(/^#7$/)).not.toBeInTheDocument();
  });

  it('falls back to #id when name is not in nameMap', () => {
    render(wrap(
      <RecipeModal
        item={{ id: 49281, name: 'X', crafter: 'LTW', lvl: 100, cat: 'Raid' }}
        recipe={recipe}
        recipeMap={new Map()}
        phantom={{}}
        dc={{}}
        nameMap={new Map()}
        craftIntermediates={false}
        onToggleCraftIntermediates={() => {}}
        craftTimeSeconds={undefined}
        defaultCraftTimeSeconds={60}
        onChangeCraftTime={() => {}}
        historyScope={'Chaos'}
        onClose={() => {}}
      />
    ));
    expect(screen.getByText('#7')).toBeInTheDocument();
  });
});
