/*
  calc.js — RB TAXI Výčetka v3.6.45
  Čistá výpočetní logika bez závislosti na DOM nebo localStorage.
  Lze importovat v prohlížeči i spouštět v Node.js (self-testy).
*/

const CALC_VERSION = "3.6.45";

const CONSTANTS = {
  minTrzbaPerKm: 15,
  iacKmPerRide: 33,
  shkmKmPerRide: 7,
};

const DEFAULT_CONFIG = {
  commRate: 30,
  baseFull: 1000,
  baseHalf: 500,
};

function roundMoney(value) {
  return Math.round(Number(value) || 0);
}

function getShiftLabel(value) {
  const labels = {
    den: "Denní",
    noc: "Noční",
    odpo: "Odpolední",
    pul: "1/2 směna",
  };
  return labels[value] || value || "—";
}

/**
 * Výpočet výčetky řidiče.
 * @param {object} values  - hodnoty z formuláře
 * @param {object} config  - { commRate, baseFull, baseHalf }
 * @returns {object}       - kompletní metriky pro rendering i export
 */
function computeMetrics(values, config) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, config);
  const kmReal = Math.max(0, values.kmEnd - values.kmStart);
  const iacKm = (values.iacCount || 0) * CONSTANTS.iacKmPerRide;
  const shkmKm = (values.shkmCount || 0) * CONSTANTS.shkmKmPerRide;
  const invoiceKm = iacKm + shkmKm;
  const chargedKm = Math.max(0, kmReal - invoiceKm);
  const minTrzba = chargedKm * CONSTANTS.minTrzbaPerKm;
  const netto = (values.trzba || 0) - (values.pristavne || 0);
  const nonCash = (values.kartou || 0) + (values.fakturou || 0);
  const costs = (values.palivo || 0) + (values.myti || 0) + (values.jine || 0);
  const isHalf = values.shift === "pul";
  const commissionRate = cfg.commRate / 100;
  const fixedPayout = isHalf ? cfg.baseHalf : cfg.baseFull;
  const threshold = commissionRate > 0 ? fixedPayout / commissionRate : Number.POSITIVE_INFINITY;
  const usesPercentage = netto > threshold;
  const vyplata = netto > 0 ? roundMoney(usesPercentage ? netto * commissionRate : fixedPayout) : 0;
  const doplatek = Math.max(0, minTrzba - (values.trzba || 0));
  const delta = (values.trzba || 0) - minTrzba;
  const kOdevzdani =
    (values.trzba || 0) -
    (values.palivo || 0) -
    (values.myti || 0) -
    (values.kartou || 0) -
    (values.fakturou || 0) -
    (values.jine || 0) -
    vyplata;
  const settlement = kOdevzdani + doplatek;
  const cashExpected = settlement + vyplata;
  const cashDiff = values.hasCashActual ? (values.cashActual || 0) - cashExpected : 0;

  return {
    ...values,
    config: cfg,
    shiftLabel: getShiftLabel(values.shift),
    kmReal,
    chargedKm,
    invoiceKm,
    iacKm,
    shkmKm,
    minTrzba,
    netto,
    nonCash,
    costs,
    usesPercentage,
    payoutMode: usesPercentage ? `Provize ${cfg.commRate} %` : `Fix ${roundMoney(fixedPayout)} Kč`,
    vyplata,
    doplatek,
    delta,
    kOdevzdani,
    settlement,
    cashExpected,
    cashDiff,
    nedoplatek: doplatek > 0,
  };
}

// Node.js / CommonJS export pro self-testy
if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeMetrics, CONSTANTS, DEFAULT_CONFIG, roundMoney, getShiftLabel, CALC_VERSION };
}

// Browser global (pro přístup z app.js bez bundleru)
if (typeof window !== "undefined") {
  window.RBCalc = { computeMetrics, CONSTANTS, DEFAULT_CONFIG, roundMoney, getShiftLabel, CALC_VERSION };
}
