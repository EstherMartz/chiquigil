import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/SectionHeader';
import { garlandQuestUrl } from '../../lib/format';
import { jobTagForGenre } from './deliverableGenres';
import type { GcSupplyUsedInEntry } from '../../lib/gcSupplyUsedInIndex';
import type { LeveUsedInEntry } from '../../lib/leveUsedInIndex';
import type { GarlandQuestRef } from '../../lib/garlandData';

interface Props {
  gcSupply: GcSupplyUsedInEntry[];
  leves: LeveUsedInEntry[];
  quests: GarlandQuestRef[];
}

const ROW = 'flex items-center justify-between gap-3 px-4 py-2 border-t border-border-base first:border-t-0';
const META = 'font-mono text-[10px] tracking-widest uppercase text-text-low shrink-0';

export function DeliverablesBlock({ gcSupply, leves, quests }: Props) {
  if (gcSupply.length === 0 && leves.length === 0 && quests.length === 0) return null;

  return (
    <section>
      <SectionHeader label="Turn-Ins & Deliverables" compact />
      <div className="space-y-3">
        {gcSupply.length > 0 && (
          <SubBlock title="Grand Company Supply">
            {gcSupply.map((e, i) => (
              <div key={i} className={ROW}>
                <span className="text-text-cream">{e.categoryName} provisioning</span>
                <span className={META}>Lv.{e.level} · ×{e.qty}</span>
              </div>
            ))}
          </SubBlock>
        )}

        {leves.length > 0 && (
          <SubBlock title="Levequests">
            {leves.map((e) => (
              <div key={e.leveId} className={ROW}>
                <Link to="/leves" className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors">
                  {e.name}
                </Link>
                <span className={META}>{e.jobCode} Lv.{e.level} · ×{e.qty}</span>
              </div>
            ))}
          </SubBlock>
        )}

        {quests.length > 0 && (
          <SubBlock title="Quest Turn-Ins">
            {quests.map((q) => {
              const tag = jobTagForGenre(q.genre);
              return (
                <div key={q.id} className={ROW}>
                  <a
                    href={garlandQuestUrl(q.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-cream hover:text-aether hover:underline decoration-1 underline-offset-4 transition-colors"
                  >
                    {q.name}
                  </a>
                  {tag && <span className={META}>{tag}</span>}
                </div>
              );
            })}
          </SubBlock>
        )}
      </div>
    </section>
  );
}

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border-base bg-bg-card">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-text-low px-4 py-2 border-b border-border-base">
        {title}
      </div>
      {children}
    </div>
  );
}
