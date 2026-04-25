/*
  vypocet-selftest.js — RB TAXI Výčetka v3.6.45
  Spuštění: node vypocet-selftest.js
*/

const assert = require("assert/strict");
const { computeMetrics } = require("./calc.js");

const base = {
  driver: "Test", shift: "den", rz: "1BU0299",
  kmStart: 1000, kmEnd: 1100, trzba: 0, pristavne: 0,
  palivo: 0, myti: 0, kartou: 0, fakturou: 0, jine: 0,
  cashActual: 0, hasCashActual: false, iacCount: 0, shkmCount: 0,
};

function run(name, overrides, expected, config) {
  const actual = computeMetrics({ ...base, ...overrides }, config);
  for (const [k, v] of Object.entries(expected))
    assert.equal(actual[k], v, `${name}: ${k} (očekáváno ${v}, dostáno ${actual[k]})`);
  console.log("  \u2713 " + name);
}

console.log("RB TAXI \u2014 v\u00fdpo\u010detn\u00ed self-testy v3.6.45\n");

console.log("V\u00fdplata:");
run("pln\u00e1 sm\u011bna \u2014 fix",    { trzba: 3000 }, { usesPercentage: false, vyplata: 1000, kOdevzdani: 2000, settlement: 2000 });
run("pln\u00e1 sm\u011bna \u2014 provize", { trzba: 4000 }, { usesPercentage: true,  vyplata: 1200, kOdevzdani: 2800, settlement: 2800 });
run("p\u016fl sm\u011bna \u2014 fix",      { shift: "pul", trzba: 1200 }, { usesPercentage: false, vyplata: 500, kOdevzdani: 700 });

console.log("\nMinimum:");
run("doplatek do minima", { trzba: 1000 }, { minTrzba: 1500, doplatek: 500, kOdevzdani: 0, settlement: 500 });
run("smluvn\u00ed km sni\u017euje minimum", { trzba: 1000, iacCount: 2, shkmCount: 1 }, { invoiceKm: 73, chargedKm: 27, minTrzba: 405, doplatek: 0 });

console.log("\nP\u0159\u00edstavn\u00e9:");
run("p\u0159\u00edstavn\u00e9 sni\u017euje jen provizn\u00ed z\u00e1klad", { trzba: 4000, pristavne: 1000 }, { netto: 3000, usesPercentage: false, vyplata: 1000, kOdevzdani: 3000, settlement: 3000 });

console.log("\nKonfigurace:");
run("nulov\u00fd fix", { trzba: 2000 }, { usesPercentage: true, vyplata: 600, kOdevzdani: 1400 }, { commRate: 30, baseFull: 0, baseHalf: 0 });

console.log("\nHotovost:");
run("hotovost sed\u00ed", { trzba: 3000, cashActual: 3000, hasCashActual: true }, { cashExpected: 3000, cashDiff: 0 });
run("d\u00fd\u0161ko",   { trzba: 3000, cashActual: 3150, hasCashActual: true }, { cashDiff:  150 });
run("chyb\u00ed hotovost", { trzba: 3000, cashActual: 2850, hasCashActual: true }, { cashDiff: -150 });
run("hotovost s n\u00e1klady", { trzba: 5000, kartou: 1000, fakturou: 500, palivo: 700, myti: 100, jine: 200, cashActual: 2500, hasCashActual: true }, { vyplata: 1500, kOdevzdani: 1000, cashExpected: 2500, cashDiff: 0 });

console.log("\nKm logika:");
run("kmEnd < kmStart \u2192 kmReal = 0", { kmStart: 1100, kmEnd: 1000, trzba: 2000 }, { kmReal: 0, minTrzba: 0, doplatek: 0 });
run("z\u00e1porn\u00e9 netto \u2192 vyplata = 0", { trzba: 500, pristavne: 800 }, { netto: -300, vyplata: 0 });

console.log("\nV\u0161echny testy pro\u0161ly. \u2713");
