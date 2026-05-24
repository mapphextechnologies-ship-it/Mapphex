(() => {
  "use strict";

  const SETTINGS_KEY = "mapphex_finance_settings_v1";
  const DEFAULTS = {
    theme: "dark",
    compactTables: false,
    currency: "KES",
    paymentMethod: "M-Pesa",
    supplierApproval: true,
    payrollApproval: true,
    notifyHr: true,
    reportPeriod: "This month",
    exportFormat: "Excel",
  };

  const $ = (selector) => document.querySelector(selector);

  const readSettings = () => {
    try {
      const stored = window.MapphexFinanceDB?.readMemory?.(SETTINGS_KEY, null);
      return { ...DEFAULTS, ...(stored && typeof stored === "object" ? stored : {}) };
    } catch {
      return { ...DEFAULTS };
    }
  };

  const writeSettings = (settings) => {
    window.MapphexFinanceDB?.writeMemory?.(SETTINGS_KEY, settings);
    window.MapphexFinanceDB?.write?.(SETTINGS_KEY, settings);
  };

  const setControlValue = (control, value) => {
    if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value ?? "");
  };

  const formSettings = (form) => {
    const settings = { ...DEFAULTS };
    Object.keys(settings).forEach((name) => {
      const control = form.elements[name];
      if (!control) return;
      settings[name] = control.type === "checkbox" ? control.checked : control.value;
    });
    return settings;
  };

  const updateSummary = (settings) => {
    if ($("[data-theme-summary]")) $("[data-theme-summary]").textContent = settings.theme === "light" ? "Light" : "Dark";
    if ($("[data-currency-summary]")) $("[data-currency-summary]").textContent = settings.currency;
    if ($("[data-approval-summary]")) $("[data-approval-summary]").textContent = settings.supplierApproval || settings.payrollApproval ? "Required" : "Optional";
    if ($("[data-report-summary]")) $("[data-report-summary]").textContent = settings.reportPeriod.replace("This ", "");
  };

  const applySettings = (settings) => {
    window.MapphexFinanceDB?.applyPreferences?.(settings);
    updateSummary(settings);
  };

  const populateForm = (form, settings) => {
    Object.keys(DEFAULTS).forEach((name) => {
      const control = form.elements[name];
      if (control) setControlValue(control, settings[name]);
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("[data-menu-button]")?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    $("[data-close-sidebar]")?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    const org = new URLSearchParams(location.search).get("org") || new URLSearchParams(location.search).get("tenant");
    if (org) $("[data-org-name]").textContent = org;

    const form = $("[data-finance-settings-form]");
    const note = $("[data-settings-save-note]");
    if (!form) return;

    const settings = readSettings();
    populateForm(form, settings);
    applySettings(settings);

    form.addEventListener("input", () => {
      const next = formSettings(form);
      applySettings(next);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const next = formSettings(form);
      writeSettings(next);
      applySettings(next);
      if (note) {
        note.textContent = "Finance settings saved.";
        window.setTimeout(() => {
          note.textContent = "";
        }, 2200);
      }
    });

    $("[data-reset-settings]")?.addEventListener("click", () => {
      const defaults = { ...DEFAULTS };
      writeSettings(defaults);
      populateForm(form, defaults);
      applySettings(defaults);
      if (note) {
        note.textContent = "Finance settings reset.";
        window.setTimeout(() => {
          note.textContent = "";
        }, 2200);
      }
    });
  });
})();
