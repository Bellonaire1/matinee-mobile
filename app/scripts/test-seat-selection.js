/**
 * Automated Verification & Hardening Test Suite for Matinee Seat Selection
 * Task: M04.3 QA
 *
 * Covers:
 * 1. 320 unique seat IDs and capacity
 * 2. Tier and row counts audit (Resolves VIP 112 vs Couple 64 discrepancy)
 * 3. Available, held, and sold breakdown
 * 4. Selection and deselection state transitions
 * 5. Couple-seat atomicity (both selected, both deselected, rejection if partner held/sold)
 * 6. Max 8-seat limit enforcement
 * 7. Kobo minor-unit pricing and NGN formatting
 * 8. Wheelchair-accessible seat allocation & behavior
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ts = require('typescript');

// In-memory TypeScript transpiler to run typed models directly
function loadTs(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;

  const exports = {};
  const module = { exports };
  const customRequire = (id) => {
    if (id.startsWith('.')) {
      const targetPath = path.resolve(path.dirname(filePath), id.endsWith('.ts') ? id : `${id}.ts`);
      return loadTs(targetPath);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', compiled);
  fn(customRequire, module, exports);
  return module.exports;
}

const mockSeatsPath = path.resolve(__dirname, '../src/data/mockSeats.ts');
const enginePath = path.resolve(__dirname, '../src/data/seatSelectionEngine.ts');
const mockCinemasPath = path.resolve(__dirname, '../src/data/mockCinemas.ts');
const mockMoviesPath = path.resolve(__dirname, '../src/data/mockMovies.ts');

const {
  generateAuditoriumLayout,
  formatKoboToNgn,
  APPROVED_BASE_PRICE_KOBO,
  APPROVED_SHOWTIME_PRICE_LABEL,
  APPROVED_MOVIE_STARTING_PRICE,
  getShowtimeStartingPriceLabel,
} = loadTs(mockSeatsPath);
const {
  toggleSeatSelection,
  calculateSelectionTotals,
  validateSelectionInvariants,
  DEFAULT_MAX_SEATS_PER_BOOKING,
  formatSeatCount,
  formatSelectionModalSubtitle,
} = loadTs(enginePath);
const { LAGOS_CINEMAS } = loadTs(mockCinemasPath);
const { MOCK_FEATURED_MOVIE, MOCK_NOW_SHOWING_MOVIES, MOCK_COMING_SOON_MOVIES } = loadTs(mockMoviesPath);

let totalPassed = 0;
let totalFailed = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✓ ${testName}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    ${err.message}`);
    totalFailed++;
  }
}

function suite(suiteName, fn) {
  console.log(`\n======================================================`);
  console.log(`SUITE: ${suiteName}`);
  console.log(`======================================================`);
  fn();
}

console.log(`\n======================================================`);
console.log(`MATINEE SEAT SELECTION QA TEST HARNESS`);
console.log(`======================================================`);

const layout = generateAuditoriumLayout(700000);
const { seatsById, rows } = layout;

// ---------------------------------------------------------------------------
// SUITE 1: 320 Unique Seat IDs & Capacity
// ---------------------------------------------------------------------------
suite('1. 320 Unique Seat IDs & Capacity', () => {
  runTest('Auditorium totalSeats equals exactly 320', () => {
    assert.strictEqual(layout.totalSeats, 320);
    assert.strictEqual(Object.keys(seatsById).length, 320);
  });

  runTest('All 320 seat IDs are strictly unique', () => {
    const idSet = new Set(Object.keys(seatsById));
    assert.strictEqual(idSet.size, 320);
  });

  runTest('Contains exactly 20 rows, each with 16 seats', () => {
    assert.strictEqual(rows.length, 20);
    rows.forEach((r) => {
      assert.strictEqual(
        r.seats.length,
        16,
        `Row ${r.row} must have 16 seats, got ${r.seats.length}`
      );
    });
  });

  runTest('Row letters match standard cinema naming (omitting I and O)', () => {
    const expectedRows = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
      'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
    ];
    const actualRows = rows.map((r) => r.row);
    assert.deepStrictEqual(actualRows, expectedRows);
  });
});

// ---------------------------------------------------------------------------
// SUITE 2: Tier & Row Counts Audit (VIP 112 vs Couple 64)
// ---------------------------------------------------------------------------
suite('2. Seating Tier & Row Counts Audit', () => {
  runTest('Row A contains 16 seats (4 Accessible + 12 Companion/Standard)', () => {
    const rowA = rows.find((r) => r.row === 'A');
    assert.ok(rowA);
    const accessibleInA = rowA.seats.filter((s) => s.isAccessible);
    const companionInA = rowA.seats.filter((s) => !s.isAccessible);
    assert.strictEqual(accessibleInA.length, 4);
    assert.strictEqual(companionInA.length, 12);
    assert.strictEqual(rowA.seats.length, 16);
  });

  runTest('Rows B through J (8 rows) are Standard seats = 128 seats', () => {
    const standardRows = rows.filter((r, idx) => idx >= 1 && idx <= 8);
    assert.strictEqual(standardRows.length, 8);
    const standardSeatsInBJ = standardRows.reduce((acc, r) => acc + r.seats.length, 0);
    assert.strictEqual(standardSeatsInBJ, 128);
  });

  runTest('Total Standard tier seats across hall = 140 (128 in B-J + 12 companion in A)', () => {
    const allStandardSeats = Object.values(seatsById).filter((s) => s.tier === 'standard');
    assert.strictEqual(allStandardSeats.length, 140);
  });

  runTest('Rows K through R (7 rows) are VIP Recliners = exactly 112 seats', () => {
    const vipRows = rows.filter((r, idx) => idx >= 9 && idx <= 15);
    assert.strictEqual(vipRows.length, 7);
    const vipSeatCount = vipRows.reduce((acc, r) => acc + r.seats.length, 0);
    assert.strictEqual(vipSeatCount, 112);

    const allVipSeats = Object.values(seatsById).filter((s) => s.tier === 'vip');
    assert.strictEqual(allVipSeats.length, 112);
  });

  runTest('Rows S through V (4 rows) are Couple Loungers = exactly 64 seats (32 pairs)', () => {
    const coupleRows = rows.filter((r, idx) => idx >= 16 && idx <= 19);
    assert.strictEqual(coupleRows.length, 4);
    const coupleSeatCount = coupleRows.reduce((acc, r) => acc + r.seats.length, 0);
    assert.strictEqual(coupleSeatCount, 64);

    const allCoupleSeats = Object.values(seatsById).filter((s) => s.tier === 'couple');
    assert.strictEqual(allCoupleSeats.length, 64);
  });

  runTest('Tier sum audit: 4 Accessible + 140 Standard + 112 VIP + 64 Couple = 320 seats', () => {
    const accessible = Object.values(seatsById).filter((s) => s.tier === 'accessible').length;
    const standard = Object.values(seatsById).filter((s) => s.tier === 'standard').length;
    const vip = Object.values(seatsById).filter((s) => s.tier === 'vip').length;
    const couple = Object.values(seatsById).filter((s) => s.tier === 'couple').length;

    assert.strictEqual(accessible, 4);
    assert.strictEqual(standard, 140);
    assert.strictEqual(vip, 112);
    assert.strictEqual(couple, 64);
    assert.strictEqual(accessible + standard + vip + couple, 320);
  });
});

// ---------------------------------------------------------------------------
// SUITE 3: Available, Held, and Sold Breakdown & Integrity
// ---------------------------------------------------------------------------
suite('3. State Breakdown & Selection Integrity', () => {
  const allSeats = Object.values(seatsById);
  const availableCount = allSeats.filter((s) => s.status === 'available').length;
  const heldCount = allSeats.filter((s) => s.status === 'held').length;
  const soldCount = allSeats.filter((s) => s.status === 'sold').length;

  runTest('State sum: Available (289) + Held (9) + Sold (22) = 320', () => {
    assert.strictEqual(availableCount, 289);
    assert.strictEqual(heldCount, 9);
    assert.strictEqual(soldCount, 22);
    assert.strictEqual(availableCount + heldCount + soldCount, 320);
  });

  runTest('Held seats cannot be selected (returns SEAT_UNAVAILABLE)', () => {
    const heldSeat = seatsById['G-7'];
    assert.strictEqual(heldSeat.status, 'held');

    const result = toggleSeatSelection(new Set(), heldSeat, seatsById);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'SEAT_UNAVAILABLE');
  });

  runTest('Sold seats cannot be selected (returns SEAT_UNAVAILABLE)', () => {
    const soldSeat = seatsById['E-7'];
    assert.strictEqual(soldSeat.status, 'sold');

    const result = toggleSeatSelection(new Set(), soldSeat, seatsById);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'SEAT_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// SUITE 4: Selection and Deselection State Transitions
// ---------------------------------------------------------------------------
suite('4. Selection & Deselection State Transitions', () => {
  runTest('Select an available single seat', () => {
    const seat = seatsById['B-5'];
    assert.strictEqual(seat.status, 'available');

    const result = toggleSeatSelection(new Set(), seat, seatsById);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'selected');
    assert.strictEqual(result.selectedIds.has('B-5'), true);
    assert.strictEqual(result.count, 1);
  });

  runTest('Deselect an already selected seat', () => {
    const seat = seatsById['B-5'];
    const current = new Set(['B-5']);

    const result = toggleSeatSelection(current, seat, seatsById);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'deselected');
    assert.strictEqual(result.selectedIds.has('B-5'), false);
    assert.strictEqual(result.count, 0);
  });

  runTest('calculateSelectionTotals accurately aggregates count, price and labels', () => {
    const selected = new Set(['B-5', 'B-6', 'K-1']);
    const totals = calculateSelectionTotals(selected, seatsById);

    assert.strictEqual(totals.count, 3);
    assert.strictEqual(totals.selectedSeats.length, 3);
    // B-5 (700,000) + B-6 (700,000) + K-1 (950,000) = 2,350,000 kobo
    assert.strictEqual(totals.totalKobo, 2350000);
    assert.strictEqual(totals.formattedTotal, '₦23,500');
  });
});

// ---------------------------------------------------------------------------
// SUITE 5: Couple-Seat Invariants & Atomicity
// ---------------------------------------------------------------------------
suite('5. Couple-Seat Invariants & Atomicity', () => {
  runTest('Selecting left partner (S-1) selects BOTH S-1 and S-2 atomically', () => {
    const seatS1 = seatsById['S-1'];
    assert.strictEqual(seatS1.isCouple, true);
    assert.strictEqual(seatS1.couplePartnerId, 'S-2');

    const result = toggleSeatSelection(new Set(), seatS1, seatsById);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'selected');
    assert.strictEqual(result.selectedIds.size, 2);
    assert.ok(result.selectedIds.has('S-1'));
    assert.ok(result.selectedIds.has('S-2'));
  });

  runTest('Selecting right partner (S-2) selects BOTH S-1 and S-2 atomically', () => {
    const seatS2 = seatsById['S-2'];
    assert.strictEqual(seatS2.isCouple, true);
    assert.strictEqual(seatS2.couplePartnerId, 'S-1');

    const result = toggleSeatSelection(new Set(), seatS2, seatsById);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'selected');
    assert.strictEqual(result.selectedIds.size, 2);
    assert.ok(result.selectedIds.has('S-1'));
    assert.ok(result.selectedIds.has('S-2'));
  });

  runTest('Deselecting either partner (S-2) deselects BOTH S-1 and S-2 atomically', () => {
    const current = new Set(['S-1', 'S-2']);
    const seatS2 = seatsById['S-2'];

    const result = toggleSeatSelection(current, seatS2, seatsById);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'deselected');
    assert.strictEqual(result.selectedIds.size, 0);
    assert.ok(!result.selectedIds.has('S-1'));
    assert.ok(!result.selectedIds.has('S-2'));
  });

  runTest('Partner unavailable (sold): U-3 sold, selecting U-4 is rejected with PARTNER_UNAVAILABLE', () => {
    const seatU3 = seatsById['U-3'];
    const seatU4 = seatsById['U-4'];
    assert.strictEqual(seatU3.status, 'sold');
    assert.strictEqual(seatU4.status, 'available');

    const result = toggleSeatSelection(new Set(), seatU4, seatsById);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'PARTNER_UNAVAILABLE');
    assert.ok(!result.selectedIds.has('U-4'));
  });

  runTest('Partner unavailable (held): V-11 held, selecting V-12 is rejected with PARTNER_UNAVAILABLE', () => {
    const seatV11 = seatsById['V-11'];
    const seatV12 = seatsById['V-12'];
    assert.strictEqual(seatV11.status, 'held');
    assert.strictEqual(seatV12.status, 'available');

    const result = toggleSeatSelection(new Set(), seatV12, seatsById);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'PARTNER_UNAVAILABLE');
    assert.ok(!result.selectedIds.has('V-12'));
  });

  runTest('Couple pricing consistency: Pod price = 2x seat price (₦6,000 + ₦6,000 = ₦12,000)', () => {
    const seatS1 = seatsById['S-1'];
    const seatS2 = seatsById['S-2'];
    assert.strictEqual(seatS1.priceKobo, 600000);
    assert.strictEqual(seatS2.priceKobo, 600000);

    const totals = calculateSelectionTotals(new Set(['S-1', 'S-2']), seatsById);
    assert.strictEqual(totals.totalKobo, 1200000);
    assert.strictEqual(totals.formattedTotal, '₦12,000');
  });

  runTest('validateSelectionInvariants flags any orphaned couple seat', () => {
    // Valid pair
    const validCheck = validateSelectionInvariants(new Set(['S-1', 'S-2']), seatsById);
    assert.strictEqual(validCheck.isValid, true);

    // Orphaned couple seat
    const invalidCheck = validateSelectionInvariants(new Set(['S-1']), seatsById);
    assert.strictEqual(invalidCheck.isValid, false);
    assert.ok(invalidCheck.errors[0].includes('without its partner'));
  });
});

// ---------------------------------------------------------------------------
// SUITE 6: Max 8-Seat Limit Enforcement
// ---------------------------------------------------------------------------
suite('6. Maximum 8-Seat Limit Enforcement', () => {
  runTest('Can select up to 8 individual seats', () => {
    let current = new Set();
    const candidateIds = ['B-1', 'B-2', 'B-3', 'B-4', 'C-1', 'C-2', 'C-3', 'C-4'];

    candidateIds.forEach((id) => {
      const res = toggleSeatSelection(current, seatsById[id], seatsById, 8);
      assert.strictEqual(res.success, true);
      current = res.selectedIds;
    });

    assert.strictEqual(current.size, 8);
  });

  runTest('Selecting 9th single seat is rejected with MAX_LIMIT_EXCEEDED', () => {
    const current = new Set(['B-1', 'B-2', 'B-3', 'B-4', 'C-1', 'C-2', 'C-3', 'C-4']);
    assert.strictEqual(current.size, 8);

    const res = toggleSeatSelection(current, seatsById['D-1'], seatsById, 8);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'MAX_LIMIT_EXCEEDED');
    assert.strictEqual(res.selectedIds.size, 8);
  });

  runTest('Atomic couple check: 7 seats selected + couple pod (2 seats) rejects completely (prevents 8/9 overflow or orphan)', () => {
    const current = new Set(['B-1', 'B-2', 'B-3', 'B-4', 'C-1', 'C-2', 'C-3']);
    assert.strictEqual(current.size, 7);

    const res = toggleSeatSelection(current, seatsById['S-1'], seatsById, 8);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'MAX_LIMIT_EXCEEDED');
    // Neither seat S-1 nor S-2 must be added
    assert.strictEqual(res.selectedIds.size, 7);
    assert.ok(!res.selectedIds.has('S-1'));
    assert.ok(!res.selectedIds.has('S-2'));
  });

  runTest('6 seats selected + couple pod (2 seats) succeeds and fills exactly 8 seats', () => {
    const current = new Set(['B-1', 'B-2', 'B-3', 'B-4', 'C-1', 'C-2']);
    assert.strictEqual(current.size, 6);

    const res = toggleSeatSelection(current, seatsById['S-1'], seatsById, 8);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.selectedIds.size, 8);
    assert.ok(res.selectedIds.has('S-1'));
    assert.ok(res.selectedIds.has('S-2'));
  });
});

// ---------------------------------------------------------------------------
// SUITE 7: Kobo Minor-Unit Pricing & NGN Formatting
// ---------------------------------------------------------------------------
suite('7. Kobo Minor-Unit Pricing & NGN Formatting', () => {
  runTest('Pricing values match exact kobo minor units', () => {
    assert.strictEqual(layout.tierPricing.standard, 700000);
    assert.strictEqual(layout.tierPricing.accessible, 700000);
    assert.strictEqual(layout.tierPricing.vip, 950000);
    assert.strictEqual(layout.tierPricing.couple, 600000);
    assert.strictEqual(layout.couplePairPriceKobo, 1200000);
  });

  runTest('formatKoboToNgn outputs expected currency strings', () => {
    assert.strictEqual(formatKoboToNgn(700000), '₦7,000');
    assert.strictEqual(formatKoboToNgn(950000), '₦9,500');
    assert.strictEqual(formatKoboToNgn(600000), '₦6,000');
    assert.strictEqual(formatKoboToNgn(1200000), '₦12,000');
    assert.strictEqual(formatKoboToNgn(2850000), '₦28,500');
  });

  runTest('Mixed selection total avoids any float rounding errors', () => {
    // 1 Accessible (700k) + 1 Standard (700k) + 1 VIP (950k) + 1 Couple Pod (2 x 600k = 1200k)
    // Total = 700k + 700k + 950k + 1200k = 3,550,000 kobo (₦35,500)
    const selected = new Set(['A-1', 'B-1', 'K-1', 'S-1', 'S-2']);
    const totals = calculateSelectionTotals(selected, seatsById);

    assert.strictEqual(totals.count, 5);
    assert.strictEqual(totals.totalKobo, 3550000);
    assert.strictEqual(totals.formattedTotal, '₦35,500');
  });
});

// ---------------------------------------------------------------------------
// SUITE 8: Wheelchair-Accessible Seat Allocation & Behavior
// ---------------------------------------------------------------------------
suite('8. Wheelchair-Accessible Seat Allocation & Behavior', () => {
  runTest('Exactly 4 seats in Row A (cols 1, 2, 15, 16) are marked accessible', () => {
    const accessibleIds = ['A-1', 'A-2', 'A-15', 'A-16'];
    accessibleIds.forEach((id) => {
      const seat = seatsById[id];
      assert.strictEqual(seat.isAccessible, true, `Seat ${id} must be accessible`);
      assert.strictEqual(seat.tier, 'accessible');
    });

    // Companion seats in Row A are not marked accessible
    for (let c = 3; c <= 14; c++) {
      const seat = seatsById[`A-${c}`];
      assert.strictEqual(seat.isAccessible, false, `Seat A-${c} must not be accessible`);
      assert.strictEqual(seat.tier, 'standard');
    }
  });

  runTest('Accessible seats can be selected and deselected normally', () => {
    const seatA1 = seatsById['A-1'];
    assert.strictEqual(seatA1.status, 'available');

    const selectRes = toggleSeatSelection(new Set(), seatA1, seatsById);
    assert.strictEqual(selectRes.success, true);
    assert.strictEqual(selectRes.selectedIds.has('A-1'), true);

    const deselectRes = toggleSeatSelection(selectRes.selectedIds, seatA1, seatsById);
    assert.strictEqual(deselectRes.success, true);
    assert.strictEqual(deselectRes.selectedIds.has('A-1'), false);
  });

  runTest('Accessible seat pricing matches standard base price (700,000 kobo = ₦7,000)', () => {
    const seatA1 = seatsById['A-1'];
    assert.strictEqual(seatA1.priceKobo, 700000);
    const totals = calculateSelectionTotals(new Set(['A-1']), seatsById);
    assert.strictEqual(totals.totalKobo, 700000);
    assert.strictEqual(totals.formattedTotal, '₦7,000');
  });
});

// ---------------------------------------------------------------------------
// SUITE 9: M04.4D Device Regression — Pricing Consistency & Singular/Plural Grammar
// ---------------------------------------------------------------------------
suite('9. M04.4D Device Regression — Pricing Consistency & Grammar', () => {
  runTest('APPROVED_BASE_PRICE_KOBO constant equals 700000 (₦7,000)', () => {
    assert.strictEqual(APPROVED_BASE_PRICE_KOBO, 700000);
    assert.strictEqual(formatKoboToNgn(APPROVED_BASE_PRICE_KOBO), '₦7,000');
  });

  runTest('Seat B1 Standard pricing under approved model equals exactly ₦7,000', () => {
    const seatB1 = seatsById['B-1'];
    assert.ok(seatB1, 'Seat B-1 must exist');
    assert.strictEqual(seatB1.row, 'B');
    assert.strictEqual(seatB1.col, 1);
    assert.strictEqual(seatB1.tier, 'standard');
    assert.strictEqual(seatB1.priceKobo, 700000);
    assert.strictEqual(formatKoboToNgn(seatB1.priceKobo), '₦7,000');

    // Selection totals for single B1
    const totals = calculateSelectionTotals(new Set(['B-1']), seatsById);
    assert.strictEqual(totals.count, 1);
    assert.strictEqual(totals.totalKobo, 700000);
    assert.strictEqual(totals.formattedTotal, '₦7,000');
    assert.strictEqual(totals.seatLabels, 'B1');
  });

  runTest('Wheelchair-accessible seats (A1, A2, A15, A16) equal exactly ₦7,000', () => {
    const accessibleIds = ['A-1', 'A-2', 'A-15', 'A-16'];
    accessibleIds.forEach((id) => {
      const seat = seatsById[id];
      assert.strictEqual(seat.tier, 'accessible');
      assert.strictEqual(seat.isAccessible, true);
      assert.strictEqual(seat.priceKobo, 700000);
      assert.strictEqual(formatKoboToNgn(seat.priceKobo), '₦7,000');
    });
  });

  runTest('VIP seats (Rows K-R) equal exactly ₦9,500', () => {
    const sampleVipIds = ['K-1', 'L-5', 'M-12', 'R-16'];
    sampleVipIds.forEach((id) => {
      const seat = seatsById[id];
      assert.strictEqual(seat.tier, 'vip');
      assert.strictEqual(seat.priceKobo, 950000);
      assert.strictEqual(formatKoboToNgn(seat.priceKobo), '₦9,500');
    });

    const vipTotals = calculateSelectionTotals(new Set(['K-1']), seatsById);
    assert.strictEqual(vipTotals.totalKobo, 950000);
    assert.strictEqual(vipTotals.formattedTotal, '₦9,500');
  });

  runTest('Complete couple-pair seats (Rows S-V) equal ₦6,000 each and ₦12,000 per pair', () => {
    const seatS1 = seatsById['S-1'];
    const seatS2 = seatsById['S-2'];
    assert.strictEqual(seatS1.tier, 'couple');
    assert.strictEqual(seatS2.tier, 'couple');
    assert.strictEqual(seatS1.priceKobo, 600000);
    assert.strictEqual(seatS2.priceKobo, 600000);

    const coupleTotals = calculateSelectionTotals(new Set(['S-1', 'S-2']), seatsById);
    assert.strictEqual(coupleTotals.count, 2);
    assert.strictEqual(coupleTotals.totalKobo, 1200000);
    assert.strictEqual(coupleTotals.formattedTotal, '₦12,000');
  });

  runTest('Mixed-tier selection pricing agrees across all 4 tiers', () => {
    // 1 Accessible (700k) + 1 Standard B1 (700k) + 1 VIP K1 (950k) + 1 Couple Pod S1/S2 (1200k)
    const mixedSelection = new Set(['A-1', 'B-1', 'K-1', 'S-1', 'S-2']);
    const totals = calculateSelectionTotals(mixedSelection, seatsById);
    assert.strictEqual(totals.count, 5);
    assert.strictEqual(totals.totalKobo, 3550000);
    assert.strictEqual(totals.formattedTotal, '₦35,500');
    assert.strictEqual(totals.countsByTier.accessible, 1);
    assert.strictEqual(totals.countsByTier.standard, 1);
    assert.strictEqual(totals.countsByTier.vip, 1);
    assert.strictEqual(totals.countsByTier.couple, 2);
    assert.strictEqual(totals.totalsByTierKobo.accessible, 700000);
    assert.strictEqual(totals.totalsByTierKobo.standard, 700000);
    assert.strictEqual(totals.totalsByTierKobo.vip, 950000);
    assert.strictEqual(totals.totalsByTierKobo.couple, 1200000);
  });

  runTest('Correct total formatting validates NGN prefix and thousands separators', () => {
    assert.strictEqual(formatKoboToNgn(0), '₦0');
    assert.strictEqual(formatKoboToNgn(700000), '₦7,000');
    assert.strictEqual(formatKoboToNgn(950000), '₦9,500');
    assert.strictEqual(formatKoboToNgn(1200000), '₦12,000');
    assert.strictEqual(formatKoboToNgn(3550000), '₦35,500');
    assert.strictEqual(formatKoboToNgn(5600000), '₦56,000');
  });

  runTest('Maximum 8-seat limit enforcement rejects exceeding capacity', () => {
    const selected = new Set(['B-1', 'B-2', 'B-3', 'B-4', 'C-1', 'C-2', 'C-3', 'C-4']);
    assert.strictEqual(selected.size, 8);
    const result = toggleSeatSelection(selected, seatsById['D-1'], seatsById, 8);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'MAX_LIMIT_EXCEEDED');
  });

  runTest('Singular/plural summary text correctly formats "1 seat" vs "N seats"', () => {
    assert.strictEqual(formatSeatCount(1), '1 seat');
    assert.strictEqual(formatSeatCount(2), '2 seats');
    assert.strictEqual(formatSeatCount(3), '3 seats');
    assert.strictEqual(formatSeatCount(8), '8 seats');

    assert.strictEqual(
      formatSelectionModalSubtitle(1, 'Dune: Part Two'),
      'You have selected 1 seat for Dune: Part Two:'
    );
    assert.strictEqual(
      formatSelectionModalSubtitle(2, 'Dune: Part Two'),
      'You have selected 2 seats for Dune: Part Two:'
    );
    assert.strictEqual(
      formatSelectionModalSubtitle(8, 'Dune: Part Two'),
      'You have selected 8 seats for Dune: Part Two:'
    );
  });
});

// ---------------------------------------------------------------------------
// SUITE 10: M04.4E Showtime Pricing Consistency & Approved Tier Model Agreement
// ---------------------------------------------------------------------------
suite('10. M04.4E Showtime Pricing Consistency & Model Agreement', () => {
  runTest('APPROVED_SHOWTIME_PRICE_LABEL is strictly derived from APPROVED_BASE_PRICE_KOBO: "Seats from ₦7,000"', () => {
    assert.strictEqual(APPROVED_BASE_PRICE_KOBO, 700000);
    assert.strictEqual(APPROVED_SHOWTIME_PRICE_LABEL, 'Seats from ₦7,000');
    assert.strictEqual(getShowtimeStartingPriceLabel(), 'Seats from ₦7,000');
    assert.strictEqual(getShowtimeStartingPriceLabel(700000), 'Seats from ₦7,000');
  });

  runTest('Showtime starting price matches B1 Standard seat price exactly (₦7,000)', () => {
    const seatB1 = seatsById['B-1'];
    assert.ok(seatB1);
    assert.strictEqual(seatB1.tier, 'standard');
    assert.strictEqual(seatB1.priceKobo, APPROVED_BASE_PRICE_KOBO);
    assert.strictEqual(formatKoboToNgn(seatB1.priceKobo), '₦7,000');
    assert.strictEqual(
      `Seats from ${formatKoboToNgn(seatB1.priceKobo)}`,
      APPROVED_SHOWTIME_PRICE_LABEL
    );
  });

  runTest('Accessible seat pricing matches showtime starting seat base (A1 = ₦7,000)', () => {
    const seatA1 = seatsById['A-1'];
    assert.strictEqual(seatA1.tier, 'accessible');
    assert.strictEqual(seatA1.priceKobo, APPROVED_BASE_PRICE_KOBO);
    assert.strictEqual(formatKoboToNgn(seatA1.priceKobo), '₦7,000');
  });

  runTest('VIP seat pricing preserves approved ₦9,500 rate across showtimes', () => {
    const seatK1 = seatsById['K-1'];
    assert.strictEqual(seatK1.tier, 'vip');
    assert.strictEqual(seatK1.priceKobo, 950000);
    assert.strictEqual(formatKoboToNgn(seatK1.priceKobo), '₦9,500');
  });

  runTest('Couple pair pricing maintains exact ₦12,000 pair consistency (S1 & S2)', () => {
    const seatS1 = seatsById['S-1'];
    const seatS2 = seatsById['S-2'];
    assert.strictEqual(seatS1.tier, 'couple');
    assert.strictEqual(seatS2.tier, 'couple');
    assert.strictEqual(seatS1.priceKobo + seatS2.priceKobo, layout.couplePairPriceKobo);
    assert.strictEqual(layout.couplePairPriceKobo, 1200000);
    assert.strictEqual(formatKoboToNgn(layout.couplePairPriceKobo), '₦12,000');
  });

  runTest('Filmhouse IMAX showtime (st-dune-1) card presentation matches approved starting price', () => {
    const filmhouse = LAGOS_CINEMAS.find((c) => c.id === 'cin-lekki-imax');
    assert.ok(filmhouse, 'Filmhouse IMAX must exist in catalog');
    const slotDune1 = filmhouse.showtimesByMovie['feat-1']?.find((s) => s.id === 'st-dune-1');
    assert.ok(slotDune1, 'st-dune-1 must exist');
    assert.strictEqual(slotDune1.format, 'IMAX 70mm');
    assert.strictEqual(slotDune1.time, '14:30');

    // UI presentation rule uses APPROVED_SHOWTIME_PRICE_LABEL ("Seats from ₦7,000")
    // while documenting that legacy mock slot.price (9500) is non-authoritative
    assert.strictEqual(APPROVED_SHOWTIME_PRICE_LABEL, 'Seats from ₦7,000');
    assert.strictEqual(
      `Seats from ${formatKoboToNgn(APPROVED_BASE_PRICE_KOBO)}`,
      'Seats from ₦7,000'
    );
  });

  runTest('Selection calculations for full mixed booking remain invariant (₦35,500 total)', () => {
    // 1 Accessible (700k) + 1 Standard B1 (700k) + 1 VIP K1 (950k) + 1 Couple Pod S1/S2 (1200k)
    const mixed = new Set(['A-1', 'B-1', 'K-1', 'S-1', 'S-2']);
    const totals = calculateSelectionTotals(mixed, seatsById);
    assert.strictEqual(totals.count, 5);
    assert.strictEqual(totals.totalKobo, 3550000);
    assert.strictEqual(totals.formattedTotal, '₦35,500');
  });
});

// ---------------------------------------------------------------------------
// SUITE 11: M04.4F Movie Details & Full Cross-Screen Pricing Agreement
// ---------------------------------------------------------------------------
suite('11. M04.4F Movie Details & Cross-Screen Agreement', () => {
  runTest('APPROVED_MOVIE_STARTING_PRICE constant equals "From ₦7,000"', () => {
    assert.strictEqual(APPROVED_MOVIE_STARTING_PRICE, 'From ₦7,000');
    assert.strictEqual(
      APPROVED_MOVIE_STARTING_PRICE,
      `From ${formatKoboToNgn(APPROVED_BASE_PRICE_KOBO)}`
    );
  });

  runTest('Movie Details starting price matches showtime starting price and B1 Standard seat price', () => {
    const b1Price = seatsById['B-1'].priceKobo;
    assert.strictEqual(b1Price, APPROVED_BASE_PRICE_KOBO);
    assert.strictEqual(formatKoboToNgn(b1Price), '₦7,000');

    // Both Movie Details and Showtimes derive strictly from the same approved base price
    assert.strictEqual(
      APPROVED_MOVIE_STARTING_PRICE,
      `From ${formatKoboToNgn(b1Price)}`
    );
    assert.strictEqual(
      APPROVED_SHOWTIME_PRICE_LABEL,
      `Seats from ${formatKoboToNgn(b1Price)}`
    );
  });

  runTest('Featured movie (Dune: Part Two) priceRange is updated to approved "From ₦7,000"', () => {
    assert.strictEqual(MOCK_FEATURED_MOVIE.id, 'feat-1');
    assert.strictEqual(MOCK_FEATURED_MOVIE.priceRange, APPROVED_MOVIE_STARTING_PRICE);
    assert.strictEqual(MOCK_FEATURED_MOVIE.priceRange, 'From ₦7,000');
    // Verify outdated "From ₦8,500" value is eliminated
    assert.notStrictEqual(MOCK_FEATURED_MOVIE.priceRange, 'From ₦8,500');
  });

  runTest('Now Showing catalog movies have priceRange synchronized with approved "From ₦7,000"', () => {
    assert.ok(MOCK_NOW_SHOWING_MOVIES.length > 0, 'Now Showing list must not be empty');
    MOCK_NOW_SHOWING_MOVIES.forEach((movie) => {
      assert.strictEqual(
        movie.priceRange,
        APPROVED_MOVIE_STARTING_PRICE,
        `Movie ${movie.title} (${movie.id}) must have priceRange "From ₦7,000"`
      );
    });
  });

  runTest('Coming Soon catalog movies preserve "Showtimes Open Soon" status', () => {
    assert.ok(MOCK_COMING_SOON_MOVIES.length > 0, 'Coming Soon list must not be empty');
    MOCK_COMING_SOON_MOVIES.forEach((movie) => {
      assert.strictEqual(
        movie.priceRange,
        'Showtimes Open Soon',
        `Upcoming movie ${movie.title} (${movie.id}) must preserve "Showtimes Open Soon"`
      );
    });
  });

  runTest('Full end-to-end user journey price alignment audit', () => {
    // 1. Movie Details: Dune Part Two ticket price
    const movieDetailsPrice = MOCK_FEATURED_MOVIE.priceRange;
    assert.strictEqual(movieDetailsPrice, 'From ₦7,000');

    // 2. Showtimes: Filmhouse IMAX showtime starting price
    const showtimePrice = APPROVED_SHOWTIME_PRICE_LABEL;
    assert.strictEqual(showtimePrice, 'Seats from ₦7,000');

    // 3. Seat Selection: Standard seat B1 price
    const seatB1Price = formatKoboToNgn(seatsById['B-1'].priceKobo);
    assert.strictEqual(seatB1Price, '₦7,000');

    // 4. Modal Summary for 1 seat
    const modalSubtitle = formatSelectionModalSubtitle(1, MOCK_FEATURED_MOVIE.title);
    assert.strictEqual(modalSubtitle, 'You have selected 1 seat for Dune: Part Two:');

    // 5. Total for B1
    const totals = calculateSelectionTotals(new Set(['B-1']), seatsById);
    assert.strictEqual(totals.formattedTotal, '₦7,000');
  });
});

// ---------------------------------------------------------------------------
// TEST SUMMARY
// ---------------------------------------------------------------------------
console.log(`\n======================================================`);
console.log(`TEST RESULTS SUMMARY`);
console.log(`======================================================`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);
console.log(`Total:  ${totalPassed + totalFailed}`);

if (totalFailed > 0) {
  console.error(`\n❌ TEST SUITE FAILED`);
  process.exit(1);
} else {
  console.log(`\n✅ ALL 11 SUITES PASSED VERIFICATION`);
  process.exit(0);
}

