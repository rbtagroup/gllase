/*
  app.js — RB TAXI Výčetka v3.6.45
  Vylepšení oproti 3.6.44:
  - computeMetrics přesunuto do calc.js (sdíleno s Node.js self-testem)
  - Validace kmEnd < kmStart (P1 bug fix)
  - Správa RZ vozidel v nastavení místo hard-coded HTML
  - localStorage obaleno try/catch (ochrana před iOS incognito pádem)
  - Varování při záporném netto (přístavné > tržba)
  - Datum a jméno řidiče v názvech exportovaných souborů
*/
document.addEventListener("DOMContentLoaded", () => {
  const VERSION = "3.6.45-obsidian-glass";
  const CACHE_PREFIX = "rb-taxi-vycetka-";
  const CONFIG_KEYS = {
    commRate: "rb_commRate",
    baseFull: "rb_baseFull",
    baseHalf: "rb_baseHalf",
    theme: "rbTheme",
    rzList: "rb_rzList",
  };

  const DEFAULTS = {
    commRate: 30,
    baseFull: 1000,
    baseHalf: 500,
    theme: "dark",
  };

  // --- Výpočetní logika je v calc.js (sdílena se self-testem) ---
  const CONSTANTS = window.RBCalc.CONSTANTS;

  // --- Pomocné funkce pro RZ ---
  const DEFAULT_RZ = ["1BU0299", "1BU0060", "2BT6881", "2BT1565", "2BY5398", "2BL8995", "3BD6003"];

  function getRzList() {
    try {
      const stored = localStorage.getItem(CONFIG_KEYS.rzList);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fall through */ }
    return DEFAULT_RZ;
  }

  function saveRzList(list) {
    try {
      localStorage.setItem(CONFIG_KEYS.rzList, JSON.stringify(list));
    } catch { /* storage not available */ }
  }

  function rebuildRzSelect(selectedValue) {
    const select = document.getElementById("rz");
    if (!select) return;
    const list = getRzList();
    const current = selectedValue !== undefined ? selectedValue : select.value;
    select.innerHTML = '<option value="">— vyberte RZ —</option>';
    list.forEach((rz) => {
      const opt = document.createElement("option");
      opt.value = rz;
      opt.textContent = rz;
      if (rz === current) opt.selected = true;
      select.appendChild(opt);
    });
  }

  const formatCurrency = new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const formatInt = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const el = {
    form: document.getElementById("calcForm"),
    calcShell: document.getElementById("calcShell"),
    output: document.getElementById("output"),
    actions: document.getElementById("actions"),
    resetBtn: document.getElementById("resetBtn"),
    pdfBtn: document.getElementById("pdfExport"),
    shareImgBtn: document.getElementById("shareImgBtn"),
    editShiftBtn: document.getElementById("editShiftBtn"),
    newShiftBtn: document.getElementById("newShiftBtn"),
    themeToggle: document.getElementById("themeToggle"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsModal: document.getElementById("settingsModal"),
    pwaBanner: document.getElementById("pwaBanner"),
    installPwaBtn: document.getElementById("installPwaBtn"),
    appNotice: document.getElementById("appNotice"),
    appNoticeText: document.getElementById("appNoticeText"),
    appNoticeAction: document.getElementById("appNoticeAction"),
    appVersion: document.getElementById("appVersion"),
    kmReal: document.getElementById("kmReal"),
    headerStatus: document.getElementById("headerStatus"),
    headerStatusText: document.getElementById("headerStatusText"),
    networkStatus: document.getElementById("networkStatus"),
    installText: document.getElementById("installText"),
    pwaIosHelp: document.getElementById("pwaIosHelp"),
    liveUctovane: document.getElementById("liveUctovane"),
    liveSmluvni: document.getElementById("liveSmluvni"),
    liveNetto: document.getElementById("liveNetto"),
    kpiStrip: document.getElementById("kpiStrip"),
    liveDeltaCard: document.getElementById("liveDeltaCard"),
    liveDelta: document.getElementById("liveDelta"),
    liveStatus: document.getElementById("liveStatus"),
    heroComm: document.getElementById("heroComm"),
    heroFull: document.getElementById("heroFull"),
    heroHalf: document.getElementById("heroHalf"),
    heroStatusText: document.getElementById("heroStatusText"),
    commandStatusCard: document.getElementById("commandStatusCard"),
    liveShiftBadge: document.getElementById("liveShiftBadge"),
    livePayoutMode: document.getElementById("livePayoutMode"),
    liveGross: document.getElementById("liveGross"),
    liveNonCash: document.getElementById("liveNonCash"),
    liveCosts: document.getElementById("liveCosts"),
    liveDesk: document.getElementById("liveDesk"),
    liveSettlement: document.getElementById("liveCelkem"),
    cashCheckStatus: document.getElementById("cashCheckStatus"),
    cashCheckBreakdown: document.getElementById("cashCheckBreakdown"),
    cashExpected: document.getElementById("cashExpected"),
    cashActualLive: document.getElementById("cashActualLive"),
    cashDiffLive: document.getElementById("cashDiffLive"),
    setComm: document.getElementById("setComm"),
    setFull: document.getElementById("setFull"),
    setHalf: document.getElementById("setHalf"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    closeSettingsBtn: document.getElementById("closeSettingsBtn"),
    exportSelfTestBtn: document.getElementById("exportSelfTestBtn"),
    resetAppBtn: document.getElementById("resetAppBtn"),
  };

  const FIELD_IDS = [
    "driverName", "shiftType", "rz", "kmStart", "kmEnd", "trzba", "pristavne",
    "palivo", "myti", "kartou", "fakturou", "jine", "cashActual", "iacCount", "shkmCount",
  ];

  const DRAFT_KEY = "rb_shiftDraft";

  const FRIENDLY_NAMES = {
    pristavne: "Přístavné",
    palivo: "Palivo",
    myti: "Mytí",
    kartou: "Kartou",
    fakturou: "Fakturou",
    jine: "Jiné",
    cashActual: "Celá hotovost u sebe",
    iacCount: "IAC",
    shkmCount: "SHKM",
  };

  let deferredPrompt = null;
  let lastRenderedData = null;
  let isCalculated = false;
  let reportIsStale = false;
  let lastFocusedBeforeSettings = null;
  const libraryLoaders = {};

  function getText(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function getNumber(id) {
    const value = Number.parseFloat(getText(id).replace(",", "."));
    return Number.isFinite(value) ? value : 0;
  }

  function formatMoney(value) {
    return formatCurrency.format(Number(value) || 0);
  }

  function formatNumber(value) {
    return formatInt.format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function roundMoney(value) {
    return Math.round(Number(value) || 0);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function canvasToBlob(canvas, type = "image/png", quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Nepodařilo se vytvořit obrázek výčetky."));
      }, type, quality);
    });
  }


  function hapticFeedback(pattern = 12) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    try {
      return navigator.vibrate(pattern);
    } catch {
      return false;
    }
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      anchor.remove();
    }, 1000);
  }

  function showNotice(message, tone = "neutral", action = null) {
    if (!el.appNotice) return;
    if (el.appNoticeText) {
      el.appNoticeText.textContent = message;
    } else {
      el.appNotice.textContent = message;
    }
    el.appNotice.classList.remove("hidden", "is-good", "is-bad");
    if (tone === "good") el.appNotice.classList.add("is-good");
    if (tone === "bad") el.appNotice.classList.add("is-bad");

    if (el.appNoticeAction) {
      el.appNoticeAction.classList.toggle("hidden", !action);
      el.appNoticeAction.textContent = action?.label || "";
      el.appNoticeAction.onclick = action?.onClick || null;
    }
  }

  function clearNotice() {
    el.appNotice?.classList.add("hidden");
    if (el.appNoticeAction) el.appNoticeAction.onclick = null;
  }

  function loadScriptOnce(globalName, localSrc, fallbackSrc) {
    if (window[globalName]) return Promise.resolve();
    if (libraryLoaders[globalName]) return libraryLoaders[globalName];

    const loadFrom = (src) => new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-dynamic-lib="${globalName}"][src="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.dynamicLib = globalName;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Nepodařilo se načíst ${src}`));
      document.head.appendChild(script);
    });

    const localUrl = new URL(localSrc, document.baseURI).href;
    libraryLoaders[globalName] = loadFrom(localUrl)
      .catch(() => (fallbackSrc ? loadFrom(fallbackSrc) : Promise.reject()))
      .then(() => {
        if (!window[globalName]) throw new Error(`Knihovna ${globalName} se načetla, ale není dostupná.`);
      });

    return libraryLoaders[globalName];
  }

  async function ensureExportLibraries(needsPdf = false) {
    await loadScriptOnce("html2canvas", "vendor/html2canvas.min.js", "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    if (needsPdf) {
      await loadScriptOnce("jspdf", "vendor/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      if (!window.jspdf?.jsPDF) throw new Error("Knihovna pro PDF není dostupná.");
    }
  }

  async function captureElementCanvas(node, scale = Math.max(2, Math.floor(window.devicePixelRatio || 2)), backgroundColor = null) {
    await ensureExportLibraries(false);

    await nextFrame();

    return window.html2canvas(node, {
      scale: Math.min(3, scale),
      backgroundColor,
      useCORS: true,
      logging: false,
      removeContainer: true,
      imageTimeout: 0,
    });
  }

  function readNumberByRule(key, fallback, isValid) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && isValid(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function getConfig() {
    return {
      commRate: readNumberByRule(CONFIG_KEYS.commRate, DEFAULTS.commRate, (value) => value > 0 && value <= 100),
      baseFull: readNumberByRule(CONFIG_KEYS.baseFull, DEFAULTS.baseFull, (value) => value >= 0),
      baseHalf: readNumberByRule(CONFIG_KEYS.baseHalf, DEFAULTS.baseHalf, (value) => value >= 0),
    };
  }

  // getShiftLabel je v calc.js / window.RBCalc

  function getCashDiffLabel(metrics) {
    if (!metrics.hasCashActual) return "Rozdíl hotovosti";
    if (metrics.cashDiff > 0) return "Dýško";
    if (metrics.cashDiff < 0) return "Chybí hotovost";
    return "Hotovost sedí";
  }

  function getCashDiffClass(metrics) {
    if (!metrics.hasCashActual || metrics.cashDiff >= 0) return "accent-pay";
    return "accent-doplatek";
  }

  function formatCashDiff(metrics) {
    if (metrics.cashDiff > 0) return `+${formatMoney(metrics.cashDiff)}`;
    return formatMoney(metrics.cashDiff);
  }

  function readFormValues() {
    return {
      driver: getText("driverName"),
      shift: getText("shiftType"),
      rz: getText("rz"),
      kmStart: getNumber("kmStart"),
      kmEnd: getNumber("kmEnd"),
      trzba: getNumber("trzba"),
      pristavne: getNumber("pristavne"),
      palivo: getNumber("palivo"),
      myti: getNumber("myti"),
      kartou: getNumber("kartou"),
      fakturou: getNumber("fakturou"),
      jine: getNumber("jine"),
      cashActual: getNumber("cashActual"),
      hasCashActual: getText("cashActual") !== "",
      iacCount: getNumber("iacCount"),
      shkmCount: getNumber("shkmCount"),
    };
  }

  function computeMetrics(values, config) {
    // Deleguje na calc.js, přidává datum pro rendering
    const result = window.RBCalc.computeMetrics(values, config || getConfig());
    result.datum = new Date().toLocaleString("cs-CZ");
    return result;
  }

  function clearErrors() {
    document.querySelectorAll(".input-error").forEach((field) => {
      field.classList.remove("input-error");
      field.removeAttribute("aria-invalid");
      const describedBy = (field.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && !id.endsWith("Error"))
        .join(" ");
      if (describedBy) field.setAttribute("aria-describedby", describedBy);
      else field.removeAttribute("aria-describedby");
    });
    document.querySelectorAll(".field-error-text").forEach((message) => message.remove());
  }

  function setFieldError(id, message = "") {
    const field = document.getElementById(id);
    if (!field) return;
    field.classList.add("input-error");
    field.setAttribute("aria-invalid", "true");
    if (!message) return;

    const error = document.createElement("small");
    error.id = `${id}Error`;
    error.className = "field-error-text";
    error.textContent = message;
    const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    describedBy.add(error.id);
    field.setAttribute("aria-describedby", [...describedBy].join(" "));
    field.insertAdjacentElement("afterend", error);
  }

  function markFieldError(id, message) {
    setFieldError(id, message);
    return message;
  }

  function validate(values) {
    clearErrors();

    if (!values.driver) {
      return markFieldError("driverName", "Vyplň jméno řidiče.");
    }

    if (values.kmStart < 0) {
      return markFieldError("kmStart", "Počáteční km nemohou být záporné.");
    }

    if (values.kmEnd < 0) {
      return markFieldError("kmEnd", "Konečné km nemohou být záporné.");
    }

    if (values.kmEnd < values.kmStart) {
      return markFieldError("kmEnd", "Konečný stav tachometru je menší než počáteční.");
    }

    if (values.trzba <= 0) {
      return markFieldError("trzba", "Tržba musí být větší než 0.");
    }

    if (values.pristavne > 0 && values.pristavne >= values.trzba) {
      return markFieldError("pristavne", "Přístavné je vyšší nebo rovno tržbě — netto by bylo záporné. Zkontroluj zadané hodnoty.");
    }

    for (const id of ["pristavne", "palivo", "myti", "kartou", "fakturou", "jine", "cashActual", "iacCount", "shkmCount"]) {
      if (values[id] < 0) {
        return markFieldError(id, `${FRIENDLY_NAMES[id]} nesmí být záporné.`);
      }
    }

    for (const id of ["iacCount", "shkmCount"]) {
      if (!Number.isInteger(values[id])) {
        return markFieldError(id, `${FRIENDLY_NAMES[id]} musí být celé číslo.`);
      }
    }

    const metrics = computeMetrics(values);
    if (metrics.invoiceKm > metrics.kmReal) {
      const message = `Smluvní km (${formatNumber(metrics.invoiceKm)}) jsou vyšší než najeté km (${formatNumber(metrics.kmReal)}).`;
      setFieldError("iacCount", message);
      setFieldError("shkmCount", message);
      return message;
    }

    return "";
  }

  function focusFirstError() {
    const firstError = document.querySelector(".input-error");
    if (!firstError) return;
    firstError.focus({ preventScroll: true });
    firstError.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }

  function syncKm() {
    const values = readFormValues();
    const kmReal = Math.max(0, values.kmEnd - values.kmStart);
    if (el.kmReal) {
      el.kmReal.value = kmReal ? String(kmReal) : "";
    }
  }


  function setDeltaVisibility(visible) {
    el.liveDeltaCard?.classList.toggle("hidden", !visible);
    el.kpiStrip?.classList.toggle("is-single", !visible);
  }

  function setReportActionsEnabled(enabled) {
    if (el.shareImgBtn) el.shareImgBtn.disabled = !enabled;
    if (el.pdfBtn) el.pdfBtn.disabled = !enabled;
  }

  function setFormCollapsed(collapsed) {
    el.calcShell?.classList.toggle("is-collapsed", collapsed);
  }

  function clearRenderedReport() {
    lastRenderedData = null;
    reportIsStale = false;
    if (el.output) {
      el.output.innerHTML = "";
      el.output.classList.add("hidden");
      el.output.classList.remove("is-stale", "is-revealing");
    }
    el.actions?.classList.add("hidden");
    setReportActionsEnabled(true);
    setFormCollapsed(false);
  }

  function markReportStale() {
    if (!lastRenderedData || reportIsStale) return;
    reportIsStale = true;
    isCalculated = false;
    setDeltaVisibility(false);
    el.output?.classList.add("is-stale");
    setReportActionsEnabled(false);
    showNotice("Údaje ve formuláři se změnily. Hotová výčetka níže je starý snapshot, přepočítej ji.", "bad", {
      label: "Přepočítat",
      onClick: () => el.form?.requestSubmit(),
    });
  }

  function markReportDirty() {
    if (lastRenderedData) {
      markReportStale();
      return;
    }
    isCalculated = false;
    reportIsStale = false;
    setDeltaVisibility(false);
    clearRenderedReport();
  }

  function setHeaderStatus(state, text) {
    if (!el.headerStatus || !el.headerStatusText) return;
    el.headerStatus.classList.remove("is-good", "is-bad", "is-neutral");
    el.headerStatus.classList.add(state);
    el.headerStatusText.textContent = text;
  }

  function setCommandCardTone(state) {
    if (!el.commandStatusCard) return;
    el.commandStatusCard.classList.remove("status-good", "status-bad", "status-neutral");
    el.commandStatusCard.classList.add(state);
  }

  function updateHeroConfig() {
    const config = getConfig();
    if (el.heroComm) el.heroComm.textContent = `${config.commRate} %`;
    if (el.heroFull) el.heroFull.textContent = formatMoney(config.baseFull);
    if (el.heroHalf) el.heroHalf.textContent = formatMoney(config.baseHalf);
  }

  function updateStatus(metrics) {
    const hasData = metrics.kmReal > 0 || metrics.trzba > 0 || metrics.invoiceKm > 0;
    el.liveStatus?.classList.remove("is-good", "is-bad");

    if (!hasData) {
      if (el.liveStatus) el.liveStatus.textContent = "Vyplň údaje směny a přehled se dopočítá automaticky.";
      if (el.heroStatusText) el.heroStatusText.textContent = "Čeká na data směny";
      if (el.liveShiftBadge) el.liveShiftBadge.textContent = "Připraveno";
      if (el.livePayoutMode) el.livePayoutMode.textContent = "Čeká na data";
      setHeaderStatus("is-neutral", "Připraveno k výpočtu");
      setCommandCardTone("status-neutral");
      return;
    }

    if (el.liveShiftBadge) el.liveShiftBadge.textContent = `${metrics.shiftLabel} směna`;
    if (el.livePayoutMode) el.livePayoutMode.textContent = metrics.payoutMode;

    if (!isCalculated) {
      if (el.liveStatus) el.liveStatus.textContent = "Rozdíl vůči minimu se zobrazí až po kliknutí na Vypočítat výčetku.";
      if (el.heroStatusText) el.heroStatusText.textContent = "Čeká na výpočet";
      setHeaderStatus("is-neutral", "Čeká na výpočet");
      setCommandCardTone("status-neutral");
      return;
    }

    if (metrics.delta >= 0) {
      if (el.liveStatus) {
        el.liveStatus.classList.add("is-good");
        el.liveStatus.textContent = `Směna je nad minimem o ${formatMoney(metrics.delta)}.`;
      }
      if (el.heroStatusText) el.heroStatusText.textContent = `Nad minimem o ${formatMoney(metrics.delta)}`;
      setHeaderStatus("is-good", "Směna je nad minimem");
      setCommandCardTone("status-good");
      return;
    }

    if (el.liveStatus) {
      el.liveStatus.classList.add("is-bad");
      el.liveStatus.textContent = `Směna je pod minimem o ${formatMoney(Math.abs(metrics.delta))}.`;
    }
    if (el.heroStatusText) el.heroStatusText.textContent = `Pod minimem o ${formatMoney(Math.abs(metrics.delta))}`;
    setHeaderStatus("is-bad", "Směna je pod minimem");
    setCommandCardTone("status-bad");
  }

  function updateCashCheck(metrics) {
    if (!el.cashCheckStatus) return;
    el.cashCheckStatus.classList.remove("is-good", "is-bad");
    el.cashCheckBreakdown?.classList.toggle("hidden", !metrics.hasCashActual);

    if (!metrics.hasCashActual) {
      el.cashCheckStatus.textContent = "Celou hotovost můžeš nechat prázdnou, kontrola dýška se pak přeskočí.";
      return;
    }

    if (el.cashExpected) el.cashExpected.textContent = formatMoney(metrics.cashExpected);
    if (el.cashActualLive) el.cashActualLive.textContent = formatMoney(metrics.cashActual);
    if (el.cashDiffLive) el.cashDiffLive.textContent = formatCashDiff(metrics);

    if (metrics.cashDiff === 0) {
      el.cashCheckStatus.classList.add("is-good");
      el.cashCheckStatus.textContent = "Celá hotovost sedí na očekávanou částku před oddělením výplaty.";
      return;
    }

    if (metrics.cashDiff > 0) {
      el.cashCheckStatus.classList.add("is-good");
      el.cashCheckStatus.textContent = `Dýško ${formatMoney(metrics.cashDiff)} navíc. Výplatu ani k odevzdání to nemění.`;
      return;
    }

    el.cashCheckStatus.classList.add("is-bad");
    el.cashCheckStatus.textContent = `Hotovost chybí o ${formatMoney(Math.abs(metrics.cashDiff))}.`;
  }

  function updateLivePreview() {
    syncKm();
    const metrics = computeMetrics(readFormValues());

    if (el.liveUctovane) el.liveUctovane.textContent = formatNumber(metrics.chargedKm);
    if (el.liveSmluvni) el.liveSmluvni.textContent = formatNumber(metrics.invoiceKm);
    if (el.liveNetto) el.liveNetto.textContent = formatMoney(metrics.netto);
    if (el.liveDelta) el.liveDelta.textContent = isCalculated ? formatMoney(metrics.delta) : "—";
    setDeltaVisibility(isCalculated);
    if (el.liveGross) el.liveGross.textContent = formatMoney(metrics.trzba);
    if (el.liveNonCash) el.liveNonCash.textContent = formatMoney(metrics.nonCash);
    if (el.liveCosts) el.liveCosts.textContent = formatMoney(metrics.costs);
    if (el.liveDesk) el.liveDesk.textContent = formatMoney(metrics.kOdevzdani);
    if (el.liveSettlement) el.liveSettlement.textContent = formatMoney(metrics.settlement);
    updateCashCheck(metrics);

    updateStatus(metrics);
  }

  function buildReportHtml(metrics) {
    const statusText = metrics.nedoplatek
      ? `Směna je pod minimem. Nutný doplatek ${formatMoney(metrics.doplatek)}.`
      : `Směna je nad minimem o ${formatMoney(metrics.delta)}.`;

    const row = (label, value, options = {}) => {
      const { icon = "icon-doc", className = "", show = true } = options;
      if (!show) return "";
      const iconHtml = icon ? `<svg class="icon"><use href="#${icon}"></use></svg>` : "";
      return `
        <div class="row ${className}">
          <div class="key">${iconHtml}${label}</div>
          <div class="val">${value}</div>
        </div>
      `;
    };

    const contractItems = [];
    if (metrics.iacCount > 0) contractItems.push(`IAC ${formatNumber(metrics.iacCount)}× (${formatNumber(metrics.iacKm)} km)`);
    if (metrics.shkmCount > 0) contractItems.push(`SHKM ${formatNumber(metrics.shkmCount)}× (${formatNumber(metrics.shkmKm)} km)`);

    const safeDriver = escapeHtml(metrics.driver);
    const safeShiftLabel = escapeHtml(metrics.shiftLabel);
    const safeRz = escapeHtml(metrics.rz || "—");
    const safeDatum = escapeHtml(metrics.datum);
    const safePayoutMode = escapeHtml(metrics.payoutMode);
    const safeContracts = escapeHtml(contractItems.join(", "));

    const financeRows = [
      row("Tržba", formatMoney(metrics.trzba), { icon: "icon-cash" }),
      row("Přístavné", formatMoney(metrics.pristavne), { icon: "icon-flag", show: metrics.pristavne > 0 }),
      row("Netto po přístavném", formatMoney(metrics.netto), { icon: "icon-cash" }),
      row("Palivo", formatMoney(metrics.palivo), { icon: "icon-fuel", show: metrics.palivo > 0 }),
      row("Mytí", formatMoney(metrics.myti), { icon: "icon-wash", show: metrics.myti > 0 }),
      row("Kartou", formatMoney(metrics.kartou), { icon: "icon-card", show: metrics.kartou > 0 }),
      row("Fakturou", formatMoney(metrics.fakturou), { icon: "icon-doc", show: metrics.fakturou > 0 }),
      row("Jiné", formatMoney(metrics.jine), { icon: "icon-doc", show: metrics.jine > 0 }),
      row("K odevzdání (hotovost)", formatMoney(metrics.kOdevzdani), { className: "accent-odev", icon: null }),
      row("Má být u sebe (vč. výplaty)", formatMoney(metrics.cashExpected), { icon: "icon-cash", show: metrics.hasCashActual }),
      row("Celá hotovost u sebe", formatMoney(metrics.cashActual), { icon: "icon-cash", show: metrics.hasCashActual }),
      row(getCashDiffLabel(metrics), formatCashDiff(metrics), { className: getCashDiffClass(metrics), icon: null, show: metrics.hasCashActual && metrics.cashDiff !== 0 }),
      row("Výplata řidiče", formatMoney(metrics.vyplata), { className: "accent-pay", icon: null }),
      row("Doplatek řidiče na minimum", formatMoney(metrics.doplatek), { className: "accent-doplatek", icon: null, show: metrics.nedoplatek }),
      row("K odevzdání celkem", formatMoney(metrics.settlement), { className: "accent-grand", icon: null }),
    ].join("");

    return `
      <div class="report-head">
        <div class="report-brand">
          <img src="icon-192.png" alt="RB TAXI" class="report-mark" />
          <div>
            <div class="title">Hotová výčetka</div>
            <div class="subtitle">RB TAXI Hodonín • ${safeDatum}</div>
          </div>
        </div>
        <div class="report-meta">
          <div class="report-badge">Připraveno k odeslání</div>
          <div class="report-status ${metrics.nedoplatek ? "bad" : "good"}">${statusText}</div>
        </div>
      </div>

      <div class="report-total-card ${metrics.nedoplatek ? "is-bad" : "is-good"}">
        <div>
          <div class="report-total-label">K odevzdání celkem</div>
          <div class="report-total-note">hotovost po výplatě${metrics.nedoplatek ? " + doplatek na minimum" : ""}</div>
        </div>
        <div class="report-total-value">${formatMoney(metrics.settlement)}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card cash">
          <div class="small">Tržba</div>
          <div class="big">${formatMoney(metrics.trzba)}</div>
        </div>
        <div class="summary-card pay">
          <div class="small">Výplata</div>
          <div class="big">${formatMoney(metrics.vyplata)}</div>
        </div>
        <div class="summary-card delta">
          <div class="small">Náklady</div>
          <div class="big">${formatMoney(metrics.costs)}</div>
        </div>
        <div class="summary-card ${metrics.nedoplatek ? "doplatek" : "cash"}">
          <div class="small">${metrics.nedoplatek ? "Doplatek" : "K odevzdání"}</div>
          <div class="big">${formatMoney(metrics.nedoplatek ? metrics.doplatek : metrics.kOdevzdani)}</div>
        </div>
      </div>

      <div class="detail-grid">
        <section class="detail-card">
          <div class="detail-title">Směna</div>
          ${row("Řidič", safeDriver, { icon: "icon-user" })}
          ${row("Typ směny", safeShiftLabel, { icon: "icon-clock" })}
          ${row("RZ vozidla", safeRz, { icon: "icon-car" })}
          ${row("Režim výplaty", safePayoutMode, { icon: "icon-cash" })}
        </section>

        <section class="detail-card">
          <div class="detail-title">Kilometry</div>
          ${row("Počáteční km", formatNumber(metrics.kmStart), { icon: "icon-flag" })}
          ${row("Konečné km", formatNumber(metrics.kmEnd), { icon: "icon-flag" })}
          ${row("Najeté km (auto)", formatNumber(metrics.kmReal), { icon: "icon-road" })}
          ${row("Účtované km", formatNumber(metrics.chargedKm), { icon: "icon-road" })}
          ${row("Smluvní jízdy", safeContracts, { icon: "icon-doc", show: contractItems.length > 0 })}
          ${row("KM smluvní", formatNumber(metrics.invoiceKm), { icon: "icon-doc", show: metrics.invoiceKm > 0 })}
        </section>

        <section class="detail-card detail-card-wide">
          <div class="detail-title">Finance</div>
          ${financeRows}
        </section>
      </div>
    `;
  }

  function buildCompactExportHtml(metrics) {
    const statusText = metrics.nedoplatek
      ? `Směna je pod minimem. Doplatek ${formatMoney(metrics.doplatek)}.`
      : `Směna je nad minimem o ${formatMoney(metrics.delta)}.`;

    const safeDriver = escapeHtml(metrics.driver);
    const safeShiftLabel = escapeHtml(metrics.shiftLabel);
    const safeRz = escapeHtml(metrics.rz || "—");
    const safeDatum = escapeHtml(metrics.datum);
    const safePayoutMode = escapeHtml(metrics.payoutMode);

    const metaItem = (label, value) => `
      <div class="share-meta-item">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;

    const kpiItem = (label, value, className = "") => `
      <div class="share-kpi ${className}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;

    return `
      <div class="share-card">
        <div class="share-head">
          <div class="share-brand">
            <img src="icon-192.png" alt="RB TAXI" class="share-mark" />
            <div>
              <div class="share-title">Hotová výčetka</div>
              <div class="share-subtitle">RB TAXI Hodonín • ${safeDatum}</div>
            </div>
          </div>
          <div class="share-status ${metrics.nedoplatek ? "bad" : "good"}">${statusText}</div>
        </div>

        <div class="share-total ${metrics.nedoplatek ? "is-bad" : ""}">
          <div class="share-total-label">K odevzdání celkem</div>
          <div class="share-total-value">${formatMoney(metrics.settlement)}</div>
          <div class="share-total-note">hotovost po výplatě${metrics.nedoplatek ? " + doplatek na minimum" : ""}</div>
        </div>

        <div class="share-grid">
          ${kpiItem("Tržba", formatMoney(metrics.trzba), "cash")}
          ${kpiItem("Výplata", formatMoney(metrics.vyplata), "pay")}
          ${kpiItem("Náklady", formatMoney(metrics.costs), "costs")}
          ${kpiItem(metrics.nedoplatek ? "Doplatek" : "Hotovost", formatMoney(metrics.nedoplatek ? metrics.doplatek : metrics.kOdevzdani), metrics.nedoplatek ? "danger" : "cash")}
        </div>

        <div class="share-meta">
          ${metaItem("Řidič", safeDriver)}
          ${metaItem("Směna", safeShiftLabel)}
          ${metaItem("RZ", safeRz)}
          ${metaItem("Najeté km", formatNumber(metrics.kmReal))}
          ${metaItem("Režim výplaty", safePayoutMode)}
          ${metrics.hasCashActual ? metaItem("Má být u sebe", formatMoney(metrics.cashExpected)) : ""}
          ${metrics.hasCashActual && metrics.cashDiff !== 0 ? metaItem(getCashDiffLabel(metrics), formatCashDiff(metrics)) : ""}
        </div>

        <div class="share-note">
          Netto po přístavném: <strong>${formatMoney(metrics.netto)}</strong>${metrics.invoiceKm > 0 ? ` • KM smluvní: <strong>${formatNumber(metrics.invoiceKm)}</strong>` : ""}
        </div>
      </div>
    `;
  }

  function renderReport(metrics) {
    isCalculated = true;
    reportIsStale = false;
    lastRenderedData = metrics;
    setDeltaVisibility(true);
    if (el.liveDelta) el.liveDelta.textContent = formatMoney(metrics.delta);
    updateStatus(metrics);
    el.output.innerHTML = buildReportHtml(metrics);
    el.output.classList.remove("hidden", "is-stale", "is-revealing");
    void el.output.offsetWidth;
    el.output.classList.add("is-revealing");
    el.actions?.classList.remove("hidden");
    setReportActionsEnabled(true);
    setFormCollapsed(true);
    el.output?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function readDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return draft && typeof draft === "object" ? draft : null;
    } catch {
      return null;
    }
  }

  function saveDraft() {
    const fields = {};
    FIELD_IDS.forEach((id) => {
      const field = document.getElementById(id);
      if (field) fields[id] = field.value;
    });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ fields, savedAt: Date.now() }));
    } catch { /* storage not available (iOS incognito) */ }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* ignore */ }
  }

  function restoreDraft() {
    const draft = readDraft();
    if (!draft?.fields) return;

    let restored = false;
    FIELD_IDS.forEach((id) => {
      const field = document.getElementById(id);
      if (field && Object.prototype.hasOwnProperty.call(draft.fields, id)) {
        field.value = draft.fields[id];
        restored = restored || Boolean(draft.fields[id]);
      }
    });

    if (restored) {
      showNotice("Rozepsaná směna byla obnovena.", "neutral", {
        label: "Vymazat",
        onClick: () => {
          clearDraft();
          resetForm();
          showNotice("Rozepsaná směna je vymazaná.", "good");
        },
      });
    }
  }

  function resetForm(options = {}) {
    const { keepName = false, keepRz = false, keepKmStart = false, clearReport = true } = options;
    const remembered = {
      driver: keepName ? getText("driverName") : "",
      rz: keepRz ? getText("rz") : "",
      kmStart: keepKmStart ? getText("kmEnd") : "",
    };

    el.form?.reset();

    if (remembered.driver) document.getElementById("driverName").value = remembered.driver;
    if (remembered.rz) document.getElementById("rz").value = remembered.rz;
    if (remembered.kmStart) document.getElementById("kmStart").value = remembered.kmStart;

    clearErrors();
    if (clearReport) {
      clearRenderedReport();
    } else {
      markReportDirty();
    }
    updateLivePreview();
  }

  function buildExportClone(mode = "share") {
    if (!lastRenderedData || el.output?.classList.contains("hidden")) {
      throw new Error("Nejdřív vytvoř výčetku.");
    }

    const host = document.createElement("div");
    host.className = "export-capture-host";

    const clone = document.createElement("section");
    clone.id = "exportOutput";
    clone.className = "export-mode";

    if (mode === "share") {
      const exportWidth = Math.max(320, Math.min(430, Math.floor((window.innerWidth || 390) - 24)));
      host.style.width = `${exportWidth}px`;
      clone.style.width = `${exportWidth}px`;
      clone.classList.add("export-share-mode");
      clone.innerHTML = buildCompactExportHtml(lastRenderedData);
      host.appendChild(clone);
      document.body.appendChild(host);
      return { host, clone };
    }

    const exportWidth = 560;
    host.style.width = `${exportWidth}px`;
    clone.style.width = `${exportWidth}px`;
    clone.classList.add("export-share-mode", "export-pdf-mode");
    clone.innerHTML = buildCompactExportHtml(lastRenderedData);
    host.appendChild(clone);
    document.body.appendChild(host);
    return { host, clone };
  }

  function buildExportFilename(ext, suffix = "") {
    const driver = lastRenderedData?.driver || "";
    const safeDriver = driver.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const parts = ["RB-TAXI", safeDriver, dateStr, suffix].filter(Boolean);
    return `${parts.join("-")}.${ext}`;
  }

  async function buildReportImageFile(mode = "share") {
    const { host, clone } = buildExportClone(mode);
    try {
      const scaleBase = mode === "share"
        ? Math.max(2, Math.min(3, Number(window.devicePixelRatio || 2)))
        : Math.max(2, Math.floor(window.devicePixelRatio || 2));
      const canvas = await captureElementCanvas(clone, scaleBase, "#ffffff");
      const blob = await canvasToBlob(canvas, "image/png");
      const filename = buildExportFilename("png", mode === "share" ? "mobile" : "");
      const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
      return { blob, file, filename, canvas };
    } finally {
      host.remove();
    }
  }

  async function shareReportImage() {
    if (reportIsStale) throw new Error("Údaje se změnily. Nejdřív výčetku přepočítej.");
    const { blob, file, filename } = await buildReportImageFile("share");

    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Výčetka",
        text: "RB TAXI – Hotová výčetka",
      });
      return { shared: true, downloaded: false };
    }

    triggerBlobDownload(blob, filename);
    return { shared: false, downloaded: true };
  }

  async function exportPdf() {
    if (reportIsStale) throw new Error("Údaje se změnily. Nejdřív výčetku přepočítej.");
    await ensureExportLibraries(true);

    const { canvas } = await buildReportImageFile("pdf");
    const img = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const margin = 28;
    const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const renderHeight = canvas.height * (pageWidth / canvas.width);
    const fittedHeight = Math.min(renderHeight, pageHeight);
    const y = margin + Math.max(0, (pageHeight - fittedHeight) / 2);
    pdf.addImage(img, "PNG", margin, y, pageWidth, fittedHeight);
    pdf.save(buildExportFilename("pdf"));
  }

  function updateThemeButton() {
    if (!el.themeToggle) return;
    const isLight = document.body.classList.contains("light-mode");
    el.themeToggle.innerHTML = isLight
      ? '<svg class="icon"><use href="#icon-moon"></use></svg>'
      : '<svg class="icon"><use href="#icon-sun"></use></svg>';
    el.themeToggle.title = isLight ? "Přepnout na tmavý režim" : "Přepnout na světlý režim";
  }

  function initTheme() {
    let savedTheme = DEFAULTS.theme;
    try { savedTheme = localStorage.getItem(CONFIG_KEYS.theme) || DEFAULTS.theme; } catch { /* ignore */ }
    document.body.classList.toggle("light-mode", savedTheme === "light");
    updateThemeButton();

    el.themeToggle?.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-mode");
      try { localStorage.setItem(CONFIG_KEYS.theme, isLight ? "light" : "dark"); } catch { /* ignore */ }
      updateThemeButton();
    });
  }

  async function runExportSelfTest() {
    await ensureExportLibraries(true);

    const node = document.createElement("div");
    node.style.cssText = "position:fixed;left:-10000px;top:0;width:240px;padding:12px;background:#fff;color:#111;font-family:Arial,sans-serif";
    node.textContent = "RB TAXI export test";
    document.body.appendChild(node);

    try {
      const canvas = await captureElementCanvas(node, 1, "#ffffff");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 20, 20, 200, 80);
      const pdfBlob = pdf.output("blob");
      if (!canvas.width || !canvas.height || pdfBlob.size < 1000) {
        throw new Error("Exportní test nevytvořil platný obrázek nebo PDF.");
      }
    } finally {
      node.remove();
    }
  }

  async function resetAppCachesAndReload() {
    if (!confirm("Načíst nejnovější verzi aplikace? Vymaže se jen aplikační cache, uložené nastavení výpočtu zůstane.")) return;

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const appScope = new URL("./", window.location.href).href;
      await Promise.all(registrations
        .filter((registration) => registration.scope === appScope)
        .map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX))
        .map((key) => caches.delete(key)));
    }

    window.location.reload();
  }

  function initSettings() {
    const getModalFocusables = () => Array.from(el.settingsModal?.querySelectorAll(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    ) || []).filter((node) => !node.disabled && node.offsetParent !== null);

    const closeSettings = () => {
      el.settingsModal?.classList.add("hidden");
      el.settingsModal?.setAttribute("aria-hidden", "true");
      lastFocusedBeforeSettings?.focus?.();
      lastFocusedBeforeSettings = null;
    };

    const openSettings = () => {
      const config = getConfig();
      lastFocusedBeforeSettings = document.activeElement;
      if (el.setComm) el.setComm.value = String(config.commRate);
      if (el.setFull) el.setFull.value = String(config.baseFull);
      if (el.setHalf) el.setHalf.value = String(config.baseHalf);
      const rzTextarea = document.getElementById("setRzList");
      if (rzTextarea) rzTextarea.value = getRzList().join("\n");
      el.settingsModal?.classList.remove("hidden");
      el.settingsModal?.setAttribute("aria-hidden", "false");
      el.setComm?.focus();
    };

    el.settingsBtn?.addEventListener("click", openSettings);

    el.closeSettingsBtn?.addEventListener("click", () => {
      closeSettings();
    });

    el.exportSelfTestBtn?.addEventListener("click", async () => {
      try {
        el.exportSelfTestBtn.disabled = true;
        showNotice("Testuji exportní knihovny...", "neutral");
        await runExportSelfTest();
        showNotice("Export je připravený. Obrázek i PDF knihovna fungují.", "good");
      } catch (error) {
        showNotice(`Exportní test selhal: ${error.message || error}`, "bad");
      } finally {
        el.exportSelfTestBtn.disabled = false;
      }
    });

    el.resetAppBtn?.addEventListener("click", async () => {
      try {
        el.resetAppBtn.disabled = true;
        await resetAppCachesAndReload();
      } catch (error) {
        el.resetAppBtn.disabled = false;
        showNotice(`Načtení nejnovější verze selhalo: ${error.message || error}`, "bad");
      }
    });

    el.saveSettingsBtn?.addEventListener("click", () => {
      const commRate = getNumber("setComm");
      const baseFull = getNumber("setFull");
      const baseHalf = getNumber("setHalf");

      if (commRate <= 0 || commRate > 100 || baseFull < 0 || baseHalf < 0) {
        showNotice("Zkontroluj nastavení. Provize musí být 1–100 % a fixy nesmí být záporné.", "bad");
        return;
      }

      // RZ seznam z textarea
      const rzTextarea = document.getElementById("setRzList");
      if (rzTextarea) {
        const lines = rzTextarea.value.split("\n").map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (lines.length > 0) {
          saveRzList(lines);
          rebuildRzSelect();
        }
      }

      try {
        localStorage.setItem(CONFIG_KEYS.commRate, String(commRate));
        localStorage.setItem(CONFIG_KEYS.baseFull, String(baseFull));
        localStorage.setItem(CONFIG_KEYS.baseHalf, String(baseHalf));
      } catch { /* iOS incognito — pokračuj, výpočet funguje z paměti */ }

      closeSettings();
      markReportDirty();
      updateHeroConfig();
      updateLivePreview();
      showNotice("Nastavení výpočtu je uložené.", "good");
    });

    el.settingsModal?.addEventListener("click", (event) => {
      if (event.target === el.settingsModal) {
        closeSettings();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (el.settingsModal?.classList.contains("hidden")) return;
      if (event.key === "Escape") {
        closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getModalFocusables();
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function isIosLike() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalonePwa() {
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function initPwaPrompt() {
    if (window.location.protocol === "file:") return;

    const iosInstallHelp = isIosLike() && !isStandalonePwa();
    if (iosInstallHelp) {
      if (el.installText) el.installText.textContent = "Na iPhonu/iPadu se aplikace přidává přes Safari.";
      el.pwaIosHelp?.classList.remove("hidden");
      if (el.installPwaBtn) el.installPwaBtn.textContent = "Jak přidat";
      el.pwaBanner?.classList.remove("hidden");
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      el.pwaBanner?.classList.remove("hidden");
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      el.pwaBanner?.classList.add("hidden");
    });

    el.installPwaBtn?.addEventListener("click", async () => {
      if (!deferredPrompt) {
        showNotice("Na iPhonu otevři aplikaci v Safari, klepni na Sdílet a zvol Přidat na plochu.", "neutral");
        return;
      }
      el.pwaBanner?.classList.add("hidden");
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  }

  function initConnectivity() {
    if (!el.networkStatus) return;
    const update = (announce = false) => {
      const online = navigator.onLine !== false;
      el.networkStatus.classList.toggle("is-online", online);
      el.networkStatus.classList.toggle("is-offline", !online);
      const text = el.networkStatus.querySelector("span:last-child");
      if (text) text.textContent = online ? "Online" : "Offline";
      if (announce) {
        showNotice(online ? "Jsme online." : "Offline režim. Výpočet funguje, export může být omezený.", online ? "good" : "bad");
      }
    };
    update(false);
    window.addEventListener("online", () => update(true));
    window.addEventListener("offline", () => update(true));
  }


  function initKeyboardGuard() {
    const keyboardTarget = "input, select, textarea";
    const visualViewport = window.visualViewport;
    const isAndroid = /Android/i.test(navigator.userAgent);
    document.body.classList.toggle("android-keyboard", isAndroid);
    let frameId = 0;
    let lastKeyboardInset = -1;
    let lastKeyboardOpen = false;
    let baselineViewportHeight = Math.max(window.innerHeight, visualViewport?.height || 0);

    const getViewportHeight = () => visualViewport?.height || window.innerHeight;
    const getFocusedInput = () => {
      const active = document.activeElement;
      return active?.matches?.(keyboardTarget) ? active : null;
    };
    const updateBaseline = () => {
      baselineViewportHeight = Math.max(window.innerHeight, getViewportHeight(), baselineViewportHeight);
    };

    const applyKeyboardState = () => {
      frameId = 0;
      const activeInput = getFocusedInput();
      const viewportHeight = getViewportHeight();
      const viewportOffsetTop = visualViewport?.offsetTop || 0;

      if (!activeInput) updateBaseline();

      const keyboardInset = activeInput
        ? Math.max(0, Math.round(baselineViewportHeight - viewportHeight - viewportOffsetTop))
        : 0;
      const keyboardOpen = Boolean(activeInput && keyboardInset > 90);

      if (keyboardInset === lastKeyboardInset && keyboardOpen === lastKeyboardOpen) return;
      lastKeyboardInset = keyboardInset;
      lastKeyboardOpen = keyboardOpen;

      document.body.classList.toggle("keyboard-open", keyboardOpen);
      document.documentElement.style.setProperty("--keyboard-inset", (keyboardOpen ? keyboardInset : 0) + "px");
    };

    const scheduleKeyboardState = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(applyKeyboardState);
    };

    const keepFocusedFieldVisible = () => {
      const active = getFocusedInput();
      if (!active) return;

      window.setTimeout(() => {
        const currentActive = getFocusedInput();
        if (!currentActive) return;

        const rect = currentActive.getBoundingClientRect();
        const viewportHeight = getViewportHeight();
        const topLimit = 88;
        const bottomLimit = Math.max(180, viewportHeight - (isAndroid ? 28 : 132));
        const needsScroll = rect.top < topLimit || rect.bottom > bottomLimit;

        if (!needsScroll) return;

        if (isAndroid) {
          const delta = rect.bottom > bottomLimit
            ? rect.bottom - bottomLimit
            : rect.top - topLimit;
          if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "auto" });
          return;
        }

        currentActive.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }, isAndroid ? 420 : 300);
    };

    visualViewport?.addEventListener("resize", scheduleKeyboardState, { passive: true });
    visualViewport?.addEventListener("scroll", scheduleKeyboardState, { passive: true });
    window.addEventListener("resize", scheduleKeyboardState, { passive: true });
    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => {
        baselineViewportHeight = Math.max(window.innerHeight, getViewportHeight());
        lastKeyboardInset = -1;
        scheduleKeyboardState();
      }, 450);
    }, { passive: true });

    document.addEventListener("focusin", (event) => {
      if (!event.target?.matches?.(keyboardTarget)) return;
      updateBaseline();
      scheduleKeyboardState();
      window.setTimeout(scheduleKeyboardState, 260);
      keepFocusedFieldVisible();
    });

    document.addEventListener("focusout", () => {
      window.setTimeout(() => {
        baselineViewportHeight = Math.max(window.innerHeight, getViewportHeight());
        scheduleKeyboardState();
      }, 220);
    });

    scheduleKeyboardState();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const allowedProtocol = window.location.protocol === "https:" || (window.location.protocol === "http:" && isLocalhost);
    if (!allowedProtocol) return;

    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./service-worker.js");
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showNotice("Je dostupná nová verze aplikace.", "neutral", {
                label: "Načíst",
                onClick: resetAppCachesAndReload,
              });
            }
          });
        });
        await registration.update();
      } catch (error) {
        console.error("Service worker registration failed:", error);
      }
    });
  }

  function bindEvents() {
    el.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = readFormValues();
      const validationError = validate(values);

      if (validationError) {
        showNotice(validationError, "bad");
        focusFirstError();
        return;
      }

      hapticFeedback(18);
      clearNotice();
      const metrics = computeMetrics(values);
      renderReport(metrics);
      clearDraft();
      showNotice("Výčetka je hotová a připravená k exportu.", "good");
    });

    FIELD_IDS.forEach((id) => {
      const field = document.getElementById(id);
      field?.addEventListener("input", () => {
        markReportDirty();
        if (!lastRenderedData) clearNotice();
        saveDraft();
        updateLivePreview();
      });
      field?.addEventListener("change", () => {
        markReportDirty();
        if (!lastRenderedData) clearNotice();
        saveDraft();
        updateLivePreview();
      });
    });

    el.resetBtn?.addEventListener("click", () => {
      hapticFeedback(10);
      clearDraft();
      resetForm({ keepName: true });
    });

    el.editShiftBtn?.addEventListener("click", () => {
      setFormCollapsed(false);
      el.calcShell?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (reportIsStale) {
        showNotice("Uprav údaje a znovu klikni na Vypočítat výčetku.", "bad");
      }
    });

    el.newShiftBtn?.addEventListener("click", () => {
      hapticFeedback(10);
      resetForm({ keepName: true, keepRz: true, keepKmStart: true });
      saveDraft();
    });

    el.shareImgBtn?.addEventListener("click", async () => {
      try {
        el.shareImgBtn.disabled = true;
        hapticFeedback(12);
        showNotice("Připravuji obrázek výčetky...", "neutral");
        const result = await shareReportImage();
        showNotice(result.downloaded
          ? "Sdílení souboru není na tomto zařízení dostupné. Obrázek výčetky se stáhl."
          : "Výčetka byla předaná do sdílení.", "good");
      } catch (error) {
        if (error?.name === "AbortError") return;
        showNotice(`Sdílení obrázku selhalo: ${error.message || error}`, "bad");
      } finally {
        if (!reportIsStale) el.shareImgBtn.disabled = false;
      }
    });

    el.pdfBtn?.addEventListener("click", async () => {
      try {
        el.pdfBtn.disabled = true;
        hapticFeedback(12);
        showNotice("Připravuji PDF výčetky...", "neutral");
        await exportPdf();
        showNotice("PDF výčetky se stáhlo do zařízení.", "good");
      } catch (error) {
        showNotice(`Export do PDF selhal: ${error.message || error}`, "bad");
      } finally {
        if (!reportIsStale) el.pdfBtn.disabled = false;
      }
    });
  }

  initTheme();
  initSettings();
  initPwaPrompt();
  initConnectivity();
  initKeyboardGuard();
  registerServiceWorker();
  if (el.appVersion) el.appVersion.textContent = `Verze ${VERSION}`;
  rebuildRzSelect();
  updateHeroConfig();
  restoreDraft();
  bindEvents();
  updateLivePreview();
});
