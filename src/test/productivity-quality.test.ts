import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, DEFAULT_SETTINGS } from '../db';
import { IProductionLine, IProductivityQualityRate, ISystemSettings } from '../types';

describe('Phase E: Productivity & Quality Rates and Settings', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.productionLines.clear();
    await db.productivityQualityRates.clear();
    await db.settings.clear();
  });

  it('can create and query production lines', async () => {
    const now = new Date().toISOString();
    await db.productionLines.bulkPut([
      { id: 'line_rivet_1', name: 'Line Rivet 1', description: 'Chuyền đinh tán 1', createdAt: now },
      { id: 'line_rivet_2', name: 'Line Rivet 2', description: 'Chuyền đinh tán 2', createdAt: now },
      { id: 'line_custom_3', name: 'Line May 1', description: 'Chuyền may nệm', createdAt: now },
    ]);

    const lines = await db.productionLines.toArray();
    expect(lines.length).toBe(3);
    expect(lines.map(l => l.id)).toContain('line_custom_3');
  });

  it('can save and query daily productivity & quality rates by compound index', async () => {
    const sampleRates: IProductivityQualityRate[] = [
      {
        lineId_date: 'line_rivet_1_2026-08-01',
        lineId: 'line_rivet_1',
        date: '2026-08-01',
        month: 8,
        year: 2026,
        productivityRate: 105,
        qualityRate: 99
      },
      {
        lineId_date: 'line_rivet_1_2026-08-02',
        lineId: 'line_rivet_1',
        date: '2026-08-02',
        month: 8,
        year: 2026,
        productivityRate: 95,
        qualityRate: 97
      },
      {
        lineId_date: 'line_rivet_2_2026-08-01',
        lineId: 'line_rivet_2',
        date: '2026-08-01',
        month: 8,
        year: 2026,
        productivityRate: 100,
        qualityRate: 100
      },
      {
        lineId_date: 'line_rivet_1_2026-09-01',
        lineId: 'line_rivet_1',
        date: '2026-09-01',
        month: 9,
        year: 2026,
        productivityRate: 110,
        qualityRate: 98
      }
    ];

    await db.productivityQualityRates.bulkPut(sampleRates);

    // Query by compound index [lineId+month+year]
    const augLine1 = await db.productivityQualityRates
      .where('[lineId+month+year]')
      .equals(['line_rivet_1', 8, 2026])
      .toArray();

    expect(augLine1.length).toBe(2);
    const avgNS = Math.round(augLine1.reduce((sum, r) => sum + r.productivityRate, 0) / augLine1.length);
    const avgCL = Math.round(augLine1.reduce((sum, r) => sum + r.qualityRate, 0) / augLine1.length);
    expect(avgNS).toBe(100);
    expect(avgCL).toBe(98);

    // Query single day compound index [lineId+date]
    const singleDay = await db.productivityQualityRates
      .where('[lineId+date]')
      .equals(['line_rivet_1', '2026-08-01'])
      .first();

    expect(singleDay?.productivityRate).toBe(105);
    expect(singleDay?.qualityRate).toBe(99);
  });

  it('persists customized settings for trade union fee, diligence, and group 2 productivity', async () => {
    const customSettings: ISystemSettings = {
      ...DEFAULT_SETTINGS,
      tradeUnionFee: 45000,
      diligenceBonusConfig: {
        baseAmount: 600000,
        countRange: 'J:AM',
        countOffAsUL: true,
        twoDaysULPenaltyPct: 50,
        threeDaysULPenaltyPct: 100
      },
      productivityBonusConfig: {
        defaultBaseRate: 1200000,
        formula: '(TotalWD+TotalAL)*BaseRate/StandardWD',
        probationGetsBonusGroup2: false,
        deductULGroup2Rule: 'same_as_diligence',
        applyLineRatesToGroup2: true,
        useDepartmentOverride: false
      }
    };

    await db.settings.put({ key: 'systemSettings', value: customSettings });

    const retrieved = await db.settings.get('systemSettings');
    expect(retrieved?.value.tradeUnionFee).toBe(45000);
    expect(retrieved?.value.diligenceBonusConfig.baseAmount).toBe(600000);
    expect(retrieved?.value.productivityBonusConfig.defaultBaseRate).toBe(1200000);
    expect(retrieved?.value.productivityBonusConfig.probationGetsBonusGroup2).toBe(false);
    expect(retrieved?.value.productivityBonusConfig.applyLineRatesToGroup2).toBe(true);
  });
});
